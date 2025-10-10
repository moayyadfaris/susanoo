const joi = require('joi')
const { BaseModel } = require('./BaseModel')

/**
 * ValidatedModel - Enhanced base model with enterprise validation
 * 
 * Features:
 * - Advanced validation with context awareness
 * - Field-level encryption support
 * - Sanitization and normalization
 * - Cross-field validation
 * - Async validation support
 * - GDPR compliance utilities
 * 
 * @extends BaseModel
 * @version 1.0.0
 */
class ValidatedModel extends BaseModel {
  /**
   * Enhanced Rule class with enterprise features
   */
  static Rule = class EnterpriseRule {
    constructor(options = {}) {
      this.validator = options.validator
      this.description = options.description
      this.encrypted = options.encrypted || false
      this.pii = options.pii || false // Personally Identifiable Information
      this.sanitizer = options.sanitizer || null
      this.normalizer = options.normalizer || null
      this.asyncValidator = options.asyncValidator || null
      this.required = options.required || false
      this.conditional = options.conditional || null // Function that determines if field is required
      this.crossFieldValidator = options.crossFieldValidator || null
      this.gdprCategory = options.gdprCategory || null // For GDPR compliance
    }

    /**
     * Validate value with context
     */
    async validate(value, context = {}, allData = {}) {
      const results = {
        isValid: true,
        errors: [],
        sanitizedValue: value,
        normalizedValue: value
      }

      // Check if field is required based on conditions
      if (this.conditional && this.conditional(allData, context)) {
        this.required = true
      }

      // Required validation
      if (this.required && (value === null || value === undefined || value === '')) {
        results.isValid = false
        results.errors.push('Field is required')
        return results
      }

      // Skip other validations if value is null/undefined and not required
      if ((value === null || value === undefined) && !this.required) {
        return results
      }

      // Sanitization
      if (this.sanitizer && typeof this.sanitizer === 'function') {
        try {
          results.sanitizedValue = this.sanitizer(value)
          value = results.sanitizedValue
        } catch (error) {
          results.isValid = false
          results.errors.push(`Sanitization failed: ${error.message}`)
        }
      }

      // Normalization
      if (this.normalizer && typeof this.normalizer === 'function') {
        try {
          results.normalizedValue = this.normalizer(value)
          value = results.normalizedValue
        } catch (error) {
          results.isValid = false
          results.errors.push(`Normalization failed: ${error.message}`)
        }
      }

      // Sync validation
      if (this.validator && typeof this.validator === 'function') {
        try {
          const validationResult = this.validator(value, context, allData)
          if (validationResult !== true) {
            results.isValid = false
            results.errors.push(validationResult)
          }
        } catch (error) {
          results.isValid = false
          results.errors.push(`Validation failed: ${error.message}`)
        }
      }

      // Async validation
      if (this.asyncValidator && typeof this.asyncValidator === 'function') {
        try {
          const asyncResult = await this.asyncValidator(value, context, allData)
          if (asyncResult !== true) {
            results.isValid = false
            results.errors.push(asyncResult)
          }
        } catch (error) {
          results.isValid = false
          results.errors.push(`Async validation failed: ${error.message}`)
        }
      }

      // Cross-field validation
      if (this.crossFieldValidator && typeof this.crossFieldValidator === 'function') {
        try {
          const crossFieldResult = this.crossFieldValidator(value, allData, context)
          if (crossFieldResult !== true) {
            results.isValid = false
            results.errors.push(crossFieldResult)
          }
        } catch (error) {
          results.isValid = false
          results.errors.push(`Cross-field validation failed: ${error.message}`)
        }
      }

      return results
    }
  }

  /**
   * Common enterprise validation rules
   */
  static get commonRules() {
    return {
      // Enhanced ID validation
      uuid: new this.Rule({
        validator: (v) => {
          try {
            joi.assert(v, joi.string().uuid({ version: 'uuidv4' }))
            return true
          } catch (e) {
            return e.message
          }
        },
        description: 'UUID v4 format'
      }),

      // Enhanced email validation
      email: new this.Rule({
        validator: (v) => {
          try {
            joi.assert(v, joi.string().email().max(254).lowercase())
            return true
          } catch (e) {
            return e.message
          }
        },
        normalizer: (v) => v ? v.toLowerCase().trim() : v,
        sanitizer: (v) => v ? v.replace(/[<>]/g, '') : v,
        pii: true,
        gdprCategory: 'contact_info',
        description: 'Valid email address, max 254 chars'
      }),

      // Enhanced phone number validation
      phoneNumber: new this.Rule({
        validator: (v) => {
          try {
            // Remove all non-digit characters for validation
            const cleaned = v.replace(/\D/g, '')
            joi.assert(cleaned, joi.string().min(10).max(15))
            return true
          } catch (e) {
            return e.message
          }
        },
        normalizer: (v) => v ? v.replace(/\D/g, '') : v,
        pii: true,
        gdprCategory: 'contact_info',
        description: 'Phone number, 10-15 digits'
      }),

      // Enhanced password validation
      password: new this.Rule({
        validator: (v) => {
          try {
            joi.assert(v, joi.string()
              .min(8)
              .max(128)
              .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            )
            return true
          } catch (e) {
            return 'Password must be 8-128 chars with uppercase, lowercase, number, and special character'
          }
        },
        encrypted: true,
        description: 'Strong password with mixed case, numbers, and special characters'
      }),

      // Enhanced name validation
      name: new this.Rule({
        validator: (v) => {
          try {
            joi.assert(v, joi.string().min(1).max(100).pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/))
            return true
          } catch (e) {
            return 'Name must be 1-100 chars, letters, spaces, hyphens, and apostrophes only'
          }
        },
        normalizer: (v) => v ? v.trim().replace(/\s+/g, ' ') : v,
        sanitizer: (v) => v ? v.replace(/[<>]/g, '') : v,
        pii: true,
        gdprCategory: 'personal_info',
        description: 'Person name, letters and common punctuation only'
      }),

      // Enhanced timestamp validation
      timestamp: new this.Rule({
        validator: (v) => {
          if (v === null || v === undefined) return true
          try {
            const date = new Date(v)
            if (isNaN(date.getTime())) return 'Invalid timestamp'
            return true
          } catch (e) {
            return 'Invalid timestamp format'
          }
        },
        normalizer: (v) => v ? new Date(v).toISOString() : v,
        description: 'ISO timestamp or Date object'
      }),

      // Enhanced JSON validation
      jsonObject: new this.Rule({
        validator: (v) => {
          if (v === null || v === undefined) return true
          if (typeof v === 'object' && !Array.isArray(v)) return true
          return 'Must be a valid JSON object'
        },
        description: 'Valid JSON object'
      }),

      // URL validation
      url: new this.Rule({
        validator: (v) => {
          try {
            joi.assert(v, joi.string().uri())
            return true
          } catch (e) {
            return 'Must be a valid URL'
          }
        },
        sanitizer: (v) => v ? v.trim() : v,
        description: 'Valid URL format'
      }),

      // Currency amount validation
      currencyAmount: new this.Rule({
        validator: (v) => {
          try {
            joi.assert(v, joi.number().precision(2).min(0))
            return true
          } catch (e) {
            return 'Must be a positive number with max 2 decimal places'
          }
        },
        normalizer: (v) => v !== null && v !== undefined ? parseFloat(parseFloat(v).toFixed(2)) : v,
        description: 'Currency amount with 2 decimal places'
      }),

      // IP address validation
      ipAddress: new this.Rule({
        validator: (v) => {
          try {
            joi.assert(v, joi.string().ip())
            return true
          } catch (e) {
            return 'Must be a valid IP address'
          }
        },
        pii: true,
        gdprCategory: 'technical_info',
        description: 'Valid IPv4 or IPv6 address'
      })
    }
  }

  /**
   * Enhanced validation with context
   */
  static async validateWithContext(data, context = {}) {
    const errors = {}
    const sanitizedData = { ...data }
    const normalizedData = { ...data }

    for (const [fieldName, rule] of Object.entries(this.schema)) {
      if (!(rule instanceof this.Rule)) continue

      const fieldValue = data[fieldName]
      const validationResult = await rule.validate(fieldValue, context, data)

      if (!validationResult.isValid) {
        errors[fieldName] = validationResult.errors
      }

      if (validationResult.sanitizedValue !== fieldValue) {
        sanitizedData[fieldName] = validationResult.sanitizedValue
      }

      if (validationResult.normalizedValue !== fieldValue) {
        normalizedData[fieldName] = validationResult.normalizedValue
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      sanitizedData,
      normalizedData
    }
  }

  /**
   * Get PII fields for GDPR compliance
   */
  static getPIIFields() {
    const piiFields = []
    
    for (const [fieldName, rule] of Object.entries(this.schema)) {
      if (rule instanceof this.Rule && rule.pii) {
        piiFields.push({
          field: fieldName,
          category: rule.gdprCategory,
          encrypted: rule.encrypted
        })
      }
    }
    
    return piiFields
  }

  /**
   * Get fields that need encryption
   */
  static getEncryptedFields() {
    const encryptedFields = []
    
    for (const [fieldName, rule] of Object.entries(this.schema)) {
      if (rule instanceof this.Rule && rule.encrypted) {
        encryptedFields.push(fieldName)
      }
    }
    
    return encryptedFields
  }

  /**
   * Anonymize PII data for GDPR compliance
   */
  static anonymizePIIData(data) {
    const anonymizedData = { ...data }
    
    for (const [fieldName, rule] of Object.entries(this.schema)) {
      if (rule instanceof this.Rule && rule.pii && anonymizedData[fieldName]) {
        switch (rule.gdprCategory) {
          case 'contact_info':
            anonymizedData[fieldName] = this._anonymizeContactInfo(anonymizedData[fieldName])
            break
          case 'personal_info':
            anonymizedData[fieldName] = this._anonymizePersonalInfo(anonymizedData[fieldName])
            break
          case 'technical_info':
            anonymizedData[fieldName] = this._anonymizeTechnicalInfo(anonymizedData[fieldName])
            break
          default:
            anonymizedData[fieldName] = '[REDACTED]'
        }
      }
    }
    
    return anonymizedData
  }

  /**
   * Helper methods for anonymization
   */
  static _anonymizeContactInfo(value) {
    if (typeof value !== 'string') return '[REDACTED]'
    
    if (value.includes('@')) {
      // Email anonymization
      const [, domain] = value.split('@')
      return `***@${domain}`
    } else {
      // Phone number anonymization
      return `***${value.slice(-4)}`
    }
  }

  static _anonymizePersonalInfo(value) {
    if (typeof value !== 'string') return '[REDACTED]'
    
    // Keep first letter and length
    return value.charAt(0) + '*'.repeat(Math.max(0, value.length - 1))
  }

  static _anonymizeTechnicalInfo(value) {
    if (typeof value !== 'string') return '[REDACTED]'
    
    // For IP addresses, keep first octet
    if (value.includes('.')) {
      const parts = value.split('.')
      return `${parts[0]}.***.***.***`
    }
    
    return '[REDACTED]'
  }

  /**
   * Bulk validation for arrays of data
   */
  static async validateBulk(dataArray, context = {}) {
    const results = []
    
    for (const data of dataArray) {
      const validationResult = await this.validateWithContext(data, context)
      results.push(validationResult)
    }
    
    return {
      allValid: results.every(r => r.isValid),
      results
    }
  }

  /**
   * Create validation schema for API documentation
   */
  static generateAPISchema() {
    const schema = {
      type: 'object',
      properties: {},
      required: []
    }
    
    for (const [fieldName, rule] of Object.entries(this.schema)) {
      if (rule instanceof this.Rule) {
        schema.properties[fieldName] = {
          description: rule.description,
          type: this._getJSONSchemaType(rule)
        }
        
        if (rule.required) {
          schema.required.push(fieldName)
        }
      }
    }
    
    return schema
  }

  /**
   * Helper to convert rule to JSON schema type
   */
  static _getJSONSchemaType(rule) {
    if (rule.description.includes('string')) return 'string'
    if (rule.description.includes('number')) return 'number'
    if (rule.description.includes('boolean')) return 'boolean'
    if (rule.description.includes('array')) return 'array'
    if (rule.description.includes('object')) return 'object'
    return 'string' // default
  }
}

module.exports = ValidatedModel