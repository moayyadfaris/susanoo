const { v4: uuidV4 } = require('uuid')
const crypto = require('crypto')

class ErrorResponse {
  constructor(options = {}) {
    // Core error properties
    this.logId = options.logId || uuidV4()
    this.timestamp = options.timestamp || new Date().toISOString()
    this.success = false
    
    // HTTP response properties
    this.status = options.status || 500
    this.code = options.code || 'INTERNAL_SERVER_ERROR'
    
    // Validation properties
    this.valid = options.valid !== undefined ? options.valid : false
    this.key = options.key || null
    
    // Error message properties
    this.message = options.message || 'An error occurred'
    this.description = options.description || null
    this.userMessage = options.userMessage || this.generateUserFriendlyMessage()
    
    // Metadata and context
    this.meta = options.meta || {}
    this.layer = options.layer || 'unknown'
    this.stack = options.stack || null
    this.src = options.src || 'application'
    this.origin = options.origin || null
    this.data = options.data || null
    
    // Request context
    this.requestId = options.requestId || null
    this.userId = options.userId || null
    this.sessionId = options.sessionId || null
    this.correlationId = options.correlationId || null
    
    // Security and monitoring
    this.severity = options.severity || this.calculateSeverity()
    this.category = options.category || this.categorizeError()
    this.tags = options.tags || []
    this.fingerprint = options.fingerprint || this.generateFingerprint()
    
    // Performance metrics
    this.responseTime = options.responseTime || null
    this.memoryUsage = options.memoryUsage || null
    
    // Security filtering
    this.sanitize()
  }

  generateUserFriendlyMessage() {
    const statusMessages = {
      400: 'Invalid request. Please check your input and try again.',
      401: 'Authentication required. Please log in to continue.',
      403: 'Access denied. You do not have permission to perform this action.',
      404: 'The requested resource was not found.',
      405: 'Method not allowed for this resource.',
      409: 'A conflict occurred. The resource may have been modified.',
      422: 'Invalid data provided. Please check your input.',
      429: 'Too many requests. Please try again later.',
      500: 'An internal server error occurred. Please try again later.',
      502: 'Service temporarily unavailable. Please try again later.',
      503: 'Service temporarily unavailable. Please try again later.',
      504: 'Request timeout. Please try again later.'
    }
    
    return statusMessages[this.status] || 'An unexpected error occurred.'
  }

  calculateSeverity() {
    if (this.status >= 500) return 'critical'
    if (this.status >= 400) return 'warning'
    if (this.status >= 300) return 'info'
    return 'low'
  }

  categorizeError() {
    if (this.status === 401 || this.status === 403) return 'authentication'
    if (this.status === 400 || this.status === 422) return 'validation'
    if (this.status === 404) return 'not_found'
    if (this.status === 429) return 'rate_limit'
    if (this.status >= 500) return 'system'
    return 'client'
  }

  generateFingerprint() {
    const fingerprintData = {
      code: this.code,
      status: this.status,
      layer: this.layer,
      message: this.message?.substring(0, 100) // Limit message length for fingerprint
    }
    
    return crypto
      .createHash('md5')
      .update(JSON.stringify(fingerprintData))
      .digest('hex')
      .substring(0, 8)
  }

  sanitize() {
    // Remove sensitive information from error details
    const sensitivePatterns = [
      /password/gi,
      /token/gi,
      /key/gi,
      /secret/gi,
      /credential/gi,
      /authorization/gi
    ]
    
    // Sanitize message
    if (this.message) {
      for (const pattern of sensitivePatterns) {
        this.message = this.message.replace(pattern, '[REDACTED]')
      }
    }
    
    // Sanitize description
    if (this.description) {
      for (const pattern of sensitivePatterns) {
        this.description = this.description.replace(pattern, '[REDACTED]')
      }
    }
    
    // Sanitize meta object
    if (this.meta && typeof this.meta === 'object') {
      this.meta = this.sanitizeObject(this.meta)
    }
    
    // Sanitize stack trace
    if (this.stack) {
      for (const pattern of sensitivePatterns) {
        this.stack = this.stack.replace(pattern, '[REDACTED]')
      }
    }
  }

  sanitizeObject(obj) {
    const sanitized = {}
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'credential', 'authorization']
    
    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase()
      
      if (sensitiveKeys.some(sensitive => keyLower.includes(sensitive))) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value)
      } else {
        sanitized[key] = value
      }
    }
    
    return sanitized
  }

  addTag(tag) {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag)
    }
    return this
  }

  addMeta(key, value) {
    this.meta[key] = value
    return this
  }

  setUserContext(userId, sessionId = null) {
    this.userId = userId
    this.sessionId = sessionId
    return this
  }

  setRequestContext(requestId, correlationId = null) {
    this.requestId = requestId
    this.correlationId = correlationId
    return this
  }

  setPerformanceMetrics(responseTime, memoryUsage = null) {
    this.responseTime = responseTime
    this.memoryUsage = memoryUsage || process.memoryUsage()
    return this
  }

  // Create a version suitable for logging (includes sensitive data)
  toLogFormat() {
    return {
      logId: this.logId,
      timestamp: this.timestamp,
      status: this.status,
      code: this.code,
      message: this.message,
      description: this.description,
      layer: this.layer,
      stack: this.stack,
      src: this.src,
      origin: this.origin,
      meta: this.meta,
      requestId: this.requestId,
      userId: this.userId,
      sessionId: this.sessionId,
      correlationId: this.correlationId,
      severity: this.severity,
      category: this.category,
      tags: this.tags,
      fingerprint: this.fingerprint,
      responseTime: this.responseTime,
      memoryUsage: this.memoryUsage
    }
  }

  // Create a version suitable for client response (sanitized)
  toClientFormat(includeStack = false) {
    const clientResponse = {
      success: this.success,
      status: this.status,
      code: this.code,
      message: this.userMessage,
      logId: this.logId,
      timestamp: this.timestamp,
      data: this.data
    }
    
    // Include additional details for client errors (4xx)
    if (this.status >= 400 && this.status < 500) {
      if (this.description && !this.description.includes('[REDACTED]')) {
        clientResponse.description = this.description
      }
      
      if (this.key) {
        clientResponse.key = this.key
      }
      
      if (this.valid !== undefined) {
        clientResponse.valid = this.valid
      }
    }
    
    // Include stack trace only in development and if explicitly requested
    if (includeStack && this.stack && process.env.NODE_ENV !== 'production') {
      clientResponse.stack = this.stack
    }
    
    return clientResponse
  }

  // Create a version suitable for monitoring/alerting systems
  toMonitoringFormat() {
    return {
      logId: this.logId,
      timestamp: this.timestamp,
      status: this.status,
      code: this.code,
      severity: this.severity,
      category: this.category,
      fingerprint: this.fingerprint,
      layer: this.layer,
      src: this.src,
      requestId: this.requestId,
      userId: this.userId,
      tags: this.tags,
      responseTime: this.responseTime,
      message: this.message?.substring(0, 200) // Truncate for monitoring
    }
  }

  // Static factory methods for common error types
  static badRequest(message = 'Bad Request', options = {}) {
    return new ErrorResponse({
      status: 400,
      code: 'BAD_REQUEST',
      message,
      category: 'validation',
      ...options
    })
  }

  static unauthorized(message = 'Unauthorized', options = {}) {
    return new ErrorResponse({
      status: 401,
      code: 'UNAUTHORIZED',
      message,
      category: 'authentication',
      ...options
    })
  }

  static forbidden(message = 'Forbidden', options = {}) {
    return new ErrorResponse({
      status: 403,
      code: 'FORBIDDEN',
      message,
      category: 'authentication',
      ...options
    })
  }

  static notFound(message = 'Not Found', options = {}) {
    return new ErrorResponse({
      status: 404,
      code: 'NOT_FOUND',
      message,
      category: 'not_found',
      ...options
    })
  }

  static validationError(message = 'Validation Error', options = {}) {
    return new ErrorResponse({
      status: 422,
      code: 'VALIDATION_ERROR',
      message,
      category: 'validation',
      ...options
    })
  }

  static tooManyRequests(message = 'Too Many Requests', options = {}) {
    return new ErrorResponse({
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      message,
      category: 'rate_limit',
      ...options
    })
  }

  static internalServerError(message = 'Internal Server Error', options = {}) {
    return new ErrorResponse({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message,
      category: 'system',
      severity: 'critical',
      ...options
    })
  }

  static serviceUnavailable(message = 'Service Unavailable', options = {}) {
    return new ErrorResponse({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message,
      category: 'system',
      severity: 'critical',
      ...options
    })
  }
}

module.exports = ErrorResponse
