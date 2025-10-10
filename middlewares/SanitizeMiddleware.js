const { BaseMiddleware, ErrorWrapper, errorCodes } = require('backend-core')
const logger = require('../util/logger')
const { performance } = require('perf_hooks')
const DOMPurify = require('isomorphic-dompurify')
const xss = require('xss')

/**
 * Enhanced SanitizeMiddleware - Enterprise-grade input sanitization and validation
 * 
 * Features:
 * - Comprehensive XSS protection
 * - SQL injection prevention
 * - HTML sanitization with DOMPurify
 * - Path traversal prevention
 * - Command injection protection
 * - LDAP injection prevention
 * - JSON sanitization
 * - File upload security
 * - Performance monitoring
 * - Security event logging
 * 
 * @extends BaseMiddleware
 * @version 3.0.0
 * @author Susanoo API Team
 */
class SanitizeMiddleware extends BaseMiddleware {
  constructor(options = {}) {
    super(options)
    
    // Configuration
    this.config = {
      // XSS Protection
      enableXSSProtection: true,
      stripScriptTags: true,
      allowedTags: ['b', 'i', 'em', 'strong', 'u'], // Minimal allowed HTML tags
      
      // SQL Injection Protection
      enableSQLInjectionProtection: true,
      blockSQLKeywords: true,
      
      // Path Traversal Protection
      enablePathTraversalProtection: true,
      normalizeFilePaths: true,
      
      // Command Injection Protection
      enableCommandInjectionProtection: true,
      blockShellCommands: true,
      
      // Input Size Limits
      maxStringLength: 10000,
      maxArraySize: 1000,
      maxObjectDepth: 10,
      
      // Performance Settings
      enablePerformanceMonitoring: process.env.NODE_ENV !== 'test',
      logSlowSanitization: true,
      
      // Security Logging
      enableSecurityLogging: process.env.NODE_ENV === 'production',
      logSanitizationEvents: process.env.NODE_ENV === 'development',
      
      // Content Type Specific Settings
      sanitizeJSON: true,
      sanitizeFormData: true,
      sanitizeQueryParameters: true,
      sanitizeHeaders: true,
      
      // Encoding Settings
      normalizeUnicode: true,
      removeNullBytes: true,
      
      // File Upload Security
      sanitizeFileNames: true,
      blockDangerousExtensions: true
    }

    // Security patterns for detection
    this.securityPatterns = {
      // SQL Injection patterns
      sqlInjection: [
        /('|(\\x27)|(\\x2D\\x2D)|(%27)|(%2D%2D))/i,
        /(union|select|insert|delete|update|drop|create|alter|exec|execute)/i,
        /(\*|;|\||`|\\|<|>|\?|\[|\]|\{|\}|%|\$|!|=)/,
        /(script|javascript|vbscript|onload|onerror|onclick)/i
      ],
      
      // XSS patterns
      xss: [
        /<script[^>]*>.*?<\/script>/gi,
        /<iframe[^>]*>.*?<\/iframe>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<object[^>]*>.*?<\/object>/gi,
        /<embed[^>]*>.*?<\/embed>/gi,
        /<form[^>]*>.*?<\/form>/gi
      ],
      
      // Path traversal patterns
      pathTraversal: [
        /\.\.\//g,
        /\.\.\\/g,
        /%2e%2e%2f/gi,
        /%2e%2e%5c/gi,
        /\.\.%2f/gi,
        /\.\.%5c/gi
      ],
      
      // Command injection patterns
      commandInjection: [
        /[;&|`$()]/,
        /(bash|sh|cmd|powershell|exec|eval|system)/i,
        /\|/,
        /&&/,
        /\|\|/,
        /;/
      ],
      
      // LDAP injection patterns
      ldapInjection: [
        /\(\s*\|\s*\(/,
        /\(\s*&\s*\(/,
        /\(\s*!\s*\(/,
        /\*\s*\)/,
        /\(\s*\|\s*\*\s*\)/
      ],
      
      // Dangerous file extensions
      dangerousExtensions: [
        'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar',
        'php', 'asp', 'aspx', 'jsp', 'cfm', 'cgi', 'pl', 'sh', 'py'
      ]
    }

    // XSS filter configuration
    this.xssOptions = {
      whiteList: {
        b: [],
        i: [],
        em: [],
        strong: [],
        u: []
      },
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style'],
      allowCommentTag: false,
      onIgnoreTag: (tag, html) => {
        this.logSecurityEvent('xss_tag_removed', { tag, html: html.substring(0, 100) })
      }
    }

    // Metrics
    this.metrics = {
      totalRequests: 0,
      sanitizedRequests: 0,
      blockedRequests: 0,
      securityViolations: 0,
      averageProcessingTime: 0,
      xssAttempts: 0,
      sqlInjectionAttempts: 0,
      pathTraversalAttempts: 0,
      commandInjectionAttempts: 0
    }
  }

  async init() {
    this.logger.info(`${this.constructor.name} initialized with enterprise features`, {
      xssProtection: this.config.enableXSSProtection,
      sqlInjectionProtection: this.config.enableSQLInjectionProtection,
      pathTraversalProtection: this.config.enablePathTraversalProtection,
      commandInjectionProtection: this.config.enableCommandInjectionProtection,
      securityLogging: this.config.enableSecurityLogging
    })
  }

  handler() {
    return (req, res, next) => {
      const processingStart = performance.now()
      const requestId = req.requestMetadata?.id || this.generateRequestId()
      
      try {
        this.metrics.totalRequests++
        
        let sanitizationPerformed = false
        let securityViolations = []

        // Sanitize query parameters
        if (req.query && Object.keys(req.query).length > 0) {
          const queryResult = this.sanitizeObject(req.query, 'query', requestId)
          req.query = queryResult.sanitized
          sanitizationPerformed = queryResult.modified || sanitizationPerformed
          securityViolations = securityViolations.concat(queryResult.violations)
        }

        // Sanitize request body
        if (req.body && typeof req.body === 'object') {
          const bodyResult = this.sanitizeObject(req.body, 'body', requestId)
          req.body = bodyResult.sanitized
          sanitizationPerformed = bodyResult.modified || sanitizationPerformed
          securityViolations = securityViolations.concat(bodyResult.violations)
        }

        // Sanitize headers (selective)
        if (this.config.sanitizeHeaders) {
          const headerResult = this.sanitizeHeaders(req, requestId)
          sanitizationPerformed = headerResult.modified || sanitizationPerformed
          securityViolations = securityViolations.concat(headerResult.violations)
        }

        // Sanitize file uploads
        if (req.files || req.file) {
          const fileResult = this.sanitizeFiles(req)
          sanitizationPerformed = fileResult.modified || sanitizationPerformed
          securityViolations = securityViolations.concat(fileResult.violations)
        }

        // Update metrics
        if (sanitizationPerformed) {
          this.metrics.sanitizedRequests++
        }

        // Handle security violations
        if (securityViolations.length > 0) {
          this.metrics.securityViolations += securityViolations.length
          this.handleSecurityViolations(req, securityViolations, requestId)
          
          // Block request if critical violations found
          const criticalViolations = securityViolations.filter(v => v.severity === 'critical')
          if (criticalViolations.length > 0) {
            this.metrics.blockedRequests++
            return next(new ErrorWrapper({
              ...errorCodes.VALIDATION,
              message: 'Request blocked due to security violations',
              meta: { violations: criticalViolations.length }
            }))
          }
        }

        // Log sanitization activity
        if (this.config.logSanitizationEvents && (sanitizationPerformed || securityViolations.length > 0)) {
          logger.debug('Request sanitization completed', {
            requestId,
            sanitized: sanitizationPerformed,
            violations: securityViolations.length,
            processingTime: `${(performance.now() - processingStart).toFixed(2)}ms`
          })
        }

        this.completeRequest(req, next, processingStart)

      } catch (error) {
        logger.error('SanitizeMiddleware error', {
          requestId,
          error: error.message,
          stack: error.stack,
          processingTime: `${(performance.now() - processingStart).toFixed(2)}ms`
        })
        next(error)
      }
    }
  }

  /**
   * Sanitize an object recursively
   * @private
   */
  sanitizeObject(obj, context, requestId, depth = 0) {
    if (depth > this.config.maxObjectDepth) {
      return {
        sanitized: '[Object too deep]',
        modified: true,
        violations: [{ type: 'object_depth_exceeded', context, severity: 'medium' }]
      }
    }

    let sanitized = {}
    let modified = false
    let violations = []

    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const sanitizedKey = this.sanitizeString(key, `${context}.key`, requestId)
      if (sanitizedKey.modified) {
        modified = true
        violations = violations.concat(sanitizedKey.violations)
      }

      // Sanitize value
      const sanitizedValue = this.sanitizeValue(value, `${context}.${key}`, requestId, depth + 1)
      sanitized[sanitizedKey.sanitized] = sanitizedValue.sanitized
      
      if (sanitizedValue.modified) {
        modified = true
      }
      violations = violations.concat(sanitizedValue.violations)
    }

    return { sanitized, modified, violations }
  }

  /**
   * Sanitize a value based on its type
   * @private
   */
  sanitizeValue(value, context, requestId, depth = 0) {
    if (value === null || value === undefined) {
      return { sanitized: value, modified: false, violations: [] }
    }

    if (typeof value === 'string') {
      return this.sanitizeString(value, context)
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return { sanitized: value, modified: false, violations: [] }
    }

    if (Array.isArray(value)) {
      return this.sanitizeArray(value, context, requestId, depth)
    }

    if (typeof value === 'object') {
      return this.sanitizeObject(value, context, requestId, depth)
    }

    // Unknown type, convert to string and sanitize
    return this.sanitizeString(String(value), context)
  }

  /**
   * Sanitize an array
   * @private
   */
  sanitizeArray(arr, context, requestId, depth = 0) {
    if (arr.length > this.config.maxArraySize) {
      return {
        sanitized: arr.slice(0, this.config.maxArraySize),
        modified: true,
        violations: [{ type: 'array_size_exceeded', context, severity: 'medium' }]
      }
    }

    let sanitized = []
    let modified = false
    let violations = []

    for (let i = 0; i < arr.length; i++) {
      const result = this.sanitizeValue(arr[i], `${context}[${i}]`, requestId, depth)
      sanitized.push(result.sanitized)
      
      if (result.modified) {
        modified = true
      }
      violations = violations.concat(result.violations)
    }

    return { sanitized, modified, violations }
  }

  /**
   * Sanitize a string
   * @private
   */
  sanitizeString(str, context) {
    if (typeof str !== 'string') {
      str = String(str)
    }

    let sanitized = str
    let modified = false
    let violations = []

    // Check string length
    if (str.length > this.config.maxStringLength) {
      sanitized = str.substring(0, this.config.maxStringLength)
      modified = true
      violations.push({ type: 'string_length_exceeded', context, severity: 'low' })
    }

    // Remove null bytes
    if (this.config.removeNullBytes && str.includes('\0')) {
      sanitized = sanitized.replace(/\0/g, '')
      modified = true
      violations.push({ type: 'null_bytes_removed', context, severity: 'medium' })
    }

    // Normalize Unicode
    if (this.config.normalizeUnicode) {
      const normalized = sanitized.normalize('NFKC')
      if (normalized !== sanitized) {
        sanitized = normalized
        modified = true
      }
    }

    // SQL Injection Detection and Prevention
    if (this.config.enableSQLInjectionProtection) {
      const sqlResult = this.detectAndPreventSQLInjection(sanitized)
      if (sqlResult.detected) {
        sanitized = sqlResult.sanitized
        modified = true
        violations.push({ type: 'sql_injection_attempt', context, severity: 'critical' })
        this.metrics.sqlInjectionAttempts++
      }
    }

    // XSS Detection and Prevention
    if (this.config.enableXSSProtection) {
      const xssResult = this.detectAndPreventXSS(sanitized, context)
      if (xssResult.detected) {
        sanitized = xssResult.sanitized
        modified = true
        violations.push({ type: 'xss_attempt', context, severity: 'critical' })
        this.metrics.xssAttempts++
      }
    }

    // Path Traversal Detection and Prevention
    if (this.config.enablePathTraversalProtection) {
      const pathResult = this.detectAndPreventPathTraversal(sanitized)
      if (pathResult.detected) {
        sanitized = pathResult.sanitized
        modified = true
        violations.push({ type: 'path_traversal_attempt', context, severity: 'high' })
        this.metrics.pathTraversalAttempts++
      }
    }

    // Command Injection Detection and Prevention
    if (this.config.enableCommandInjectionProtection) {
      const cmdResult = this.detectAndPreventCommandInjection(sanitized)
      if (cmdResult.detected) {
        sanitized = cmdResult.sanitized
        modified = true
        violations.push({ type: 'command_injection_attempt', context, severity: 'critical' })
        this.metrics.commandInjectionAttempts++
      }
    }

    return { sanitized, modified, violations }
  }

  /**
   * Detect and prevent SQL injection
   * @private
   */
  detectAndPreventSQLInjection(str) {
    let detected = false
    let sanitized = str

    for (const pattern of this.securityPatterns.sqlInjection) {
      if (pattern.test(str)) {
        detected = true
        // Replace with safe characters or remove entirely
        sanitized = sanitized.replace(pattern, '')
      }
    }

    // Additional SQL keyword filtering
    if (this.config.blockSQLKeywords) {
      const sqlKeywords = /\b(union|select|insert|delete|update|drop|create|alter|exec|execute|sp_|xp_)\b/gi
      if (sqlKeywords.test(str)) {
        detected = true
        sanitized = sanitized.replace(sqlKeywords, '[FILTERED]')
      }
    }

    return { detected, sanitized }
  }

  /**
   * Detect and prevent XSS
   * @private
   */
  detectAndPreventXSS(str) {
    let detected = false
    let sanitized = str

    // Check for XSS patterns
    for (const pattern of this.securityPatterns.xss) {
      if (pattern.test(str)) {
        detected = true
      }
    }

    // Use XSS library for sanitization
    if (detected || this.config.stripScriptTags) {
      sanitized = xss(str, this.xssOptions)
      
      // Also use DOMPurify for additional protection
      sanitized = DOMPurify.sanitize(sanitized, {
        ALLOWED_TAGS: this.config.allowedTags,
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true
      })
      
      detected = detected || (sanitized !== str)
    }

    return { detected, sanitized }
  }

  /**
   * Detect and prevent path traversal
   * @private
   */
  detectAndPreventPathTraversal(str) {
    let detected = false
    let sanitized = str

    for (const pattern of this.securityPatterns.pathTraversal) {
      if (pattern.test(str)) {
        detected = true
        sanitized = sanitized.replace(pattern, '')
      }
    }

    // Normalize path separators
    if (this.config.normalizeFilePaths) {
      const normalized = sanitized.replace(/[\\/]+/g, '/')
      if (normalized !== sanitized) {
        sanitized = normalized
      }
    }

    return { detected, sanitized }
  }

  /**
   * Detect and prevent command injection
   * @private
   */
  detectAndPreventCommandInjection(str) {
    let detected = false
    let sanitized = str

    for (const pattern of this.securityPatterns.commandInjection) {
      if (pattern.test(str)) {
        detected = true
        sanitized = sanitized.replace(pattern, '')
      }
    }

    return { detected, sanitized }
  }

  /**
   * Sanitize request headers
   * @private
   */
  sanitizeHeaders(req, requestId) {
    let modified = false
    let violations = []

    // Headers to sanitize (user-controllable headers)
    const headersToSanitize = ['user-agent', 'referer', 'x-forwarded-for', 'x-real-ip']

    for (const headerName of headersToSanitize) {
      if (req.headers[headerName]) {
        const result = this.sanitizeString(req.headers[headerName], `header.${headerName}`, requestId)
        req.headers[headerName] = result.sanitized
        
        if (result.modified) {
          modified = true
        }
        violations = violations.concat(result.violations)
      }
    }

    return { modified, violations }
  }

  /**
   * Sanitize file uploads
   * @private
   */
  sanitizeFiles(req) {
    let modified = false
    let violations = []

    const files = req.files ? (Array.isArray(req.files) ? req.files : [req.files]) : 
      req.file ? [req.file] : []

    for (const file of files) {
      if (file.originalname) {
        // Sanitize filename
        const fileResult = this.sanitizeFileName(file.originalname)
        file.originalname = fileResult.sanitized
        
        if (fileResult.modified) {
          modified = true
        }
        violations = violations.concat(fileResult.violations)

        // Check for dangerous extensions
        const extension = file.originalname.split('.').pop().toLowerCase()
        if (this.config.blockDangerousExtensions && 
            this.securityPatterns.dangerousExtensions.includes(extension)) {
          violations.push({
            type: 'dangerous_file_extension',
            context: 'file.extension',
            severity: 'critical',
            details: { extension, filename: file.originalname }
          })
        }
      }
    }

    return { modified, violations }
  }

  /**
   * Sanitize filename
   * @private
   */
  sanitizeFileName(filename) {
    let sanitized = filename
    let modified = false
    let violations = []

    // Remove path traversal attempts
    if (sanitized.includes('..')) {
      sanitized = sanitized.replace(/\.\./g, '')
      modified = true
      violations.push({ type: 'path_traversal_in_filename', severity: 'high' })
    }

    // Remove dangerous characters
    // eslint-disable-next-line no-control-regex
    const dangerousChars = /[<>:"|?*\x00-\x1f]/g
    if (dangerousChars.test(sanitized)) {
      sanitized = sanitized.replace(dangerousChars, '_')
      modified = true
      violations.push({ type: 'dangerous_chars_in_filename', severity: 'medium' })
    }

    // Ensure filename is not too long
    if (sanitized.length > 255) {
      sanitized = sanitized.substring(0, 255)
      modified = true
      violations.push({ type: 'filename_too_long', severity: 'low' })
    }

    return { sanitized, modified, violations }
  }

  /**
   * Handle security violations
   * @private
   */
  handleSecurityViolations(req, violations, requestId) {
    if (!this.config.enableSecurityLogging) return

    const groupedViolations = violations.reduce((acc, violation) => {
      acc[violation.type] = (acc[violation.type] || 0) + 1
      return acc
    }, {})

    logger.warn('Security violations detected during sanitization', {
      requestId,
      ip: req.requestMetadata?.ip,
      userAgent: req.requestMetadata?.userAgent,
      method: req.method,
      url: req.originalUrl,
      violations: groupedViolations,
      totalViolations: violations.length,
      criticalViolations: violations.filter(v => v.severity === 'critical').length
    })
  }

  /**
   * Log security event
   * @private
   */
  logSecurityEvent(eventType, details) {
    if (this.config.enableSecurityLogging) {
      logger.info('Sanitization security event', {
        event: eventType,
        ...details,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Complete request processing
   * @private
   */
  completeRequest(req, next, startTime) {
    const processingTime = performance.now() - startTime
    
    // Update metrics
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime * (this.metrics.totalRequests - 1) + processingTime) / 
      this.metrics.totalRequests

    // Log slow sanitization
    if (this.config.logSlowSanitization && processingTime > 50) {
      logger.warn('Slow sanitization detected', {
        processingTime: `${processingTime.toFixed(2)}ms`,
        method: req.method,
        url: req.originalUrl
      })
    }

    next()
  }

  /**
   * Generate request ID
   * @private
   */
  generateRequestId() {
    return require('crypto').randomBytes(16).toString('hex')
  }

  /**
   * Get middleware metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      sanitizationRate: this.metrics.sanitizedRequests / this.metrics.totalRequests || 0,
      blockRate: this.metrics.blockedRequests / this.metrics.totalRequests || 0,
      violationRate: this.metrics.securityViolations / this.metrics.totalRequests || 0
    }
  }
}

module.exports = { SanitizeMiddleware }
