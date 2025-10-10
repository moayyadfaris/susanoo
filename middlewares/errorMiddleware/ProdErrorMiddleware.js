const ErrorResponse = require('./ErrorResponse')
const { errorCodes, BaseMiddleware } = require('backend-core')
const logger = require('util/logger')
const { performance } = require('perf_hooks')
const crypto = require('crypto')

class ProdErrorMiddleware extends BaseMiddleware {
  constructor(options = {}) {
    super(options)
    
    // Production error tracking
    this.errorMetrics = {
      totalErrors: 0,
      criticalErrors: 0,
      errorsByStatus: new Map(),
      errorsByCategory: new Map(),
      errorTrends: [],
      maxTrendItems: 1000
    }
    
    // Production configuration
    this.config = {
      enableDetailedLogging: false,
      enablePerformanceTracking: true,
      enableErrorAggregation: true,
      enableAlertThresholds: true,
      criticalErrorThreshold: 10, // per 5 minutes
      errorRateThreshold: 100, // per minute
      enableSecurityFiltering: true,
      enableClientErrorTracking: true
    }
    
    // Alert thresholds and monitoring
    this.alertState = {
      criticalErrorCount: 0,
      lastCriticalErrorReset: Date.now(),
      errorRate: 0,
      lastErrorRateReset: Date.now(),
      isInCriticalState: false
    }
    
    // Error aggregation for similar errors
    this.errorAggregation = new Map()
    
    // Security-sensitive error patterns that should be filtered
    this.securityPatterns = [
      /password/gi,
      /token/gi,
      /secret/gi,
      /key/gi,
      /credential/gi,
      /authorization/gi,
      /jwt/gi,
      /session/gi
    ]
    
    this.initializeProductionMonitoring()
  }

  async init() {
    try {
      // Start production monitoring
      this.startProductionMonitoring()
      
      logger.info(`${this.constructor.name} initialized with production monitoring`)
    } catch (error) {
      logger.error(`${this.constructor.name} initialization failed:`, error)
      throw error
    }
  }

  initializeProductionMonitoring() {
    // Pre-populate common status codes
    const statusCodes = [400, 401, 403, 404, 422, 429, 500, 502, 503, 504]
    for (const status of statusCodes) {
      this.errorMetrics.errorsByStatus.set(status, 0)
    }
    
    // Initialize categories
    const categories = ['authentication', 'validation', 'not_found', 'system', 'rate_limit']
    for (const category of categories) {
      this.errorMetrics.errorsByCategory.set(category, 0)
    }
  }

  startProductionMonitoring() {
    // Log production metrics every 5 minutes
    setInterval(() => {
      this.logProductionMetrics()
    }, 300000)
    
    // Reset critical error count every 5 minutes
    setInterval(() => {
      this.resetCriticalErrorCount()
    }, 300000)
    
    // Reset error rate every minute
    setInterval(() => {
      this.resetErrorRate()
    }, 60000)
    
    // Cleanup old aggregated errors every hour
    setInterval(() => {
      this.cleanupErrorAggregation()
    }, 3600000)
  }

  logProductionMetrics() {
    const metrics = {
      totalErrors: this.errorMetrics.totalErrors,
      criticalErrors: this.errorMetrics.criticalErrors,
      errorsByStatus: Object.fromEntries(this.errorMetrics.errorsByStatus),
      errorsByCategory: Object.fromEntries(this.errorMetrics.errorsByCategory),
      aggregatedErrorTypes: this.errorAggregation.size,
      alertState: this.alertState
    }
    
    logger.info('ProdErrorMiddleware Metrics:', metrics)
    
    // Check for alert conditions
    this.checkAlertThresholds()
  }

  resetCriticalErrorCount() {
    this.alertState.criticalErrorCount = 0
    this.alertState.lastCriticalErrorReset = Date.now()
  }

  resetErrorRate() {
    this.alertState.errorRate = 0
    this.alertState.lastErrorRateReset = Date.now()
  }

  cleanupErrorAggregation() {
    const now = Date.now()
    const oneHourAgo = now - (60 * 60 * 1000)
    
    for (const [fingerprint, data] of this.errorAggregation) {
      if (data.lastOccurrence < oneHourAgo) {
        this.errorAggregation.delete(fingerprint)
      }
    }
  }

  checkAlertThresholds() {
    if (!this.config.enableAlertThresholds) return
    
    // Check critical error threshold
    if (this.alertState.criticalErrorCount >= this.config.criticalErrorThreshold) {
      if (!this.alertState.isInCriticalState) {
        this.alertState.isInCriticalState = true
        this.triggerCriticalAlert('High critical error rate detected')
      }
    } else {
      this.alertState.isInCriticalState = false
    }
    
    // Check overall error rate
    if (this.alertState.errorRate >= this.config.errorRateThreshold) {
      this.triggerErrorRateAlert('High error rate detected')
    }
  }

  triggerCriticalAlert(message) {
    logger.error('CRITICAL ALERT:', {
      message,
      criticalErrorCount: this.alertState.criticalErrorCount,
      threshold: this.config.criticalErrorThreshold,
      timeWindow: '5 minutes',
      timestamp: new Date().toISOString()
    })
    
    // Here you would integrate with your alerting system
    // e.g., PagerDuty, Slack, email notifications, etc.
  }

  triggerErrorRateAlert(message) {
    logger.warn('ERROR RATE ALERT:', {
      message,
      errorRate: this.alertState.errorRate,
      threshold: this.config.errorRateThreshold,
      timeWindow: '1 minute',
      timestamp: new Date().toISOString()
    })
  }

  updateErrorMetrics(errorRes) {
    this.errorMetrics.totalErrors++
    this.alertState.errorRate++
    
    // Track critical errors
    if (errorRes.severity === 'critical') {
      this.errorMetrics.criticalErrors++
      this.alertState.criticalErrorCount++
    }
    
    // Update status metrics
    const statusCount = this.errorMetrics.errorsByStatus.get(errorRes.status) || 0
    this.errorMetrics.errorsByStatus.set(errorRes.status, statusCount + 1)
    
    // Update category metrics
    const categoryCount = this.errorMetrics.errorsByCategory.get(errorRes.category) || 0
    this.errorMetrics.errorsByCategory.set(errorRes.category, categoryCount + 1)
    
    // Add to trends
    this.errorMetrics.errorTrends.push({
      timestamp: Date.now(),
      status: errorRes.status,
      category: errorRes.category,
      fingerprint: errorRes.fingerprint
    })
    
    // Limit trend array size
    if (this.errorMetrics.errorTrends.length > this.config.maxTrendItems) {
      this.errorMetrics.errorTrends = this.errorMetrics.errorTrends.slice(-this.config.maxTrendItems)
    }
  }

  aggregateError(errorRes) {
    if (!this.config.enableErrorAggregation) return
    
    const fingerprint = errorRes.fingerprint
    const now = Date.now()
    
    if (this.errorAggregation.has(fingerprint)) {
      const existing = this.errorAggregation.get(fingerprint)
      existing.count++
      existing.lastOccurrence = now
      existing.recentOccurrences.push(now)
      
      // Keep only recent occurrences (last hour)
      const oneHourAgo = now - (60 * 60 * 1000)
      existing.recentOccurrences = existing.recentOccurrences.filter(time => time > oneHourAgo)
    } else {
      this.errorAggregation.set(fingerprint, {
        count: 1,
        firstOccurrence: now,
        lastOccurrence: now,
        recentOccurrences: [now],
        status: errorRes.status,
        category: errorRes.category,
        message: errorRes.message?.substring(0, 100)
      })
    }
  }

  filterSensitiveInformation(error) {
    let message = error.message || error.toString()
    let stack = error.stack
    
    if (this.config.enableSecurityFiltering) {
      // Filter sensitive information from message
      for (const pattern of this.securityPatterns) {
        message = message.replace(pattern, '[FILTERED]')
      }
      
      // Filter sensitive information from stack trace
      if (stack) {
        for (const pattern of this.securityPatterns) {
          stack = stack.replace(pattern, '[FILTERED]')
        }
      }
    }
    
    return { message, stack }
  }

  shouldLogError(status) {
    // In production, log only significant errors
    const significantErrorCodes = [429, 500, 502, 503, 504]
    return significantErrorCodes.includes(status) || status >= 500
  }

  generateProductionResponse(errorRes) {
    // In production, provide minimal error information to clients
    const productionResponse = errorRes.toClientFormat(false)
    
    // Remove any potentially sensitive information
    delete productionResponse.description
    delete productionResponse.stack
    
    // Use generic messages for server errors
    if (errorRes.status >= 500) {
      productionResponse.message = 'An internal error occurred. Please try again later.'
    }
    
    return productionResponse
  }

  handler() {
    return async (error, req, res, next) => {
      const startTime = performance.now()
      const requestId = req.requestId || crypto.randomUUID()
      
      try {
        // Filter sensitive information
        const filtered = this.filterSensitiveInformation(error)
        
        // Create enhanced error response
        const errorRes = new ErrorResponse({
          ...error,
          message: filtered.message,
          code: error.code || errorCodes.SERVER.code,
          status: error.status || (error.status === 404 ? 404 : errorCodes.SERVER.status),
          stack: null, // Never include stack in production
          src: `${process.env.NODE_ENV}:err:middleware`,
          origin: error.origin ? { 
            ...error.origin, 
            message: this.filterSensitiveInformation({ message: error.origin.message }).message 
          } : undefined,
          requestId,
          userId: req.currentUser?.id,
          sessionId: req.sessionID,
          layer: 'middleware'
        })
        
        // Add performance metrics if enabled
        if (this.config.enablePerformanceTracking) {
          const processingTime = performance.now() - startTime
          errorRes.setPerformanceMetrics(`${processingTime.toFixed(2)}ms`)
        }
        
        // Update metrics
        this.updateErrorMetrics(errorRes)
        
        // Aggregate similar errors
        this.aggregateError(errorRes)
        
        // Log only significant errors in production
        if (this.shouldLogError(errorRes.status)) {
          const logData = {
            ...errorRes.toLogFormat(),
            aggregationCount: this.errorAggregation.get(errorRes.fingerprint)?.count || 1
          }
          
          if (this.config.enableClientErrorTracking) {
            logData.request = {
              method: req.method,
              url: req.originalUrl,
              userAgent: req.headers['user-agent'],
              ip: req.ip
            }
          }
          
          if (errorRes.status >= 500) {
            logger.error('Server Error:', logData)
          } else {
            logger.warn('Client Error:', logData)
          }
        }
        
        // Set production response headers
        res.setHeader('X-Request-ID', requestId)
        if (errorRes.status >= 500) {
          res.setHeader('X-Error-ID', errorRes.logId)
        }
        
        // Send minimal error response
        const productionResponse = this.generateProductionResponse(errorRes)
        res.status(errorRes.status).json(productionResponse)
        
      } catch (middlewareError) {
        // Fallback error handling
        logger.error('Error in ProdErrorMiddleware:', {
          middlewareError: middlewareError.message,
          originalError: error.message,
          requestId
        })
        
        const fallbackError = ErrorResponse.internalServerError()
        res.status(500).json(fallbackError.toClientFormat())
      }
    }
  }

  // Production monitoring methods
  getProductionMetrics() {
    return {
      ...this.errorMetrics,
      errorsByStatus: Object.fromEntries(this.errorMetrics.errorsByStatus),
      errorsByCategory: Object.fromEntries(this.errorMetrics.errorsByCategory),
      alertState: this.alertState,
      topAggregatedErrors: Array.from(this.errorAggregation.entries())
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, 10)
        .map(([fingerprint, data]) => ({ fingerprint, ...data }))
    }
  }

  getHealthStatus() {
    const recentErrors = this.errorMetrics.errorTrends
      .filter(error => error.timestamp > Date.now() - (5 * 60 * 1000)) // Last 5 minutes
      .length
    
    const status = this.alertState.isInCriticalState ? 'critical' : 
      recentErrors > 50 ? 'warning' : 'healthy'
    
    return {
      status,
      metrics: this.getProductionMetrics(),
      recentErrorCount: recentErrors,
      uptime: process.uptime()
    }
  }

  // Emergency methods for production issues
  async resetAlerts() {
    this.alertState.isInCriticalState = false
    this.alertState.criticalErrorCount = 0
    this.alertState.errorRate = 0
    
    logger.info('Production error alerts reset manually')
  }

  async clearErrorAggregation() {
    this.errorAggregation.clear()
    logger.info('Error aggregation data cleared manually')
  }
}

module.exports = { ProdErrorMiddleware }

