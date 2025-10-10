const { BaseMiddleware } = require('backend-core')
const logger = require('../util/logger')

/**
 * Enhanced CorsMiddleware - Advanced CORS handling with security and performance
 * 
 * Features:
 * - Environment-based origin configuration
 * - Security headers integration
 * - Preflight request optimization
 * - Credential handling
 * - Method and header validation
 * - Performance monitoring
 * - Origin whitelist/blacklist support
 * - Dynamic CORS configuration
 * 
 * @extends BaseMiddleware
 * @version 2.0.0
 */
class CorsMiddleware extends BaseMiddleware {
  async init() {
    // Enhanced CORS configuration
    this.config = {
      // Environment-based origins
      origins: {
        development: [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:4000',
          'http://localhost:8080',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
          'http://127.0.0.1:4000',
          'http://127.0.0.1:8080'
        ],
        staging: [
          'https://staging.susano.dev',
          'https://staging-api.susano.dev',
          'https://test.susano.dev'
        ],
        production: [
          'https://susano.dev',
          'https://www.susano.dev',
          'https://api.susano.dev',
          'https://app.susano.dev'
        ]
      },
      
      // Allowed methods
      methods: [
        'GET',
        'POST', 
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
        'HEAD'
      ],
      
      // Allowed headers
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Token',
        'X-Total-Count',
        'X-Request-ID',
        'X-API-Key',
        'X-Client-Version',
        'User-Agent',
        'Cache-Control',
        'If-None-Match',
        'If-Modified-Since'
      ],
      
      // Exposed headers (visible to client)
      exposedHeaders: [
        'X-Total-Count',
        'X-Request-ID',
        'X-Rate-Limit-Remaining',
        'X-Rate-Limit-Reset',
        'ETag',
        'Last-Modified'
      ],
      
      // Security settings
      security: {
        // Allow credentials (cookies, authorization headers)
        credentials: true,
        
        // Maximum age for preflight cache (24 hours)
        maxAge: 86400,
        
        // Enable strict origin checking in production
        strictOriginCheck: process.env.NODE_ENV === 'production',
        
        // Block suspicious origins
        blockedOrigins: [
          // Add patterns for known malicious origins
        ],
        
        // Security headers
        securityHeaders: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin'
        }
      },
      
      // Performance settings
      performance: {
        // Cache preflight responses
        cachePreflightResponses: true,
        
        // Enable compression hint
        enableCompressionHint: true,
        
        // Request tracking
        trackRequests: process.env.NODE_ENV === 'development'
      }
    }
    
    // Get current environment
    this.environment = process.env.NODE_ENV || 'development'
    this.allowedOrigins = this.config.origins[this.environment] || this.config.origins.development

    logger.info(`${this.constructor.name} initialized for ${this.environment} environment`, {
      allowedOrigins: this.allowedOrigins,
      allowedMethods: this.config.methods,
      credentialsEnabled: this.config.security.credentials,
      strictOriginCheck: this.config.security.strictOriginCheck
    })
  }

  handler() {
    return (req, res, next) => {
      const startTime = Date.now()
      const requestId = req.requestId || this.generateRequestId()
      
      try {
        // Performance tracking
        if (this.config.performance.trackRequests) {
          logger.debug('CORS processing started', {
            requestId,
            method: req.method,
            origin: req.headers.origin,
            url: req.url
          })
        }

        // Enhanced origin validation
        const origin = req.headers.origin
        const isValidOrigin = this.validateOrigin(origin, req)
        
        // Set CORS headers based on validation
        this.setCorsHeaders(res, origin, isValidOrigin, req)
        
        // Add security headers
        this.addSecurityHeaders(res)
        
        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          return this.handlePreflightRequest(req, res, requestId, startTime)
        }
        
        // Log and continue
        this.completeRequest(req, res, next, requestId, startTime)

      } catch (error) {
        logger.error('CORS middleware error', {
          requestId,
          method: req.method,
          origin: req.headers.origin,
          error: error.message,
          processingTime: Date.now() - startTime
        })
        
        // Still allow request to continue but with restrictive CORS
        this.setRestrictiveCorsHeaders(res)
        next()
      }
    }
  }

  /**
   * Validate origin against allowed origins and security rules
   */
  validateOrigin(origin, req) {
    // Allow requests without origin (e.g., same-origin, mobile apps)
    if (!origin) {
      return !this.config.security.strictOriginCheck
    }

    // Check blocked origins first
    if (this.isOriginBlocked(origin)) {
      logger.warn('Blocked origin detected', {
        origin,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']
      })
      return false
    }

    // In development, be more permissive
    if (this.environment === 'development') {
      // Allow localhost with any port
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return true
      }
    }

    // Check against allowed origins
    return this.allowedOrigins.some(allowedOrigin => {
      // Exact match
      if (origin === allowedOrigin) return true
      
      // Wildcard subdomain matching (e.g., *.susano.dev)
      if (allowedOrigin.startsWith('*.')) {
        const domain = allowedOrigin.substring(2)
        return origin.endsWith(domain)
      }
      
      return false
    })
  }

  /**
   * Check if origin is in blocked list
   */
  isOriginBlocked(origin) {
    return this.config.security.blockedOrigins.some(blocked => {
      if (typeof blocked === 'string') {
        return origin.includes(blocked)
      }
      if (blocked instanceof RegExp) {
        return blocked.test(origin)
      }
      return false
    })
  }

  /**
   * Set CORS headers based on validation result
   */
  setCorsHeaders(res, origin, isValidOrigin, req) {
    if (isValidOrigin && origin) {
      // Set specific origin for valid requests
      res.header('Access-Control-Allow-Origin', origin)
      
      // Enable credentials for valid origins
      if (this.config.security.credentials) {
        res.header('Access-Control-Allow-Credentials', 'true')
      }
    } else if (!this.config.security.strictOriginCheck) {
      // Fallback for non-strict mode
      res.header('Access-Control-Allow-Origin', '*')
    }

    // Set other CORS headers
    res.header('Access-Control-Allow-Methods', this.config.methods.join(','))
    res.header('Access-Control-Allow-Headers', this.config.allowedHeaders.join(', '))
    res.header('Access-Control-Expose-Headers', this.config.exposedHeaders.join(', '))
    
    // Set max age for preflight caching
    res.header('Access-Control-Max-Age', this.config.security.maxAge.toString())

    // Add Vary header for proper caching
    const varyHeaders = ['Origin']
    if (req.headers['access-control-request-headers']) {
      varyHeaders.push('Access-Control-Request-Headers')
    }
    if (req.headers['access-control-request-method']) {
      varyHeaders.push('Access-Control-Request-Method')
    }
    res.header('Vary', varyHeaders.join(', '))
  }

  /**
   * Add security headers
   */
  addSecurityHeaders(res) {
    Object.entries(this.config.security.securityHeaders).forEach(([header, value]) => {
      if (!res.getHeader(header)) {
        res.header(header, value)
      }
    })

    // Add performance hints
    if (this.config.performance.enableCompressionHint) {
      res.header('Accept-Encoding', 'gzip, deflate, br')
    }
  }

  /**
   * Handle OPTIONS preflight requests
   */
  handlePreflightRequest(req, res, requestId, startTime) {
    const requestedMethod = req.headers['access-control-request-method']
    const requestedHeaders = req.headers['access-control-request-headers']

    // Validate requested method
    if (requestedMethod && !this.config.methods.includes(requestedMethod)) {
      logger.warn('Invalid preflight method requested', {
        requestId,
        requestedMethod,
        allowedMethods: this.config.methods,
        origin: req.headers.origin
      })
      
      return res.status(405).json({
        error: 'Method not allowed',
        allowedMethods: this.config.methods
      })
    }

    // Validate requested headers
    if (requestedHeaders) {
      const headers = requestedHeaders.split(',').map(h => h.trim())
      const invalidHeaders = headers.filter(header => 
        !this.config.allowedHeaders.some(allowed => 
          allowed.toLowerCase() === header.toLowerCase()
        )
      )

      if (invalidHeaders.length > 0) {
        logger.warn('Invalid preflight headers requested', {
          requestId,
          invalidHeaders,
          allowedHeaders: this.config.allowedHeaders,
          origin: req.headers.origin
        })
      }
    }

    // Performance logging
    if (this.config.performance.trackRequests) {
      logger.debug('Preflight request handled', {
        requestId,
        requestedMethod,
        requestedHeaders,
        processingTime: `${Date.now() - startTime}ms`,
        origin: req.headers.origin
      })
    }

    // Send successful preflight response
    res.status(204).end()
  }

  /**
   * Set restrictive CORS headers for fallback
   */
  setRestrictiveCorsHeaders(res) {
    res.header('Access-Control-Allow-Origin', 'null')
    res.header('Access-Control-Allow-Methods', 'GET, POST')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    res.header('Access-Control-Max-Age', '0')
  }

  /**
   * Complete request processing
   */
  completeRequest(req, res, next, requestId, startTime) {
    if (this.config.performance.trackRequests) {
      const processingTime = Date.now() - startTime
      
      logger.debug('CORS middleware completed', {
        requestId,
        method: req.method,
        origin: req.headers.origin,
        processingTime: `${processingTime}ms`
      })
    }

    next()
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `cors_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Dynamically add allowed origin (useful for runtime configuration)
   */
  addAllowedOrigin(origin) {
    if (origin && !this.allowedOrigins.includes(origin)) {
      this.allowedOrigins.push(origin)
      logger.info(`Added new allowed origin: ${origin}`)
    }
  }

  /**
   * Remove allowed origin
   */
  removeAllowedOrigin(origin) {
    const index = this.allowedOrigins.indexOf(origin)
    if (index > -1) {
      this.allowedOrigins.splice(index, 1)
      logger.info(`Removed allowed origin: ${origin}`)
    }
  }

  /**
   * Get current CORS configuration
   */
  getConfiguration() {
    return {
      environment: this.environment,
      allowedOrigins: this.allowedOrigins,
      methods: this.config.methods,
      allowedHeaders: this.config.allowedHeaders,
      exposedHeaders: this.config.exposedHeaders,
      credentials: this.config.security.credentials,
      maxAge: this.config.security.maxAge,
      strictOriginCheck: this.config.security.strictOriginCheck
    }
  }
}

module.exports = { CorsMiddleware }
