const config = require('config')
const { BaseMiddleware } = require('backend-core')
// const logger = require('../util/logger')
const { performance } = require('perf_hooks')
const crypto = require('crypto')

/**
 * Enhanced InitMiddleware - Enterprise-grade request initialization
 * 
 * Features:
 * - Comprehensive security headers
 * - Request tracking and correlation IDs
 * - Performance monitoring
 * - Security event logging
 * - Client fingerprinting protection
 * - Rate limiting preparation
 * - Request metadata collection
 * 
 * @extends BaseMiddleware
 * @version 3.0.0
 * @author Susanoo API Team
 */
class InitMiddleware extends BaseMiddleware {
  constructor(options = {}) {
    super(options)
    
    // Initialize configuration
    this.config = {
      // Custom server identification
      serverHeader: config.app.name || 'Susanoo-API',
      
      // Performance monitoring
      enablePerformanceMonitoring: process.env.NODE_ENV !== 'test',
      
      // Request tracking
      enableRequestTracking: true,
      generateCorrelationId: true,
      
      // Security monitoring
      enableSecurityLogging: process.env.NODE_ENV === 'production',
      detectSuspiciousPatterns: true,
      
      // Rate limiting preparation
      enableClientFingerprinting: process.env.NODE_ENV === 'production',
      
      // Environment-specific settings
      exposeErrorDetails: process.env.NODE_ENV === 'development',
      enableDebugHeaders: process.env.NODE_ENV === 'development'
    }

    // Initialize suspicious patterns for security monitoring
    this.suspiciousPatterns = {
      // Common attack patterns in user agents
      userAgentPatterns: [
        /sqlmap/i,
        /nmap/i,
        /nikto/i,
        /masscan/i,
        /zap/i,
        /burp/i,
        /<script/i,
        /javascript:/i
      ],
      
      // Suspicious header patterns
      headerPatterns: [
        /\$\{/, // Template injection
        /<script/i, // XSS attempts
        /\.\./, // Path traversal
        /union.*select/i, // SQL injection
        /exec\(/i, // Command injection
        /eval\(/i // Code evaluation
      ]
    }

    // Performance metrics
    this.metrics = {
      requestCount: 0,
      averageProcessingTime: 0,
      securityEvents: 0,
      lastResetTime: Date.now()
    }

    this.logger.info(`${this.constructor.name} initialized with enterprise features`, {
      performanceMonitoring: this.config.enablePerformanceMonitoring,
      securityLogging: this.config.enableSecurityLogging,
      environment: process.env.NODE_ENV || 'development'
    })
  }

  async init() {
    this.logger.info('InitMiddleware initialized with enterprise features', {
      performanceMonitoring: this.config.enablePerformanceMonitoring,
      securityLogging: this.config.enableSecurityLogging,
      environment: process.env.NODE_ENV || 'development'
    })
  }

  handler() {
    return (req, res, next) => {
      const processingStart = performance.now()
      
      try {
        // Use request ID from Server.js and generate correlation ID
        const requestId = req.id || crypto.randomBytes(16).toString('hex') // fallback if Server.js doesn't set it
        const correlationId = this.generateCorrelationId(req)
        
        // Attach request metadata
        req.requestMetadata = {
          id: requestId,
          correlationId: correlationId,
          startTime: processingStart,
          timestamp: new Date().toISOString(),
          ip: this.getClientIP(req),
          userAgent: req.get('User-Agent') || 'unknown',
          method: req.method,
          url: req.originalUrl || req.url,
          protocol: req.protocol,
          secure: req.secure
        }

        // Add correlation ID for tracking (X-Request-ID is already set in Server.js)
        if (this.config.generateCorrelationId) {
          res.header('X-Correlation-ID', correlationId)
        }
        // Add debug headers in development
        if (this.config.enableDebugHeaders) {
          res.header('X-Node-Version', process.version)
          res.header('X-Environment', process.env.NODE_ENV || 'development')
          res.header('X-Timestamp', req.requestMetadata.timestamp)
        }

        // Security monitoring
        if (this.config.enableSecurityLogging) {
          this.performSecurityChecks(req)
        }

        // Client fingerprinting for rate limiting
        if (this.config.enableClientFingerprinting) {
          req.clientFingerprint = this.generateClientFingerprint(req)
        }

        // Performance monitoring setup
        if (this.config.enablePerformanceMonitoring) {
          this.setupPerformanceMonitoring(req, res)
        }

        // Update metrics
        this.updateMetrics(processingStart)
        
        // Log request initialization
        this.logger.debug('Request initialized', {
          requestId,
          correlationId,
          method: req.method,
          url: req.originalUrl,
          ip: req.requestMetadata.ip,
          userAgent: req.requestMetadata.userAgent,
          processingTime: `${(performance.now() - processingStart).toFixed(2)}ms`
        })

        next()
      } catch (error) {
        this.logger.error('InitMiddleware error', {
          error: error.message,
          stack: error.stack,
          method: req.method,
          url: req.originalUrl,
          processingTime: `${(performance.now() - processingStart).toFixed(2)}ms`
        })
        
        next(error)
      }
    }
  }

  /**
   * Generate correlation ID for request tracking
   * @private
   */
  generateCorrelationId(req) {
    // Use existing correlation ID from headers or generate new one
    const existingCorrelationId = req.get('X-Correlation-ID') || 
                                 req.get('X-Request-ID') ||
                                 req.get('Request-ID')
    
    if (existingCorrelationId && /^[a-f0-9]{32}$/.test(existingCorrelationId)) {
      return existingCorrelationId
    }
    
    return crypto.randomBytes(16).toString('hex')
  }

  /**
   * Get real client IP address
   * @private
   */
  getClientIP(req) {
    return req.ip ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.connection?.socket?.remoteAddress ||
           'unknown'
  }
  /**
   * Perform security checks on incoming request
   * @private
   */
  performSecurityChecks(req) {
    const userAgent = req.get('User-Agent') || ''
    let securityEvents = []

    // Check user agent for suspicious patterns
    this.suspiciousPatterns.userAgentPatterns.forEach(pattern => {
      if (pattern.test(userAgent)) {
        securityEvents.push({
          type: 'suspicious_user_agent',
          pattern: pattern.toString(),
          value: userAgent
        })
      }
    })

    // Check all headers for suspicious patterns
    Object.entries(req.headers).forEach(([headerName, headerValue]) => {
      if (typeof headerValue === 'string') {
        this.suspiciousPatterns.headerPatterns.forEach(pattern => {
          if (pattern.test(headerValue)) {
            securityEvents.push({
              type: 'suspicious_header',
              header: headerName,
              pattern: pattern.toString(),
              value: headerValue.substring(0, 100) // Limit logged value length
            })
          }
        })
      }
    })

    // Log security events
    if (securityEvents.length > 0) {
      this.metrics.securityEvents += securityEvents.length
      
      this.logger.warn('Security events detected', {
        requestId: req.requestMetadata?.id,
        ip: req.requestMetadata?.ip,
        method: req.method,
        url: req.originalUrl,
        events: securityEvents,
        userAgent: userAgent.substring(0, 200)
      })
    }
  }

  /**
   * Generate client fingerprint for rate limiting
   * @private
   */
  generateClientFingerprint(req) {
    const fingerprint = crypto.createHash('sha256')
    
    // Include various client characteristics
    fingerprint.update(req.requestMetadata.ip || '')
    fingerprint.update(req.get('User-Agent') || '')
    fingerprint.update(req.get('Accept-Language') || '')
    fingerprint.update(req.get('Accept-Encoding') || '')
    
    return fingerprint.digest('hex').substring(0, 16)
  }

  /**
   * Setup performance monitoring
   * @private
   */
  /**
   * Setup performance monitoring
   * @private
   */
  setupPerformanceMonitoring(req, res) {
    const originalSend = res.send
    const startTime = performance.now()
    const self = this
    
    res.send = function(data) {
      const processingTime = performance.now() - startTime
      
      // Add performance headers
      res.header('X-Response-Time', `${processingTime.toFixed(2)}ms`)
      
      if (processingTime > 1000) { // > 1 second
        self.logger.warn('Slow request detected', {
          requestId: req.requestMetadata?.id,
          method: req.method,
          url: req.originalUrl,
          processingTime: `${processingTime.toFixed(2)}ms`,
          statusCode: res.statusCode
        })
      }
      
      return originalSend.call(this, data)
    }
  }

  /**
   * Update performance metrics
   * @private
   */
  updateMetrics(startTime) {
    this.metrics.requestCount++
    const processingTime = performance.now() - startTime
    
    // Calculate rolling average
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime * (this.metrics.requestCount - 1) + processingTime) / 
      this.metrics.requestCount

    // Reset metrics hourly
    const now = Date.now()
    if (now - this.metrics.lastResetTime > 3600000) { // 1 hour
      this.metrics = {
        requestCount: 1,
        averageProcessingTime: processingTime,
        securityEvents: 0,
        lastResetTime: now
      }
    }
  }

  /**
   * Get current metrics (for monitoring)
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.lastResetTime
    }
  }
}

module.exports = { InitMiddleware }
