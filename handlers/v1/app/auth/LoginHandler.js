const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('../../../BaseHandler')
const AuthModel = require('../../../../models/AuthModel')
const { getAuthService, getAuthSecurityService, getAuthCacheService } = require('../../../../services')
const logger = require('../../../../util/logger')

/**
 * LoginHandler - Authenticate users with enhanced security
 * @extends BaseHandler
 * @version 3.0.0 (Service Layer Integration)
 */
class LoginHandler extends BaseHandler {
  // Login metrics for observability and monitoring
  static metrics = {
    totalRequests: 0,
    successful: 0,
    failed: 0,
    rateLimited: 0,
    unauthorized: 0,
    accountLocked: 0,
    emailUnverified: 0,
    errors: 0,
    averageProcessingTime: 0,
    uniqueUsers: new Set(), // Track unique login attempts
    peakConcurrency: 0,
    lastReset: new Date()
  }
  static get accessTag() {
    return 'auth:login'
  }

  static get validationRules() {
    return {
      body: {
        email: new RequestRule(AuthModel.schema.email, { required: true }),
        password: new RequestRule(AuthModel.schema.password, { required: true }),
        fingerprint: new RequestRule(AuthModel.schema.fingerprint, { required: true }),
        
        // Optional fields for enhanced security
        rememberMe: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; remember login session'
        }), { required: false }),
        
        deviceInfo: new RequestRule(new Rule({
          validator: v => typeof v === 'object' && v !== null,
          description: 'object; device information for security tracking'
        }), { required: false })
      }
    }
  }

  /**
   * Process login request using service layer
   */
  static async run(ctx) {
    const startTime = Date.now()
    
    // Increment total requests metric
    this.metrics.totalRequests++
    
    const body = ctx?.body || {}
    const normalizedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    
    // Track unique email attempts
    if (normalizedEmail) {
      this.metrics.uniqueUsers.add(normalizedEmail)
    }
    
    // Build request context for service layer
    const requestContext = {
      ip: ctx.ip,
      userAgent: ctx?.headers?.['user-agent'] || ctx?.headers?.['User-Agent'] || '',
      fingerprint: body.fingerprint,
      requestId: ctx.requestId || `login_${Date.now()}`,
      timestamp: new Date().toISOString()
    }

    const logContext = {
      email: normalizedEmail,
      ...requestContext,
      handler: 'LoginHandler'
    }

    try {
      // Get pre-initialized authentication services from global registry
      const authServices = {
        authService: getAuthService(),
        authSecurityService: getAuthSecurityService(),
        authCacheService: getAuthCacheService()
      }
      
      // Validate services are available
      if (!authServices.authService) {
        throw new ErrorWrapper({
          ...errorCodes.INTERNAL_SERVER_ERROR,
          message: 'Authentication service not available',
          meta: { layer: 'LoginHandler', email: normalizedEmail }
        })
      }

      logger.info('Login attempt started with service layer', logContext)

      // Prepare credentials for service layer
      const credentials = {
        email: normalizedEmail,
        password: body.password
      }

      // Prepare device information
      const deviceInfo = {
        fingerprint: body.fingerprint,
        userAgent: requestContext.userAgent,
        ip: requestContext.ip,
        rememberMe: body.rememberMe || false,
        deviceDetails: body.deviceInfo || {},
        requestId: requestContext.requestId
      }

      // Authenticate using service layer
      const authResult = await authServices.authService.authenticateUser(
        credentials,
        deviceInfo,
        {
          generateTokens: true,
          createSession: true,
          trackDevice: true,
          auditLog: true,
          rememberMe: body.rememberMe || false
        }
      )

      // Check if verification is required
      if (authResult.requiresVerification) {
        // Update email unverified metric
        this.metrics.emailUnverified++
        this.updateProcessingTimeMetric(Date.now() - startTime)

        logger.info('Login requires verification', {
          ...logContext,
          userId: authResult.userId,
          verificationType: authResult.verificationType
        })

        return this.result({
          success: false,
          requiresVerification: true,
          data: {
            userId: authResult.userId,
            email: authResult.email,
            message: authResult.message || 'Account verification required',
            nextAction: authResult.nextAction || 'verify_email',
            verificationType: authResult.verificationType
          }
        })
      }

      // Enhance response with service layer data
      const enhancedResponse = await this.enhanceLoginResponse(
        authResult,
        authServices,
        requestContext
      )

      const processingTime = Date.now() - startTime

      // Update success metrics
      this.metrics.successful++
      this.updateProcessingTimeMetric(processingTime)

      logger.info('Login completed successfully with service layer', {
        ...logContext,
        userId: authResult.userId,
        sessionId: authResult.sessionId,
        processingTime,
        cached: enhancedResponse.cached
      })

      return this.formatServiceResponse(enhancedResponse, processingTime, requestContext)

    } catch (error) {
      const processingTime = Date.now() - startTime

      // Update error metrics based on error type
      this.updateErrorMetrics(error, processingTime)

      logger.error('Login failed with service layer', {
        ...logContext,
        error: error.message,
        errorCode: error.code,
        processingTime,
        stack: error.stack
      })

      // Enhanced service-layer error handling
      if (error instanceof ErrorWrapper) {
        // Add service layer context to existing error
        error.meta = {
          ...error.meta,
          layer: 'LoginHandler',
          processingTime,
          serviceLayer: true,
          email: normalizedEmail
        }
        throw error
      }

      // Wrap unexpected errors with service context
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Authentication processing failed',
        layer: 'LoginHandler.run',
        meta: {
          originalError: error.message,
          processingTime,
          serviceIntegration: true,
          email: normalizedEmail
        }
      })
    }
  }

  /**
   * Update processing time metrics
   * @private
   */
  static updateProcessingTimeMetric(processingTime) {
    // Calculate rolling average
    this.metrics.averageProcessingTime = this.metrics.averageProcessingTime === 0 
      ? processingTime 
      : (this.metrics.averageProcessingTime + processingTime) / 2
  }

  /**
   * Update error metrics based on error type
   * @private
   */
  static updateErrorMetrics(error, processingTime) {
    // Update processing time for errors too
    this.updateProcessingTimeMetric(processingTime)

    // Categorize error types for metrics
    const errorCode = error.code || error.statusCode
    const errorMessage = error.message || ''

    if (errorCode === 429 || errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
      this.metrics.rateLimited++
    } else if (errorCode === 401 || errorMessage.includes('invalid') || errorMessage.includes('incorrect')) {
      this.metrics.unauthorized++
    } else if (errorMessage.includes('locked') || errorMessage.includes('blocked')) {
      this.metrics.accountLocked++
    } else if (errorMessage.includes('verify') || errorMessage.includes('unverified')) {
      this.metrics.emailUnverified++
    } else if (errorMessage.includes('authentication') || errorMessage.includes('login')) {
      this.metrics.failed++
    } else {
      this.metrics.errors++
    }
  }

  /**
   * Enhance login response with additional service data
   * @private
   */
  static async enhanceLoginResponse(authResult, services, context) {
    try {
      // Check cache status if available
      let cached = false
      if (services.authCacheService && typeof services.authCacheService.getCachedUser === 'function') {
        try {
          const userCached = await services.authCacheService.getCachedUser(authResult.userId)
          cached = !!userCached
        } catch {
          // Cache lookup failed, continue without caching info
          cached = false
        }
      }

      return {
        ...authResult,
        cached,
        serviceProcessed: true
      }

    } catch (error) {
      logger.warn('Failed to enhance login response', {
        userId: authResult.userId,
        error: error.message,
        context
      })
      
      // Return original result if enhancement fails
      return {
        ...authResult,
        serviceProcessed: true,
        enhancementError: error.message
      }
    }
  }

  /**
   * Format service layer response with proper structure
   * @private
   */
  static formatServiceResponse(authData, processingTime, context) {
    const user = authData.user || {}
    const session = authData.session || {}
    const tokens = authData.tokens || {}

    const data = {
      userId: authData.userId || user.id,
      email: authData.email || user.email,
      accessToken: authData.accessToken || tokens.accessToken || session.accessToken,
      refreshToken: authData.refreshToken || tokens.refreshToken || session.refreshToken,
      sessionId: authData.sessionId || session.sessionId || session.id,
      expiresAt: authData.expiresAt || session.expiresAt,
      ...(authData.deviceId && { deviceId: authData.deviceId }),
      ...(authData.lastLoginAt && { lastLoginAt: authData.lastLoginAt }),
      ...(authData.userPreferences && { userPreferences: authData.userPreferences })
    }

    const meta = {
      processingTime: `${processingTime}ms`,
      loginMethod: 'email',
      version: '3.0.0',
      serviceLayer: true,
      requestId: context.requestId,
      cached: authData.cached || false
    }

    return this.success(data, 'Login successful', { meta })
  }

  /**
   * Get comprehensive authentication metrics
   * @returns {Promise<Object>} Handler and service metrics
   */
  static async getMetrics() {
    try {
      // Get service layer metrics from pre-initialized services
      const authService = getAuthService()
      
      let serviceMetrics = {}
      if (authService && typeof authService.getMetrics === 'function') {
        serviceMetrics = await authService.getMetrics()
      }

      // Calculate additional handler metrics
      const totalAttempts = this.metrics.successful + this.metrics.failed + this.metrics.unauthorized
      const successRate = totalAttempts > 0 ? (this.metrics.successful / totalAttempts * 100).toFixed(2) : 0
      const uptime = Date.now() - this.metrics.lastReset.getTime()

      return {
        handler: {
          ...this.metrics,
          uniqueUsers: this.metrics.uniqueUsers.size, // Convert Set to count
          successRate: `${successRate}%`,
          uptime: `${Math.round(uptime / 1000)}s`,
          requestsPerSecond: (this.metrics.totalRequests / (uptime / 1000)).toFixed(2)
        },
        service: serviceMetrics,
        combined: {
          totalLoginAttempts: totalAttempts,
          handlerVersion: '3.0.0',
          serviceIntegration: true,
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      return {
        handler: {
          ...this.metrics,
          uniqueUsers: this.metrics.uniqueUsers.size,
          error: 'Failed to calculate some metrics'
        },
        service: {
          available: false,
          error: error.message
        },
        error: error.message
      }
    }
  }

  /**
   * Reset metrics counters
   * @returns {Object} Previous metrics before reset
   */
  static resetMetrics() {
    const previousMetrics = { ...this.metrics, uniqueUsers: this.metrics.uniqueUsers.size }
    
    this.metrics = {
      totalRequests: 0,
      successful: 0,
      failed: 0,
      rateLimited: 0,
      unauthorized: 0,
      accountLocked: 0,
      emailUnverified: 0,
      errors: 0,
      averageProcessingTime: 0,
      uniqueUsers: new Set(),
      peakConcurrency: 0,
      lastReset: new Date()
    }

    return previousMetrics
  }
}

module.exports = LoginHandler
