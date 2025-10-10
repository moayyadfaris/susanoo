const stdout = require('stdout-stream')
const ErrorResponse = require('./ErrorResponse')
const { errorCodes, BaseMiddleware } = require('backend-core')
const { performance } = require('perf_hooks')
const fs = require('fs').promises
const path = require('path')
const crypto = require('crypto')

class DevErrorMiddleware extends BaseMiddleware {
  constructor(options = {}) {
    super(options)
    
    // Error tracking and analytics
    this.errorMetrics = {
      totalErrors: 0,
      errorsByStatus: new Map(),
      errorsByCategory: new Map(),
      errorsByFingerprint: new Map(),
      recentErrors: [],
      maxRecentErrors: 100
    }
    
    // Development configuration
    this.config = {
      enableStackTrace: true,
      enableSourceMapping: true,
      enableErrorDumping: true,
      dumpDirectory: './logs/error-dumps',
      maxDumpFiles: 50,
      enablePerformanceTracking: true,
      enableDebugHeaders: true,
      enableErrorProfiling: true
    }
    
    // Error categorization patterns
    this.errorPatterns = new Map([
      ['Database', /database|sql|connection|query|sequelize|knex/gi],
      ['Authentication', /auth|login|token|session|credential/gi],
      ['Validation', /validation|required|invalid|missing|format/gi],
      ['Network', /network|timeout|connect|socket|dns/gi],
      ['FileSystem', /file|directory|path|enoent|eacces/gi],
      ['Memory', /memory|heap|stack overflow|out of memory/gi],
      ['Parsing', /parse|json|xml|syntax|unexpected token/gi]
    ])
    
    this.initializeErrorDumping()
  }

  async init() {
    try {
      // Setup error dump directory
      if (this.config.enableErrorDumping) {
        await this.setupErrorDumpDirectory()
      }
      
      // Start error metrics collection
      this.startMetricsCollection()
      
      this.logger.debug(`${this.constructor.name} initialized with enhanced development features`)
    } catch (error) {
      this.logger.error(`${this.constructor.name} initialization failed:`, error)
      throw error
    }
  }

  async setupErrorDumpDirectory() {
    try {
      await fs.mkdir(this.config.dumpDirectory, { recursive: true })
      this.logger.debug(`Error dump directory created: ${this.config.dumpDirectory}`)
    } catch (error) {
      this.logger.warn('Failed to create error dump directory:', error)
      this.config.enableErrorDumping = false
    }
  }

  initializeErrorDumping() {
    // Pre-populate status code tracking
    const commonStatusCodes = [400, 401, 403, 404, 422, 429, 500, 502, 503, 504]
    for (const status of commonStatusCodes) {
      this.errorMetrics.errorsByStatus.set(status, 0)
    }
  }

  startMetricsCollection() {
    // Log error metrics every 10 minutes in development
    setInterval(() => {
      this.logErrorMetrics()
    }, 600000)
    
    // Cleanup old error dumps every hour
    if (this.config.enableErrorDumping) {
      setInterval(() => {
        this.cleanupOldErrorDumps()
      }, 3600000)
    }
  }

  logErrorMetrics() {
    const metrics = {
      totalErrors: this.errorMetrics.totalErrors,
      errorsByStatus: Object.fromEntries(this.errorMetrics.errorsByStatus),
      errorsByCategory: Object.fromEntries(this.errorMetrics.errorsByCategory),
      uniqueFingerprints: this.errorMetrics.errorsByFingerprint.size,
      recentErrorsCount: this.errorMetrics.recentErrors.length
    }
    
    this.logger.info('DevErrorMiddleware Metrics:', metrics)
  }

  async cleanupOldErrorDumps() {
    try {
      const files = await fs.readdir(this.config.dumpDirectory)
      const errorDumpFiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.config.dumpDirectory, file)
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      
      if (errorDumpFiles.length > this.config.maxDumpFiles) {
        const filesToDelete = errorDumpFiles.slice(0, errorDumpFiles.length - this.config.maxDumpFiles)
        
        for (const file of filesToDelete) {
          await fs.unlink(file.path)
        }
        
        this.logger.debug(`Cleaned up ${filesToDelete.length} old error dump files`)
      }
    } catch (error) {
      this.logger.warn('Failed to cleanup old error dumps:', error)
    }
  }

  categorizeError(error) {
    const message = error.message || error.toString()
    
    for (const [category, pattern] of this.errorPatterns) {
      if (pattern.test(message)) {
        return category
      }
    }
    
    return 'Unknown'
  }

  updateErrorMetrics(errorRes) {
    this.errorMetrics.totalErrors++
    
    // Update status code metrics
    const currentCount = this.errorMetrics.errorsByStatus.get(errorRes.status) || 0
    this.errorMetrics.errorsByStatus.set(errorRes.status, currentCount + 1)
    
    // Update category metrics
    const category = errorRes.category || 'unknown'
    const categoryCount = this.errorMetrics.errorsByCategory.get(category) || 0
    this.errorMetrics.errorsByCategory.set(category, categoryCount + 1)
    
    // Update fingerprint tracking
    const fingerprintCount = this.errorMetrics.errorsByFingerprint.get(errorRes.fingerprint) || 0
    this.errorMetrics.errorsByFingerprint.set(errorRes.fingerprint, fingerprintCount + 1)
    
    // Add to recent errors
    this.errorMetrics.recentErrors.unshift({
      timestamp: errorRes.timestamp,
      status: errorRes.status,
      message: errorRes.message?.substring(0, 100),
      fingerprint: errorRes.fingerprint
    })
    
    // Limit recent errors array size
    if (this.errorMetrics.recentErrors.length > this.config.maxRecentErrors) {
      this.errorMetrics.recentErrors = this.errorMetrics.recentErrors.slice(0, this.config.maxRecentErrors)
    }
  }

  async dumpErrorToFile(errorRes, req, additionalContext = {}) {
    if (!this.config.enableErrorDumping) return
    
    try {
      const dumpData = {
        error: errorRes.toLogFormat(),
        request: {
          method: req.method,
          url: req.originalUrl,
          headers: this.sanitizeHeaders(req.headers),
          params: req.params,
          query: req.query,
          body: this.sanitizeRequestBody(req.body),
          ip: req.ip,
          userAgent: req.headers['user-agent']
        },
        context: {
          ...additionalContext,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV,
          nodeVersion: process.version,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime()
        }
      }
      
      const filename = `error-${errorRes.logId}-${Date.now()}.json`
      const filepath = path.join(this.config.dumpDirectory, filename)
      
      await fs.writeFile(filepath, JSON.stringify(dumpData, null, 2))
      this.logger.debug(`Error dump created: ${filename}`)
    } catch (error) {
      this.logger.warn('Failed to create error dump:', error)
    }
  }

  sanitizeHeaders(headers) {
    const sanitized = { ...headers }
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token']
    
    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]'
      }
    }
    
    return sanitized
  }

  sanitizeRequestBody(body) {
    if (!body || typeof body !== 'object') return body
    
    const sanitized = { ...body }
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential']
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]'
      }
    }
    
    return sanitized
  }

  generateDetailedStackTrace(error) {
    if (!error.stack) return null
    
    const stackLines = error.stack.split('\n')
    const enhancedStack = []
    
    for (let i = 0; i < stackLines.length; i++) {
      const line = stackLines[i]
      enhancedStack.push({
        line: i + 1,
        content: line.trim(),
        isUserCode: !line.includes('node_modules') && !line.includes('internal/')
      })
    }
    
    return enhancedStack
  }

  generatePerformanceProfile(startTime, memoryBefore) {
    const endTime = performance.now()
    const memoryAfter = process.memoryUsage()
    
    return {
      processingTime: `${(endTime - startTime).toFixed(2)}ms`,
      memoryDelta: {
        heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
        heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
        external: memoryAfter.external - memoryBefore.external
      }
    }
  }

  handler() {
    return async (error, req, res, next) => {
      const startTime = performance.now()
      const memoryBefore = process.memoryUsage()
      const requestId = req.requestId || crypto.randomUUID()
      
      try {
        // Create enhanced error response
        const errorRes = new ErrorResponse({
          ...error,
          code: error.code || errorCodes.SERVER.code,
          status: error.status || (error.status === 404 ? 404 : errorCodes.SERVER.status),
          message: error.message || error.toString(),
          stack: this.config.enableStackTrace ? error.stack : undefined,
          src: `${process.env.NODE_ENV}:err:middleware`,
          origin: error.origin ? { ...error.origin, message: error.origin.message } : undefined,
          requestId,
          userId: req.currentUser?.id,
          sessionId: req.sessionID,
          layer: 'middleware'
        })
        
        // Add development-specific enhancements
        if (this.config.enableSourceMapping && error.stack) {
          errorRes.addMeta('detailedStack', this.generateDetailedStackTrace(error))
        }
        
        if (this.config.enablePerformanceTracking) {
          const performanceProfile = this.generatePerformanceProfile(startTime, memoryBefore)
          errorRes.setPerformanceMetrics(performanceProfile.processingTime, performanceProfile.memoryDelta)
        }
        
        // Add error categorization
        const category = this.categorizeError(error)
        errorRes.addTag(`category:${category}`)
        errorRes.addTag('environment:development')
        
        // Update metrics
        this.updateErrorMetrics(errorRes)
        
        // Enhanced logging for development
        const logData = {
          ...errorRes.toLogFormat(),
          request: {
            method: req.method,
            url: req.originalUrl,
            userAgent: req.headers['user-agent'],
            ip: req.ip
          }
        }
        
        if (errorRes.status >= 500) {
          this.logger.error('Server Error:', logData)
        } else if (![400, 401, 403, 404, 422].includes(errorRes.status)) {
          this.logger.warn('Client Error:', logData)
        } else {
          this.logger.info('Client Error:', logData)
        }
        
        // Development-specific error dumping
        if (this.config.enableErrorDumping && errorRes.status >= 500) {
          await this.dumpErrorToFile(errorRes, req, {
            category,
            fingerprint: errorRes.fingerprint
          })
        }
        
        // Set development-specific response headers
        if (this.config.enableDebugHeaders) {
          res.setHeader('X-Error-ID', errorRes.logId)
          res.setHeader('X-Error-Fingerprint', errorRes.fingerprint)
          res.setHeader('X-Error-Category', category)
          res.setHeader('X-Response-Time', errorRes.responseTime || '0ms')
        }
        
        // Send error response (include stack trace in development)
        const includeStack = this.config.enableStackTrace && ![400, 401, 403, 404, 422].includes(errorRes.status)
        
        // Ensure res has the necessary methods
        if (typeof res.status === 'function' && typeof res.json === 'function') {
          res.status(errorRes.status).json(errorRes.toClientFormat(includeStack))
        } else {
          // Fallback for non-Express response objects
          res.statusCode = errorRes.status
          if (typeof res.setHeader === 'function') {
            res.setHeader('Content-Type', 'application/json')
          }
          if (typeof res.end === 'function') {
            res.end(JSON.stringify(errorRes.toClientFormat(includeStack)))
          } else if (typeof res.write === 'function') {
            res.write(JSON.stringify(errorRes.toClientFormat(includeStack)))
          }
        }
        
        // Enhanced console output for development
        if (error.stack && this.config.enableStackTrace) {
          stdout.write('🔥 =============== ERROR DETAILS BEGIN =============== 🔥\n')
          stdout.write(`📅 Timestamp: ${new Date().toISOString()}\n`)
          stdout.write(`🆔 Error ID: ${errorRes.logId}\n`)
          stdout.write(`🏷️  Category: ${category}\n`)
          stdout.write(`🔍 Fingerprint: ${errorRes.fingerprint}\n`)
          stdout.write(`📊 Status: ${errorRes.status}\n`)
          stdout.write(`💬 Message: ${errorRes.message}\n`)
          stdout.write(`🌐 URL: ${req.method} ${req.originalUrl}\n`)
          stdout.write(`👤 User: ${req.currentUser?.id || 'Anonymous'}\n`)
          stdout.write(`📍 IP: ${req.ip}\n`)
          
          if (errorRes.responseTime) {
            stdout.write(`⏱️  Processing Time: ${errorRes.responseTime}\n`)
          }
          
          stdout.write('\n📚 STACK TRACE:\n')
          stdout.write(`${error.stack}\n`)
          
          if (errorRes.meta && Object.keys(errorRes.meta).length > 0) {
            stdout.write('\n📋 METADATA:\n')
            stdout.write(`${JSON.stringify(errorRes.meta, null, 2)}\n`)
          }
          
          stdout.write('🔥 ================ ERROR DETAILS END ================ 🔥\n\n')
        }
        
      } catch (middlewareError) {
        // Fallback error handling
        this.logger.error('Error in DevErrorMiddleware:', middlewareError)
        
        const fallbackError = ErrorResponse.internalServerError('Error handler failed', {
          requestId,
          originalError: error.message,
          middlewareError: middlewareError.message
        })
        
        // Ensure res has the necessary methods for fallback
        if (typeof res.status === 'function' && typeof res.json === 'function') {
          res.status(500).json(fallbackError.toClientFormat())
        } else {
          // Fallback for non-Express response objects
          res.statusCode = 500
          if (typeof res.setHeader === 'function') {
            res.setHeader('Content-Type', 'application/json')
          }
          if (typeof res.end === 'function') {
            res.end(JSON.stringify(fallbackError.toClientFormat()))
          } else if (typeof res.write === 'function') {
            res.write(JSON.stringify(fallbackError.toClientFormat()))
          }
        }
      }
    }
  }

  // Development utility methods
  getErrorMetrics() {
    return {
      ...this.errorMetrics,
      errorsByStatus: Object.fromEntries(this.errorMetrics.errorsByStatus),
      errorsByCategory: Object.fromEntries(this.errorMetrics.errorsByCategory),
      topFingerprints: Array.from(this.errorMetrics.errorsByFingerprint.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
    }
  }

  async getErrorDumps(limit = 10) {
    if (!this.config.enableErrorDumping) return []
    
    try {
      const files = await fs.readdir(this.config.dumpDirectory)
      const errorFiles = files
        .filter(file => file.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a))
        .slice(0, limit)
      
      return errorFiles
    } catch (error) {
      this.logger.warn('Failed to get error dumps:', error)
      return []
    }
  }

  async getErrorDump(filename) {
    if (!this.config.enableErrorDumping) return null
    
    try {
      const filepath = path.join(this.config.dumpDirectory, filename)
      const content = await fs.readFile(filepath, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      this.logger.warn(`Failed to read error dump ${filename}:`, error)
      return null
    }
  }
}

module.exports = { DevErrorMiddleware }
