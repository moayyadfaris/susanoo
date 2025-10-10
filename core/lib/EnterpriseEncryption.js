const crypto = require('crypto')
const logger = require('../../util/logger')

/**
 * EnterpriseEncryption - Field-level encryption service
 * 
 * Features:
 * - AES-256-GCM encryption for maximum security
 * - Key rotation and management
 * - PII field encryption
 * - Transparent encryption/decryption
 * - GDPR compliance utilities
 * 
 * @version 1.0.0
 */
class EnterpriseEncryption {
  constructor(config = {}) {
    this.config = {
      algorithm: config.algorithm || 'aes-256-gcm',
      keySize: config.keySize || 32, // 256 bits
      ivSize: config.ivSize || 16,   // 128 bits
      tagSize: config.tagSize || 16, // 128 bits
      masterKey: config.masterKey || process.env.ENCRYPTION_MASTER_KEY,
      keyRotationDays: config.keyRotationDays || 90,
      ...config
    }
    
    if (!this.config.masterKey) {
      throw new Error('Master encryption key is required')
    }
    
    this.keys = new Map() // Key cache
    this.currentKeyId = this._generateKeyId()
  }

  /**
   * Generate a new encryption key ID
   */
  _generateKeyId() {
    return `key_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`
  }

  /**
   * Derive encryption key from master key and key ID
   */
  _deriveKey(keyId) {
    if (this.keys.has(keyId)) {
      return this.keys.get(keyId)
    }
    
    const key = crypto.pbkdf2Sync(
      this.config.masterKey,
      keyId,
      100000, // iterations
      this.config.keySize,
      'sha256'
    )
    
    this.keys.set(keyId, key)
    return key
  }

  /**
   * Encrypt a value
   */
  encrypt(value, keyId = null) {
    if (value === null || value === undefined || value === '') {
      return value
    }
    
    try {
      const activeKeyId = keyId || this.currentKeyId
      const key = this._deriveKey(activeKeyId)
      const iv = crypto.randomBytes(this.config.ivSize)
      
      const cipher = crypto.createCipher(this.config.algorithm, key, { iv })
      
      let encrypted = cipher.update(String(value), 'utf8', 'hex')
      encrypted += cipher.final('hex')
      
      const tag = cipher.getAuthTag()
      
      // Format: keyId:iv:tag:encrypted
      const result = `${activeKeyId}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
      
      logger.debug('Value encrypted successfully', {
        keyId: activeKeyId,
        originalLength: String(value).length,
        encryptedLength: result.length
      })
      
      return result
      
    } catch (error) {
      logger.error('Encryption failed', { error: error.message })
      throw new Error('Encryption failed')
    }
  }

  /**
   * Decrypt a value
   */
  decrypt(encryptedValue) {
    if (!encryptedValue || typeof encryptedValue !== 'string') {
      return encryptedValue
    }
    
    // Check if value is actually encrypted (contains our format)
    if (!encryptedValue.includes(':')) {
      return encryptedValue
    }
    
    try {
      const parts = encryptedValue.split(':')
      if (parts.length !== 4) {
        throw new Error('Invalid encrypted value format')
      }
      
      const [keyId, ivHex, tagHex, encrypted] = parts
      
      const key = this._deriveKey(keyId)
      const iv = Buffer.from(ivHex, 'hex')
      const tag = Buffer.from(tagHex, 'hex')
      
      const decipher = crypto.createDecipher(this.config.algorithm, key, { iv })
      decipher.setAuthTag(tag)
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      
      logger.debug('Value decrypted successfully', {
        keyId,
        encryptedLength: encryptedValue.length,
        decryptedLength: decrypted.length
      })
      
      return decrypted
      
    } catch (error) {
      logger.error('Decryption failed', { 
        error: error.message,
        encryptedValue: encryptedValue.substring(0, 50) + '...'
      })
      throw new Error('Decryption failed')
    }
  }

  /**
   * Encrypt PII fields in an object
   */
  encryptPIIFields(data, piiFields = []) {
    if (!data || typeof data !== 'object') {
      return data
    }
    
    const encryptedData = { ...data }
    
    for (const field of piiFields) {
      if (encryptedData[field] && encryptedData[field] !== '') {
        encryptedData[field] = this.encrypt(encryptedData[field])
        
        // Mark field as encrypted in metadata
        if (!encryptedData.metadata) {
          encryptedData.metadata = {}
        }
        if (!encryptedData.metadata.encrypted_fields) {
          encryptedData.metadata.encrypted_fields = []
        }
        if (!encryptedData.metadata.encrypted_fields.includes(field)) {
          encryptedData.metadata.encrypted_fields.push(field)
        }
      }
    }
    
    return encryptedData
  }

  /**
   * Decrypt PII fields in an object
   */
  decryptPIIFields(data, piiFields = []) {
    if (!data || typeof data !== 'object') {
      return data
    }
    
    const decryptedData = { ...data }
    
    // Check if any fields are marked as encrypted
    const encryptedFields = data.metadata?.encrypted_fields || piiFields
    
    for (const field of encryptedFields) {
      if (decryptedData[field] && decryptedData[field] !== '') {
        try {
          decryptedData[field] = this.decrypt(decryptedData[field])
        } catch (error) {
          logger.warn(`Failed to decrypt field: ${field}`, { error: error.message })
          // Keep encrypted value if decryption fails
        }
      }
    }
    
    return decryptedData
  }

  /**
   * Anonymize PII fields for GDPR compliance
   */
  anonymizePIIFields(data, piiFields = []) {
    if (!data || typeof data !== 'object') {
      return data
    }
    
    const anonymizedData = { ...data }
    
    for (const field of piiFields) {
      if (anonymizedData[field]) {
        anonymizedData[field] = this._anonymizeValue(anonymizedData[field], field)
      }
    }
    
    // Add anonymization metadata
    if (!anonymizedData.metadata) {
      anonymizedData.metadata = {}
    }
    anonymizedData.metadata.gdpr_anonymized = true
    anonymizedData.metadata.anonymized_at = new Date().toISOString()
    anonymizedData.metadata.anonymized_fields = piiFields
    
    return anonymizedData
  }

  /**
   * Anonymize a single value based on field type
   */
  _anonymizeValue(value, fieldName) {
    if (!value || value === '') {
      return value
    }
    
    const valueStr = String(value)
    
    // Email anonymization
    if (fieldName.toLowerCase().includes('email') || valueStr.includes('@')) {
      const [, domain] = valueStr.split('@')
      return `***@${domain || 'example.com'}`
    }
    
    // Phone number anonymization
    if (fieldName.toLowerCase().includes('mobile') || fieldName.toLowerCase().includes('phone')) {
      const digits = valueStr.replace(/\D/g, '')
      if (digits.length >= 4) {
        return `***${digits.slice(-4)}`
      }
      return '***'
    }
    
    // Name anonymization
    if (fieldName.toLowerCase().includes('name')) {
      return valueStr.charAt(0) + '*'.repeat(Math.max(0, valueStr.length - 1))
    }
    
    // Address anonymization
    if (fieldName.toLowerCase().includes('address')) {
      return '[REDACTED ADDRESS]'
    }
    
    // Default anonymization
    return '[REDACTED]'
  }

  /**
   * Rotate encryption keys
   */
  rotateKeys() {
    const oldKeyId = this.currentKeyId
    this.currentKeyId = this._generateKeyId()
    
    logger.info('Encryption key rotated', {
      oldKeyId,
      newKeyId: this.currentKeyId
    })
    
    return {
      oldKeyId,
      newKeyId: this.currentKeyId
    }
  }

  /**
   * Re-encrypt data with new key
   */
  reencryptWithNewKey(encryptedValue, newKeyId = null) {
    if (!encryptedValue || typeof encryptedValue !== 'string') {
      return encryptedValue
    }
    
    try {
      // Decrypt with old key
      const decryptedValue = this.decrypt(encryptedValue)
      
      // Encrypt with new key
      return this.encrypt(decryptedValue, newKeyId || this.currentKeyId)
      
    } catch (error) {
      logger.error('Re-encryption failed', { error: error.message })
      throw error
    }
  }

  /**
   * Hash a value for searching (one-way)
   */
  hash(value) {
    if (value === null || value === undefined || value === '') {
      return value
    }
    
    return crypto
      .createHash('sha256')
      .update(String(value))
      .digest('hex')
  }

  /**
   * Create searchable hash for encrypted field
   */
  createSearchableHash(value) {
    if (value === null || value === undefined || value === '') {
      return value
    }
    
    // Use HMAC for better security than plain hash
    return crypto
      .createHmac('sha256', this.config.masterKey)
      .update(String(value).toLowerCase().trim())
      .digest('hex')
  }

  /**
   * Generate secure random token
   */
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex')
  }

  /**
   * Check if encryption is needed for field
   */
  isEncryptionRequired(fieldName, fieldConfig = {}) {
    return fieldConfig.encrypted === true || 
           fieldConfig.pii === true ||
           this._isPIIField(fieldName)
  }

  /**
   * Check if field contains PII data
   */
  _isPIIField(fieldName) {
    const piiPatterns = [
      'email', 'phone', 'mobile', 'name', 'address', 
      'ssn', 'passport', 'license', 'card', 'account'
    ]
    
    const lowerFieldName = fieldName.toLowerCase()
    return piiPatterns.some(pattern => lowerFieldName.includes(pattern))
  }

  /**
   * Get encryption statistics
   */
  getStats() {
    return {
      currentKeyId: this.currentKeyId,
      totalKeys: this.keys.size,
      algorithm: this.config.algorithm,
      keySize: this.config.keySize,
      keyRotationDays: this.config.keyRotationDays
    }
  }

  /**
   * Clear key cache (for memory management)
   */
  clearKeyCache() {
    const clearedKeys = this.keys.size
    this.keys.clear()
    
    logger.info('Encryption key cache cleared', { clearedKeys })
    
    return clearedKeys
  }
}

module.exports = EnterpriseEncryption