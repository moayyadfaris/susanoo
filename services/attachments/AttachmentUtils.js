/**
 * Enterprise Attachment Utilities
 *
 * Pure functional utilities for attachment data processing, validation, and analysis.
 * Contains no database operations - only pure functions for file manipulation,
 * security analysis, and content processing.
 *
 * Features:
 * - File validation and sanitization
 * - Security analysis and threat detection
 * - Content type detection and processing
 * - Metadata extraction and enrichment
 * - Performance optimization helpers
 * - GDPR compliance utilities
 *
 * @author Susanoo Team
 * @version 2.0.0
 */

class AttachmentUtils {
  /**
   * ===============================
   * FILE VALIDATION & SANITIZATION
   * ===============================
   */

  /**
   * Sanitize filename for safe storage and display
   * @param {string} filename - Original filename
   * @param {Object} options - Sanitization options
   * @returns {string} Sanitized filename
   */
  static sanitizeFilename(filename, options = {}) {
    const {
      maxLength = 255,
      preserveExtension = true,
      allowUnicode = false,
      replaceSpaces = true
    } = options

    if (!filename || typeof filename !== 'string') {
      return 'unnamed_file'
    }

    let sanitized = filename.trim()

    // Remove dangerous characters
    const dangerousChars = /[<>:"/\\|?*]/g
    sanitized = sanitized.replace(dangerousChars, '_')

    // Handle spaces
    if (replaceSpaces) {
      sanitized = sanitized.replace(/\s+/g, '_')
    }

    // Remove Unicode if not allowed
    if (!allowUnicode) {
      sanitized = sanitized.replace(/[^\u0020-\u007E]/g, '_')
    }

    // Remove consecutive underscores/dots
    sanitized = sanitized.replace(/[_.]{2,}/g, '_')

    // Preserve extension if requested
    if (preserveExtension) {
      const parts = sanitized.split('.')
      if (parts.length > 1) {
        const extension = parts.pop()
        const basename = parts.join('.')
        
        // Truncate basename if too long
        const maxBasenameLength = maxLength - extension.length - 1
        const truncatedBasename = basename.length > maxBasenameLength 
          ? basename.substring(0, maxBasenameLength)
          : basename

        sanitized = `${truncatedBasename}.${extension}`
      }
    }

    // Final length check
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength)
    }

    // Ensure not empty
    return sanitized || 'unnamed_file'
  }

  /**
   * Validate file against security policies
   * @param {Object} fileData - File data to validate
   * @param {Object} policies - Security policies
   * @returns {Object} Validation result
   */
  static validateFileSecurity(fileData, policies = {}) {
    const {
      maxSize = 100 * 1024 * 1024, // 100MB
      allowedMimeTypes = [],
      blockedMimeTypes = [],
      requireFileSignatureValidation = true,
      allowExecutables = false,
      allowArchives = true
    } = policies

    const validationResult = {
      isValid: true,
      violations: [],
      warnings: [],
      risk: 'low'
    }

    // Size validation
    if (fileData.size > maxSize) {
      validationResult.violations.push({
        type: 'size_exceeded',
        message: `File size ${this.formatFileSize(fileData.size)} exceeds maximum allowed size ${this.formatFileSize(maxSize)}`,
        severity: 'high'
      })
      validationResult.isValid = false
    }

    // MIME type validation
    if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(fileData.mimetype)) {
      validationResult.violations.push({
        type: 'mimetype_not_allowed',
        message: `File type ${fileData.mimetype} is not in allowed types`,
        severity: 'high'
      })
      validationResult.isValid = false
    }

    if (blockedMimeTypes.includes(fileData.mimetype)) {
      validationResult.violations.push({
        type: 'mimetype_blocked',
        message: `File type ${fileData.mimetype} is explicitly blocked`,
        severity: 'critical'
      })
      validationResult.isValid = false
      validationResult.risk = 'critical'
    }

    // Executable file check
    if (!allowExecutables && this.isExecutableType(fileData.mimetype)) {
      validationResult.violations.push({
        type: 'executable_not_allowed',
        message: 'Executable files are not permitted',
        severity: 'critical'
      })
      validationResult.isValid = false
      validationResult.risk = 'critical'
    }

    // Archive file check
    if (!allowArchives && this.isArchiveType(fileData.mimetype)) {
      validationResult.violations.push({
        type: 'archive_not_allowed',
        message: 'Archive files are not permitted',
        severity: 'medium'
      })
      validationResult.isValid = false
    }

    // File signature validation
    if (requireFileSignatureValidation && fileData.buffer) {
      const signature = this.getFileSignature(fileData.buffer)
      if (!this.validateFileSignature(signature, fileData.mimetype)) {
        validationResult.violations.push({
          type: 'signature_mismatch',
          message: 'File signature does not match declared MIME type',
          severity: 'high'
        })
        validationResult.isValid = false
        validationResult.risk = 'high'
      }
    }

    return validationResult
  }

  /**
   * ===============================
   * FILE SIGNATURE & TYPE DETECTION
   * ===============================
   */

  /**
   * Get file signature (magic bytes) from buffer
   * @param {Buffer} buffer - File buffer
   * @param {number} length - Number of bytes to read
   * @returns {string} Hex signature
   */
  static getFileSignature(buffer, length = 16) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return ''
    }
    
    const bytesToRead = Math.min(length, buffer.length)
    return buffer.subarray(0, bytesToRead).toString('hex').toLowerCase()
  }

  /**
   * Validate file signature against MIME type
   * @param {string} signature - File signature
   * @param {string} mimeType - Declared MIME type
   * @returns {boolean} True if signature matches
   */
  static validateFileSignature(signature, mimeType) {
    const knownSignatures = {
      'image/jpeg': ['ffd8ff'],
      'image/png': ['89504e47'],
      'image/gif': ['474946383761', '474946383961'],
      'image/webp': ['52494646'],
      'image/bmp': ['424d'],
      'image/tiff': ['49492a00', '4d4d002a'],
      'application/pdf': ['255044462d'],
      'application/zip': ['504b0304', '504b0506', '504b0708'],
      'application/x-rar-compressed': ['526172211a0700'],
      'application/x-7z-compressed': ['377abcaf271c'],
      'text/plain': [], // Text files can have various encodings
      'application/json': [], // JSON files are text-based
      'application/xml': [], // XML files are text-based
      'text/html': [], // HTML files are text-based
      'text/css': [], // CSS files are text-based
      'application/javascript': [], // JS files are text-based
      'application/msword': ['d0cf11e0a1b11ae1'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['504b0304'],
      'application/vnd.ms-excel': ['d0cf11e0a1b11ae1'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['504b0304'],
      'application/vnd.ms-powerpoint': ['d0cf11e0a1b11ae1'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['504b0304'],
      'video/mp4': ['66747970'],
      'video/avi': ['52494646'],
      'video/quicktime': ['6674797071742020'],
      'audio/mpeg': ['494433', 'fffb', 'fff3', 'fff2'],
      'audio/wav': ['52494646'],
      'audio/ogg': ['4f676753']
    }

    const expectedSignatures = knownSignatures[mimeType]
    
    // If no signatures defined for this MIME type, assume valid
    if (!expectedSignatures || expectedSignatures.length === 0) {
      return true
    }

    // Check if signature starts with any of the expected signatures
    return expectedSignatures.some(expectedSig => 
      signature.startsWith(expectedSig.toLowerCase())
    )
  }

  /**
   * Detect MIME type from file signature
   * @param {Buffer} buffer - File buffer
   * @returns {string|null} Detected MIME type or null
   */
  static detectMimeTypeFromSignature(buffer) {
    const signature = this.getFileSignature(buffer, 16)
    
    const signatureMap = {
      'ffd8ff': 'image/jpeg',
      '89504e47': 'image/png',
      '474946383761': 'image/gif',
      '474946383961': 'image/gif',
      '52494646': 'image/webp',
      '424d': 'image/bmp',
      '49492a00': 'image/tiff',
      '4d4d002a': 'image/tiff',
      '255044462d': 'application/pdf',
      '504b0304': 'application/zip',
      '504b0506': 'application/zip',
      '504b0708': 'application/zip',
      '526172211a0700': 'application/x-rar-compressed',
      '377abcaf271c': 'application/x-7z-compressed',
      'd0cf11e0a1b11ae1': 'application/msword',
      '66747970': 'video/mp4',
      '52494646': 'video/avi',
      '6674797071742020': 'video/quicktime',
      '494433': 'audio/mpeg',
      'fffb': 'audio/mpeg',
      'fff3': 'audio/mpeg',
      'fff2': 'audio/mpeg',
      '4f676753': 'audio/ogg'
    }

    for (const [sig, mimeType] of Object.entries(signatureMap)) {
      if (signature.startsWith(sig)) {
        return mimeType
      }
    }

    return null
  }

  /**
   * ===============================
   * FILE CATEGORIZATION & ANALYSIS
   * ===============================
   */

  /**
   * Categorize file based on MIME type and metadata
   * @param {string} mimeType - File MIME type
   * @param {Object} metadata - File metadata
   * @returns {string} File category
   */
  static categorizeFile(mimeType, metadata = {}) {
    const categories = {
      image: ['image/'],
      document: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument',
        'text/plain',
        'text/rtf',
        'application/rtf'
      ],
      video: ['video/'],
      audio: ['audio/'],
      archive: [
        'application/zip',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
        'application/x-tar',
        'application/gzip'
      ],
      code: [
        'text/javascript',
        'application/javascript',
        'text/css',
        'text/html',
        'application/json',
        'application/xml',
        'text/xml'
      ],
      spreadsheet: [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv'
      ],
      presentation: [
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]
    }

    for (const [category, patterns] of Object.entries(categories)) {
      if (patterns.some(pattern => mimeType.startsWith(pattern) || mimeType === pattern)) {
        return category
      }
    }

    return 'other'
  }

  /**
   * Check if file type is executable
   * @param {string} mimeType - File MIME type
   * @returns {boolean} True if executable
   */
  static isExecutableType(mimeType) {
    const executableTypes = [
      'application/x-executable',
      'application/x-msdos-program',
      'application/x-msdownload',
      'application/x-mach-binary',
      'application/x-sharedlib',
      'application/x-shellscript',
      'application/x-perl',
      'application/x-python-code',
      'application/java-archive',
      'application/x-java-archive'
    ]

    return executableTypes.includes(mimeType) || 
           mimeType.startsWith('application/x-executable')
  }

  /**
   * Check if file type is archive
   * @param {string} mimeType - File MIME type
   * @returns {boolean} True if archive
   */
  static isArchiveType(mimeType) {
    const archiveTypes = [
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/x-tar',
      'application/gzip',
      'application/x-bzip2',
      'application/x-compress'
    ]

    return archiveTypes.includes(mimeType)
  }

  /**
   * Check if file type is image
   * @param {string} mimeType - File MIME type
   * @returns {boolean} True if image
   */
  static isImageType(mimeType) {
    return mimeType.startsWith('image/')
  }

  /**
   * Check if file type is document
   * @param {string} mimeType - File MIME type
   * @returns {boolean} True if document
   */
  static isDocumentType(mimeType) {
    const documentTypes = [
      'application/pdf',
      'application/msword',
      'text/plain',
      'text/rtf',
      'application/rtf'
    ]

    return documentTypes.includes(mimeType) || 
           mimeType.startsWith('application/vnd.openxmlformats-officedocument')
  }

  /**
   * ===============================
   * METADATA EXTRACTION
   * ===============================
   */

  /**
   * Extract basic metadata from file buffer
   * @param {Buffer} buffer - File buffer
   * @param {string} mimeType - File MIME type
   * @returns {Promise<Object>} Extracted metadata
   */
  static async extractMetadata(buffer, mimeType) {
    const metadata = {
      size: buffer.length,
      mimeType,
      signature: this.getFileSignature(buffer),
      extractedAt: new Date(),
      type: this.categorizeFile(mimeType)
    }

    // Image metadata
    if (this.isImageType(mimeType)) {
      Object.assign(metadata, await this.extractImageMetadata(buffer, mimeType))
    }

    // Document metadata
    if (this.isDocumentType(mimeType)) {
      Object.assign(metadata, await this.extractDocumentMetadata(buffer, mimeType))
    }

    return metadata
  }

  /**
   * Extract enhanced metadata with additional analysis
   * @param {Buffer} buffer - File buffer
   * @param {string} mimeType - File MIME type
   * @returns {Promise<Object>} Enhanced metadata
   */
  static async extractEnhancedMetadata(buffer, mimeType) {
    const basicMetadata = await this.extractMetadata(buffer, mimeType)
    
    const enhancedMetadata = {
      ...basicMetadata,
      entropy: this.calculateEntropy(buffer),
      complexity: this.calculateComplexity(buffer),
      textContent: await this.extractTextContent(buffer, mimeType),
      embeddedObjects: this.detectEmbeddedObjects(buffer, mimeType)
    }

    return enhancedMetadata
  }

  /**
   * Extract image metadata
   * @private
   */
  static async extractImageMetadata(buffer, mimeType) {
    const metadata = {}
    
    try {
      // Basic image analysis without external dependencies
      if (mimeType === 'image/jpeg') {
        // JPEG-specific metadata extraction
        metadata.format = 'JPEG'
        metadata.hasExif = this.hasExifData(buffer)
      } else if (mimeType === 'image/png') {
        // PNG-specific metadata extraction
        metadata.format = 'PNG'
        metadata.hasTransparency = this.pngHasTransparency(buffer)
      }
    } catch (error) {
      metadata.extractionError = error.message
    }

    return metadata
  }

  /**
   * Extract document metadata
   * @private
   */
  static async extractDocumentMetadata(buffer, mimeType) {
    const metadata = {}
    
    try {
      if (mimeType === 'application/pdf') {
        metadata.format = 'PDF'
        metadata.version = this.getPDFVersion(buffer)
        metadata.isEncrypted = this.isPDFEncrypted(buffer)
      } else if (mimeType === 'text/plain') {
        metadata.format = 'Plain Text'
        metadata.encoding = this.detectTextEncoding(buffer)
        metadata.lineCount = this.countLines(buffer)
      }
    } catch (error) {
      metadata.extractionError = error.message
    }

    return metadata
  }

  /**
   * ===============================
   * SECURITY ANALYSIS
   * ===============================
   */

  /**
   * Perform basic malware detection
   * @param {Buffer} buffer - File buffer
   * @returns {Object} Detection result
   */
  static performBasicMalwareDetection(buffer) {
    const result = {
      isSuspicious: false,
      reasons: [],
      risk: 'low'
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /eval\s*\(/gi,
      /document\.write\s*\(/gi,
      /iframe\s+src\s*=/gi,
      /script\s+src\s*=/gi,
      /<script[^>]*>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi
    ]

    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 10000))
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        result.isSuspicious = true
        result.reasons.push(`Suspicious pattern found: ${pattern.source}`)
        result.risk = 'medium'
      }
    }

    // Check entropy for packed/encrypted content
    const entropy = this.calculateEntropy(buffer)
    if (entropy > 7.5) {
      result.isSuspicious = true
      result.reasons.push(`High entropy detected: ${entropy.toFixed(2)}`)
      result.risk = 'medium'
    }

    return result
  }

  /**
   * Calculate security score for attachment
   * @param {Object} attachment - Attachment data
   * @returns {number} Security score (0-100)
   */
  static calculateSecurityScore(attachment) {
    let score = 100

    // File type risk assessment
    if (this.isExecutableType(attachment.mimeType)) {
      score -= 40
    } else if (this.isArchiveType(attachment.mimeType)) {
      score -= 20
    } else if (attachment.mimeType.includes('script')) {
      score -= 30
    }

    // Size risk assessment
    if (attachment.size > 100 * 1024 * 1024) { // 100MB
      score -= 10
    }

    // Content analysis risk
    if (attachment.metadata?.entropy > 7.5) {
      score -= 15
    }

    // Security validation history
    if (attachment.securityStatus === 'validated') {
      score += 10
    } else if (attachment.securityStatus === 'suspicious') {
      score -= 25
    }

    return Math.max(0, Math.min(100, score))
  }

  /**
   * ===============================
   * CONTENT ANALYSIS
   * ===============================
   */

  /**
   * Analyze file content for various properties
   * @param {Buffer} buffer - File buffer
   * @param {string} mimeType - File MIME type
   * @returns {Promise<Object>} Content analysis
   */
  static async analyzeContent(buffer, mimeType) {
    const analysis = {
      size: buffer.length,
      entropy: this.calculateEntropy(buffer),
      complexity: this.calculateComplexity(buffer),
      textRatio: this.calculateTextRatio(buffer),
      language: null,
      keywords: [],
      sentiment: null
    }

    // Text content analysis
    if (this.isTextBasedType(mimeType)) {
      const textContent = buffer.toString('utf8')
      analysis.language = this.detectLanguage(textContent)
      analysis.keywords = this.extractKeywords(textContent)
      analysis.sentiment = this.analyzeSentiment(textContent)
    }

    return analysis
  }

  /**
   * Extract text content from various file types
   * @param {Buffer} buffer - File buffer
   * @param {string} mimeType - File MIME type
   * @returns {Promise<string>} Extracted text
   */
  static async extractTextContent(buffer, mimeType) {
    if (this.isTextBasedType(mimeType)) {
      return buffer.toString('utf8')
    }

    // For binary files, return first part as preview
    const preview = buffer.toString('utf8', 0, Math.min(1000, buffer.length))
    return preview.replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
  }

  /**
   * ===============================
   * UTILITY HELPERS
   * ===============================
   */

  /**
   * Format file size in human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Calculate entropy of buffer
   * @param {Buffer} buffer - File buffer
   * @returns {number} Entropy value
   */
  static calculateEntropy(buffer) {
    const frequencies = new Array(256).fill(0)
    
    for (let i = 0; i < buffer.length; i++) {
      frequencies[buffer[i]]++
    }
    
    let entropy = 0
    const length = buffer.length
    
    for (let i = 0; i < 256; i++) {
      if (frequencies[i] > 0) {
        const p = frequencies[i] / length
        entropy -= p * Math.log2(p)
      }
    }
    
    return entropy
  }

  /**
   * Calculate complexity score of buffer
   * @param {Buffer} buffer - File buffer
   * @returns {number} Complexity score
   */
  static calculateComplexity(buffer) {
    const uniqueBytes = new Set(buffer).size
    const entropy = this.calculateEntropy(buffer)
    
    // Combine metrics for complexity score
    return (uniqueBytes / 256) * entropy
  }

  /**
   * Calculate text ratio in buffer
   * @param {Buffer} buffer - File buffer
   * @returns {number} Text ratio (0-1)
   */
  static calculateTextRatio(buffer) {
    let textBytes = 0
    
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i]
      // Count printable ASCII and common Unicode ranges
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        textBytes++
      }
    }
    
    return textBytes / buffer.length
  }

  /**
   * Check if MIME type is text-based
   * @param {string} mimeType - File MIME type
   * @returns {boolean} True if text-based
   */
  static isTextBasedType(mimeType) {
    const textTypes = [
      'text/',
      'application/json',
      'application/xml',
      'application/javascript',
      'application/x-javascript'
    ]
    
    return textTypes.some(type => mimeType.startsWith(type))
  }

  /**
   * Detect embedded objects in file
   * @param {Buffer} buffer - File buffer
   * @param {string} mimeType - File MIME type
   * @returns {Array} Embedded objects found
   */
  static detectEmbeddedObjects(buffer, mimeType) {
    const objects = []
    
    // Look for embedded files based on signatures
    const signatures = [
      { pattern: /PK\x03\x04/g, type: 'ZIP archive' },
      { pattern: /\xFF\xD8\xFF/g, type: 'JPEG image' },
      { pattern: /\x89PNG\r\n\x1A\n/g, type: 'PNG image' },
      { pattern: /%PDF-/g, type: 'PDF document' }
    ]
    
    const content = buffer.toString('binary')
    
    for (const sig of signatures) {
      let match
      while ((match = sig.pattern.exec(content)) !== null) {
        objects.push({
          type: sig.type,
          offset: match.index,
          signature: match[0]
        })
      }
    }
    
    return objects
  }

  /**
   * Helper methods for specific file format analysis
   */
  
  static hasExifData(buffer) {
    const exifMarker = buffer.indexOf(Buffer.from([0xFF, 0xE1]))
    return exifMarker !== -1
  }
  
  static pngHasTransparency(buffer) {
    const tRNSChunk = buffer.indexOf(Buffer.from('tRNS'))
    return tRNSChunk !== -1
  }
  
  static getPDFVersion(buffer) {
    const versionMatch = buffer.toString('ascii', 0, 20).match(/%PDF-(\d\.\d)/)
    return versionMatch ? versionMatch[1] : null
  }
  
  static isPDFEncrypted(buffer) {
    return buffer.indexOf(Buffer.from('/Encrypt')) !== -1
  }
  
  static detectTextEncoding(buffer) {
    // Simple encoding detection
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      return 'UTF-8 BOM'
    }
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
      return 'UTF-16 LE'
    }
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
      return 'UTF-16 BE'
    }
    return 'UTF-8'
  }
  
  static countLines(buffer) {
    return buffer.toString('utf8').split('\n').length
  }
  
  static detectLanguage(text) {
    // Simple language detection based on common words
    const sample = text.substring(0, 1000).toLowerCase()
    
    const patterns = {
      english: /\b(the|and|or|but|in|on|at|to|for|of|with|by)\b/g,
      spanish: /\b(el|la|en|de|que|y|un|es|se|no|te|lo)\b/g,
      french: /\b(le|de|et|à|un|il|être|et|en|avoir|que|pour)\b/g
    }
    
    let maxMatches = 0
    let detectedLanguage = 'unknown'
    
    for (const [lang, pattern] of Object.entries(patterns)) {
      const matches = (sample.match(pattern) || []).length
      if (matches > maxMatches) {
        maxMatches = matches
        detectedLanguage = lang
      }
    }
    
    return maxMatches > 3 ? detectedLanguage : 'unknown'
  }
  
  static extractKeywords(text) {
    // Simple keyword extraction
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
    
    const frequency = {}
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1
    })
    
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word)
  }
  
  static analyzeSentiment(text) {
    // Very basic sentiment analysis
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic']
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'disappointing', 'poor']
    
    const lowerText = text.toLowerCase()
    const positiveCount = positiveWords.reduce((count, word) => 
      count + (lowerText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length, 0)
    const negativeCount = negativeWords.reduce((count, word) => 
      count + (lowerText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length, 0)
    
    if (positiveCount > negativeCount) return 'positive'
    if (negativeCount > positiveCount) return 'negative'
    return 'neutral'
  }
}

module.exports = AttachmentUtils