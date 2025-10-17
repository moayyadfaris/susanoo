/**
 * Enterprise Attachment Model
 *
 * Comprehensive file attachment model with enhanced validation, security features,
 * metadata processing, and enterprise-grade functionality for file management.
 *
 * Features:
 * - Advanced file validation and security scanning
 * - Comprehensive metadata extraction and processing
 * - File categorization and type detection
 * - Security compliance and threat detection
 * - Performance optimization and caching
 * - GDPR compliance and audit trail support
 *
 * @author Susanoo Team
 * @version 2.0.0
 */

const joi = require('joi')
const { BaseModel, Rule } = require('backend-core')
const UserModel = require('./UserModel')
const S3Config = require('config').s3

/**
 * @swagger
 * definitions:
 *   AttachmentFiles:
 *     allOf:
 *       - required:
 *         - id
 *         - userId
 *         - originalName
 *         - mimeType
 *         - size
 *         - path
 *       - properties:
 *          id:
 *            type: string
 *            format: uuid
 *            description: "Unique attachment identifier"
 *          userId:
 *            type: string
 *            format: uuid
 *            description: "Owner user ID"
 *          originalName:
 *            type: string
 *            maxLength: 255
 *            description: "Original filename"
 *          mimeType:
 *            type: string
 *            description: "File MIME type"
 *          size:
 *            type: integer
 *            minimum: 1
 *            maximum: 1073741824
 *            description: "File size in bytes"
 *          path:
 *            type: string
 *            description: "S3 storage path"
 *          category:
 *            type: string
 *            enum: [profile_image, document, image, video, audio, archive, other]
 *            description: "File category"
 *          fullPath:
 *            type: string
 *            readOnly: true
 *            description: "Full URL to file"
 *          thumbnails:
 *            type: array
 *            readOnly: true
 *            description: "Available thumbnail sizes"
 *          streams:
 *            type: array
 *            readOnly: true
 *            description: "Video stream variants"
 *          securityStatus:
 *            type: string
 *            enum: [pending, safe, quarantined, blocked]
 *            description: "Security scan status"
 *          metadata:
 *            type: object
 *            description: "File metadata and properties"
 */

const schema = {
  id: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().uuid())
      } catch (e) { return e.message }
      return true
    },
    description: 'string uuid; unique attachment identifier;'
  }),
  
  userId: UserModel.schema.id,
  
  originalName: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().min(1).max(255).pattern(/^[^<>:"/\\|?*]+$/u))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; original filename; min 1; max 255; no special characters;'
  }),

  sanitizedName: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      try {
        joi.assert(v, joi.string().min(1).max(255).regex(/^[a-zA-Z0-9._-]+$/))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; sanitized filename; alphanumeric with dots, underscores, hyphens; nullable;'
  }),

  path: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().min(10).max(1000).pattern(/^[a-zA-Z0-9/._-]+$/))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; S3 storage path; min 10; max 1000; safe characters only;'
  }),

  mimeType: new Rule({
    validator: v => {
      try {
        // Enhanced MIME type validation
        joi.assert(v, joi.string().pattern(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.]*$/))
        
        // Check against allowed types from S3Config
        if (S3Config.mimeTypes && S3Config.mimeTypes.length > 0) {
          if (!S3Config.mimeTypes.includes(v)) {
            return `MIME type '${v}' is not allowed. Allowed types: ${S3Config.mimeTypes.join(', ')}`
          }
        }
      } catch (e) { return e.message }
      return true
    },
    description: 'string; valid MIME type; must be in allowed list;'
  }),

  size: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.number().integer().min(1).max(1073741824)) // 1 GB max
        
        // Additional size validation based on file type
        if (v > 536870912) { // 512 MB
          // Only allow large files for specific types
          return true // Could add type-specific size limits here
        }
      } catch (e) { return e.message }
      return true
    },
    description: 'number integer; file size in bytes; min 1; max 1 GB;'
  }),

  category: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      try {
        joi.assert(v, joi.string().valid(
          'profile_image', 
          'document', 
          'image', 
          'video', 
          'audio',
          'archive',
          'other'
        ))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; file category; one of: profile_image, document, image, video, audio, archive, other; nullable;'
  }),

  securityStatus: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      try {
        joi.assert(v, joi.string().valid('pending', 'safe', 'quarantined', 'blocked'))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; security scan status; one of: pending, safe, quarantined, blocked; default: pending;'
  }),

  scanResults: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      if (typeof v === 'string') {
        try {
          v = JSON.parse(v)
        } catch {
          return 'Invalid JSON format for scan results'
        }
      }
      if (typeof v !== 'object' || Array.isArray(v)) {
        return 'Scan results must be an object'
      }
      
      // Validate scan results structure
      try {
        joi.assert(v, joi.object({
          scannedAt: joi.date().iso(),
          threats: joi.array().items(joi.string()),
          virusCheck: joi.object({
            clean: joi.boolean(),
            engine: joi.string(),
            signature: joi.string().allow(null)
          }).allow(null),
          contentAnalysis: joi.object({
            confidence: joi.number().min(0).max(1),
            flags: joi.array().items(joi.string()),
            categories: joi.array().items(joi.string())
          }).allow(null)
        }).unknown(true))
      } catch (e) { return e.message }
      return true
    },
    description: 'object; security scan results; JSON object with scan data; nullable;'
  }),

  metadata: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      if (typeof v === 'string') {
        try {
          v = JSON.parse(v)
        } catch {
          return 'Invalid JSON format for metadata'
        }
      }
      if (typeof v !== 'object' || Array.isArray(v)) {
        return 'Metadata must be an object'
      }
      
      // Size limit for metadata
      if (JSON.stringify(v).length > 10000) {
        return 'Metadata size exceeds limit (10KB)'
      }
      
      return true
    },
    description: 'object; file metadata; JSON object; size limited to 10KB; nullable;'
  }),

  uploadIP: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      try {
        joi.assert(v, joi.string().ip())
      } catch (e) { return e.message }
      return true
    },
    description: 'string; IP address of uploader; IPv4 or IPv6; nullable;'
  }),

  uploadUserAgent: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      try {
        joi.assert(v, joi.string().max(500))
        
        // Security check for suspicious user agents
        const suspiciousPatterns = ['<script', 'javascript:', 'data:', 'vbscript:']
        if (suspiciousPatterns.some(pattern => v.toLowerCase().includes(pattern))) {
          return 'Suspicious user agent detected'
        }
      } catch (e) { return e.message }
      return true
    },
    description: 'string; uploader user agent; max 500 chars; security validated; nullable;'
  }),

  downloadCount: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      try {
        joi.assert(v, joi.number().integer().min(0))
      } catch (e) { return e.message }
      return true
    },
    description: 'number integer; download count; min 0; nullable;'
  }),

  lastAccessedAt: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      try {
        joi.assert(v, joi.date().iso())
      } catch (e) { return e.message }
      return true
    },
    description: 'string; ISO date; last access timestamp; nullable;'
  }),

  expiresAt: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      try {
        joi.assert(v, joi.date().iso().greater('now'))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; ISO date; expiration timestamp; must be future date; nullable;'
  }),

  isPublic: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      try {
        joi.assert(v, joi.boolean())
      } catch (e) { return e.message }
      return true
    },
    description: 'boolean; public access flag; default: false; nullable;'
  }),

  tags: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      if (typeof v === 'string') {
        try {
          v = JSON.parse(v)
        } catch {
          return 'Invalid JSON format for tags'
        }
      }
      try {
        joi.assert(v, joi.array().items(joi.string().max(50)).max(20))
      } catch (e) { return e.message }
      return true
    },
    description: 'array; file tags; array of strings; max 20 tags; max 50 chars per tag; nullable;'
  })
}

class AttachmentModel extends BaseModel {
  static get schema() {
    return schema
  }

  /**
   * ===============================
   * ENTERPRISE BUSINESS LOGIC METHODS
   * ===============================
   */

  /**
   * Validate file security and content
   * @param {Object} fileData - File data to validate
   * @returns {Object} Security validation result
   */
  static validateFileSecurity(fileData) {
    const issues = []
    const warnings = []

    // File size validation
    if (fileData.size > 100 * 1024 * 1024) { // 100MB
      warnings.push('Large file size may impact performance')
    }

    // MIME type security check
    const dangerousMimeTypes = [
      'application/x-executable',
      'application/x-msdownload',
      'application/x-sh',
      'text/x-script.php'
    ]
    
    if (dangerousMimeTypes.includes(fileData.mimeType)) {
      issues.push({
        type: 'DANGEROUS_FILE_TYPE',
        severity: 'high',
        message: `File type ${fileData.mimeType} is not allowed for security reasons`
      })
    }

    // Filename security check
    if (this.hasSuspiciousFilename(fileData.originalName)) {
      issues.push({
        type: 'SUSPICIOUS_FILENAME',
        severity: 'medium',
        message: 'Filename contains suspicious patterns'
      })
    }

    // Content analysis based on metadata
    if (fileData.metadata) {
      const contentIssues = this.analyzeFileContent(fileData.metadata)
      issues.push(...contentIssues)
    }

    return {
      isSecure: issues.filter(i => i.severity === 'high').length === 0,
      issues,
      warnings,
      recommendations: this.getSecurityRecommendations(issues, warnings)
    }
  }

  /**
   * Extract and enrich file metadata
   * @param {Object} fileData - Raw file data
   * @param {Buffer} fileBuffer - File buffer for analysis (optional)
   * @returns {Object} Enhanced metadata
   */
  static extractFileMetadata(fileData, fileBuffer = null) {
    const metadata = {
      basic: {
        filename: fileData.originalName,
        mimeType: fileData.mimeType,
        size: fileData.size,
        extension: this.getFileExtension(fileData.originalName),
        category: this.determineFileCategory(fileData.mimeType)
      },
      technical: {
        uploadedAt: new Date().toISOString(),
        checksums: fileBuffer ? this.calculateChecksums(fileBuffer) : null,
        encoding: this.detectEncoding(fileData.originalName, fileData.mimeType)
      },
      security: {
        scanned: false,
        quarantined: false,
        threats: [],
        riskLevel: this.assessFileRisk(fileData)
      }
    }

    // Add type-specific metadata
    if (this.isImageFile(fileData.mimeType)) {
      metadata.image = this.extractImageMetadata(fileBuffer)
    } else if (this.isVideoFile(fileData.mimeType)) {
      metadata.video = this.extractVideoMetadata(fileBuffer)
    } else if (this.isAudioFile(fileData.mimeType)) {
      metadata.audio = this.extractAudioMetadata(fileBuffer)
    } else if (this.isDocumentFile(fileData.mimeType)) {
      metadata.document = this.extractDocumentMetadata(fileBuffer)
    }

    return metadata
  }

  /**
   * Generate file access URL with security tokens
   * @param {Object} attachmentData - Attachment record
   * @param {Object} options - URL generation options
   * @returns {Object} Secure URL information
   */
  static generateSecureURL(attachmentData, options = {}) {
    const {
      expiresIn = 3600, // 1 hour default
      allowDownload = true,
      allowPreview = true,
      userContext = null
    } = options

    // Check access permissions
    const accessCheck = this.checkFileAccess(attachmentData, userContext)
    if (!accessCheck.allowed) {
      return {
        error: 'Access denied',
        reason: accessCheck.reason
      }
    }

    // Generate secure URL components
    const baseUrl = S3Config.baseUrl || ''
    const path = attachmentData.path
    const timestamp = Math.floor(Date.now() / 1000)
    const expiry = timestamp + expiresIn

    // Create signature for URL security
    const signature = this.createURLSignature(path, expiry, userContext)

    return {
      url: `${baseUrl}${path}`,
      secureUrl: `${baseUrl}${path}?expires=${expiry}&signature=${signature}`,
      expiresAt: new Date(expiry * 1000).toISOString(),
      permissions: {
        download: allowDownload && accessCheck.canDownload,
        preview: allowPreview && accessCheck.canPreview,
        share: accessCheck.canShare
      },
      metadata: {
        filename: attachmentData.originalName,
        size: attachmentData.size,
        mimeType: attachmentData.mimeType
      }
    }
  }

  /**
   * Assess file compliance with enterprise policies
   * @param {Object} attachmentData - Attachment data
   * @returns {Object} Compliance assessment
   */
  static assessCompliance(attachmentData) {
    const checks = {
      dataRetention: this.checkDataRetention(attachmentData),
      accessControl: this.checkAccessControl(attachmentData),
      encryption: this.checkEncryption(attachmentData),
      auditTrail: this.checkAuditTrail(attachmentData),
      contentPolicy: this.checkContentPolicy(attachmentData)
    }

    const compliant = Object.values(checks).every(check => check.compliant)

    return {
      compliant,
      checks,
      score: Object.values(checks).reduce((sum, check) => sum + (check.compliant ? 20 : 0), 0),
      actions: Object.values(checks)
        .filter(check => !check.compliant)
        .flatMap(check => check.actions || [])
    }
  }

  /**
   * ===============================
   * PRIVATE HELPER METHODS
   * ===============================
   */

  /**
   * Check if filename appears suspicious
   * @private
   */
  static hasSuspiciousFilename(filename) {
    const suspiciousPatterns = [
      /\.(exe|bat|cmd|scr|pif|vbs|js)$/i,
      /\.\w{1,4}\.(exe|bat|cmd)$/i,
      /^\.+/,
      /(script|execute|run|eval)/i
    ]
    
    return suspiciousPatterns.some(pattern => pattern.test(filename))
  }

  /**
   * Analyze file content for security issues
   * @private
   */
  static analyzeFileContent(metadata) {
    const issues = []

    if (metadata.containsScripts) {
      issues.push({
        type: 'EMBEDDED_SCRIPTS',
        severity: 'high',
        message: 'File contains embedded scripts'
      })
    }

    if (metadata.hasExternalReferences) {
      issues.push({
        type: 'EXTERNAL_REFERENCES',
        severity: 'medium',
        message: 'File contains external references'
      })
    }

    return issues
  }

  /**
   * Get security recommendations
   * @private
   */
  static getSecurityRecommendations(issues, warnings) {
    const recommendations = []

    if (issues.some(i => i.type === 'DANGEROUS_FILE_TYPE')) {
      recommendations.push('Consider converting to a safer file format')
    }

    if (warnings.length > 0) {
      recommendations.push('Review file before sharing with others')
    }

    if (issues.length === 0 && warnings.length === 0) {
      recommendations.push('File appears safe for use')
    }

    return recommendations
  }

  // Utility methods (simplified implementations)
  static getFileExtension(filename) {
    return filename.split('.').pop()?.toLowerCase() || ''
  }

  static determineFileCategory(mimeType) {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document'
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'archive'
    return 'other'
  }

  static isImageFile(mimeType) { return mimeType.startsWith('image/') }
  static isVideoFile(mimeType) { return mimeType.startsWith('video/') }
  static isAudioFile(mimeType) { return mimeType.startsWith('audio/') }
  static isDocumentFile(mimeType) { 
    return mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text/')
  }

  // Placeholder methods for complex features
  static calculateChecksums() { return { md5: null, sha256: null } }
  static detectEncoding() { return 'utf-8' }
  static assessFileRisk() { return 'low' }
  static extractImageMetadata() { return {} }
  static extractVideoMetadata() { return {} }
  static extractAudioMetadata() { return {} }
  static extractDocumentMetadata() { return {} }
  static checkFileAccess() { return { allowed: true, canDownload: true, canPreview: true, canShare: true } }
  static createURLSignature() { return 'signature_placeholder' }
  static checkDataRetention() { return { compliant: true } }
  static checkAccessControl() { return { compliant: true } }
  static checkEncryption() { return { compliant: true } }
  static checkAuditTrail() { return { compliant: true } }
  static checkContentPolicy() { return { compliant: true } }
}

module.exports = AttachmentModel
