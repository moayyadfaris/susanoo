const { BaseMiddleware, ErrorWrapper, errorCodes } = require('backend-core')
const logger = require('../util/logger')
const crypto = require('crypto')

/**
 * Enhanced ContentTypeMiddleware - Advanced content type validation and security
 * 
 * Features:
 * - Comprehensive content type validation
 * - Security headers for file uploads
 * - Request size monitoring
 * - Method-specific validation rules
 * - Enhanced error messaging
 * - Performance monitoring
 * - Content encoding validation
 * 
 * @extends BaseMiddleware
 * @version 2.0.0
 */
class ContentTypeMiddleware extends BaseMiddleware {
  async init() {
    // Enhanced configuration
    this.config = {
      // Supported content types with specific rules
      contentTypes: {
        'application/json': {
          methods: ['POST', 'PUT', 'PATCH'],
          maxSize: 10 * 1024 * 1024, // 10MB for JSON
          description: 'JSON data'
        },
        'multipart/form-data': {
          methods: ['POST', 'PUT', 'PATCH'],
          maxSize: 100 * 1024 * 1024, // 100MB for file uploads
          description: 'File uploads and form data'
        },
        'application/x-www-form-urlencoded': {
          methods: ['POST', 'PUT', 'PATCH'],
          maxSize: 1 * 1024 * 1024, // 1MB for form data
          description: 'URL encoded form data'
        },
        'text/plain': {
          methods: ['POST', 'PUT', 'PATCH'],
          maxSize: 1 * 1024 * 1024, // 1MB for plain text
          description: 'Plain text data'
        },
        'application/xml': {
          methods: ['POST', 'PUT', 'PATCH'],
          maxSize: 5 * 1024 * 1024, // 5MB for XML
          description: 'XML data'
        }
      },
      
      // Methods that require content type validation
      methodsRequiringContentType: ['POST', 'PUT', 'PATCH'],
      
      // Methods that should not have content type
      methodsWithoutBody: ['GET', 'DELETE', 'HEAD', 'OPTIONS'],
      
      // Security settings
      security: {
        // Reject requests with suspicious content types
        blockedContentTypes: [
          'application/x-msdownload',
          'application/x-msdos-program',
          'application/x-executable',
          'application/x-winexe',
          'application/x-msi',
          'application/x-bat',
          'application/x-sh'
        ],
        
        // Maximum allowed content length (100MB)
        maxContentLength: 100 * 1024 * 1024,
        
        // Enable strict validation
        strictValidation: true
      }
    }

    logger.debug(`${this.constructor.name} initialized with enhanced validation...`)
    logger.debug('Supported content types:', Object.keys(this.config.contentTypes))
  }

  handler() {
    return async (req, res, next) => {
      const startTime = Date.now()
      const requestId = req.requestMetadata?.id || req.id || req.requestId || crypto.randomBytes(16).toString('hex')
      
      try {
        // Enhanced request logging
        logger.debug('Content type validation started', {
          requestId,
          method: req.method,
          url: req.url,
          contentType: req.headers['content-type'],
          contentLength: req.headers['content-length']
        })

        // Skip validation for methods that don't require body
        if (this.config.methodsWithoutBody.includes(req.method)) {
          logger.debug('Skipping content type validation for method without body', {
            requestId,
            method: req.method
          })
          return this.completeRequest(req, res, next, startTime, requestId)
        }

        // Validate methods that require content type
        if (this.config.methodsRequiringContentType.includes(req.method)) {
          await this.validateContentType(req, requestId)
          await this.validateContentLength(req, requestId)
          await this.validateContentSecurity(req, requestId)
        }

        this.completeRequest(req, res, next, startTime, requestId)

      } catch (error) {
        logger.error('Content type validation failed', {
          requestId,
          method: req.method,
          url: req.url,
          error: error.message,
          contentType: req.headers['content-type'],
          processingTime: Date.now() - startTime
        })
        
        next(error)
      }
    }
  }

  /**
   * Validate content type header
   */
  async validateContentType(req, requestId) {
    const contentType = req.headers['content-type'] || req.headers['Content-Type']
    
    if (!contentType) {
      throw new ErrorWrapper({
        ...errorCodes.BAD_REQUEST,
        message: 'Content-Type header is required for this request',
        layer: 'ContentTypeMiddleware.validateContentType',
        meta: {
          method: req.method,
          supportedTypes: Object.keys(this.config.contentTypes),
          requestId
        }
      })
    }

    // Normalize content type (remove charset and other parameters)
    const normalizedContentType = this.normalizeContentType(contentType)
    
    // Check if content type is supported
    const supportedType = this.findSupportedContentType(normalizedContentType)
    
    if (!supportedType) {
      const supportedTypes = Object.keys(this.config.contentTypes)
      
      throw new ErrorWrapper({
        ...errorCodes.BAD_REQUEST,
        message: `Unsupported content type: ${normalizedContentType}`,
        layer: 'ContentTypeMiddleware.validateContentType',
        meta: {
          provided: normalizedContentType,
          supported: supportedTypes,
          method: req.method,
          requestId
        }
      })
    }

    // Validate method compatibility
    const typeConfig = this.config.contentTypes[supportedType]
    if (!typeConfig.methods.includes(req.method)) {
      throw new ErrorWrapper({
        ...errorCodes.BAD_REQUEST,
        message: `Content type ${supportedType} not allowed for ${req.method} method`,
        layer: 'ContentTypeMiddleware.validateContentType',
        meta: {
          contentType: supportedType,
          method: req.method,
          allowedMethods: typeConfig.methods,
          requestId
        }
      })
    }

    // Store validated content type for downstream use
    req.validatedContentType = {
      type: supportedType,
      original: contentType,
      config: typeConfig
    }

    logger.debug('Content type validation passed', {
      requestId,
      validatedType: supportedType,
      originalType: contentType
    })
  }

  /**
   * Validate content length
   */
  async validateContentLength(req, requestId) {
    const contentLength = parseInt(req.headers['content-length'] || '0')
    const contentType = req.validatedContentType?.type
    
    if (contentLength > 0) {
      // Check global max size
      if (contentLength > this.config.security.maxContentLength) {
        throw new ErrorWrapper({
          ...errorCodes.BAD_REQUEST,
          message: `Request too large. Maximum allowed size is ${this.formatBytes(this.config.security.maxContentLength)}`,
          layer: 'ContentTypeMiddleware.validateContentLength',
          meta: {
            contentLength,
            maxAllowed: this.config.security.maxContentLength,
            contentType,
            requestId
          }
        })
      }

      // Check content type specific size
      if (contentType && this.config.contentTypes[contentType]) {
        const typeMaxSize = this.config.contentTypes[contentType].maxSize
        
        if (contentLength > typeMaxSize) {
          throw new ErrorWrapper({
            ...errorCodes.BAD_REQUEST,
            message: `Request too large for ${contentType}. Maximum allowed size is ${this.formatBytes(typeMaxSize)}`,
            layer: 'ContentTypeMiddleware.validateContentLength',
            meta: {
              contentLength,
              maxAllowed: typeMaxSize,
              contentType,
              requestId
            }
          })
        }
      }

      logger.debug('Content length validation passed', {
        requestId,
        contentLength: this.formatBytes(contentLength),
        contentType
      })
    }
  }

  /**
   * Validate content security
   */
  async validateContentSecurity(req, requestId) {
    const contentType = req.headers['content-type'] || ''
    
    // Check for blocked content types
    const isBlocked = this.config.security.blockedContentTypes.some(blockedType =>
      contentType.toLowerCase().includes(blockedType.toLowerCase())
    )
    
    if (isBlocked) {
      logger.warn('Blocked content type detected', {
        requestId,
        contentType,
        clientIp: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']
      })
      
      throw new ErrorWrapper({
        ...errorCodes.FORBIDDEN,
        message: 'Content type not allowed for security reasons',
        layer: 'ContentTypeMiddleware.validateContentSecurity',
        meta: {
          contentType,
          reason: 'blocked_content_type',
          requestId
        }
      })
    }

    // Validate content encoding
    const contentEncoding = req.headers['content-encoding']
    if (contentEncoding) {
      const allowedEncodings = ['gzip', 'deflate', 'br']
      const encodings = contentEncoding.split(',').map(e => e.trim().toLowerCase())
      
      const hasInvalidEncoding = encodings.some(encoding => 
        !allowedEncodings.includes(encoding)
      )
      
      if (hasInvalidEncoding) {
        throw new ErrorWrapper({
          ...errorCodes.BAD_REQUEST,
          message: `Unsupported content encoding: ${contentEncoding}`,
          layer: 'ContentTypeMiddleware.validateContentSecurity',
          meta: {
            provided: contentEncoding,
            supported: allowedEncodings,
            requestId
          }
        })
      }
    }
  }

  /**
   * Complete request processing
   */
  completeRequest(req, res, next, startTime, requestId) {
    const processingTime = Date.now() - startTime
    
    // Log successful validation
    logger.debug('Content type middleware completed', {
      requestId,
      method: req.method,
      processingTime: `${processingTime}ms`,
      contentType: req.validatedContentType?.type || 'none'
    })

    next()
  }
  /**
   * Normalize content type by removing parameters
   */
  normalizeContentType(contentType) {
    return contentType.split(';')[0].trim().toLowerCase()
  }

  /**
   * Find supported content type with fuzzy matching
   */
  findSupportedContentType(contentType) {
    // Direct match
    if (this.config.contentTypes[contentType]) {
      return contentType
    }

    // Fuzzy matching for common variations
    for (const supportedType of Object.keys(this.config.contentTypes)) {
      if (contentType.includes(supportedType) || supportedType.includes(contentType)) {
        return supportedType
      }
    }

    return null
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

}

module.exports = { ContentTypeMiddleware }
