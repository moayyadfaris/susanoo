const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const AuthModel = require('models/AuthModel')
const { getAuthService } = require('../../../../services')
const logger = require('../../../../util/logger')

/**
* Enhanced RefreshTokensHandler - Token Refresh with Service Layer Integration
*
* Features:
* - Service layer integration for secure token refresh
* - Comprehensive metrics tracking and monitoring
* - Enhanced security validation and device tracking
* - Advanced error handling and logging
* - Session lifecycle management
* - Rate limiting and security monitoring
*
* @extends BaseHandler
* @version 3.0.0 - Service Layer Integration with Enhanced Security
*/
class RefreshTokensHandler extends BaseHandler {
  // Token refresh metrics for observability and monitoring
  static metrics = {
    totalRequests: 0,
    successful: 0,
    failed: 0,
    rateLimited: 0,
    unauthorized: 0,
    sessionExpired: 0,
    errors: 0,
    averageProcessingTime: 0,
    uniqueUsers: new Set(), // Track unique refresh attempts
    peakConcurrency: 0,
    lastReset: new Date()
  }

  static get accessTag() {
    return 'web#auth:refresh-tokens'
  }

  static get validationRules() {
    return {
      body: {
        refreshToken: new RequestRule(AuthModel.schema.refreshToken, { required: true }),
        fingerprint: new RequestRule(AuthModel.schema.fingerprint, { required: true }),

        // Optional fields for enhanced security
        deviceInfo: new RequestRule(new Rule({
          validator: v => typeof v === 'object' && v !== null,
          description: 'object; device information for security tracking'
        }), { required: false }),

        rememberMe: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; extend session duration'
        }), { required: false })
      }
    }
  }

  /**
  * Process token refresh request with enhanced security and service layer integration
  */
  static async run(ctx) {
    const startTime = Date.now()

    // Increment total requests metric
    this.metrics.totalRequests++

    const body = ctx?.body || {}

    // Build request context for service layer
    const requestContext = {
      ip: ctx.ip,
      userAgent: ctx?.headers?.['user-agent'] || ctx?.headers?.['User-Agent'] || '',
      fingerprint: body.fingerprint,
      requestId: ctx.requestId || `refresh_${Date.now()}`,
      timestamp: new Date().toISOString()
    }

    const logContext = {
      ...requestContext,
      handler: 'RefreshTokensHandler'
    }

    try {
      // Get pre-initialized authentication service from global registry
      const authService = getAuthService()

      // Validate service is available
      if (!authService) {
        throw new ErrorWrapper({
          ...errorCodes.INTERNAL_SERVER_ERROR,
          message: 'Authentication service not available',
          meta: { layer: 'RefreshTokensHandler' }
        })
      }

      logger.info('Token refresh attempt started with service layer', logContext)

      // Prepare device information for service layer
      const ipAddress = typeof requestContext.ip === 'string' ? requestContext.ip : ''
      const rawDeviceInfo = (body.deviceInfo && typeof body.deviceInfo === 'object')
        ? body.deviceInfo
        : {}

      const deviceInfo = {
        ...rawDeviceInfo,
        fingerprint: body.fingerprint || rawDeviceInfo.fingerprint,
        deviceFingerprint: rawDeviceInfo.deviceFingerprint || rawDeviceInfo.fingerprint || body.fingerprint || null,
        userAgent: requestContext.userAgent || rawDeviceInfo.userAgent || '',
        ip: ipAddress || rawDeviceInfo.ip || '',
        ipAddress: ipAddress || rawDeviceInfo.ipAddress || rawDeviceInfo.ip || '',
        rememberMe: body.rememberMe ?? rawDeviceInfo.rememberMe ?? false,
        requestId: requestContext.requestId,
        deviceDetails: rawDeviceInfo.deviceDetails || rawDeviceInfo.details || {},
        metadata: rawDeviceInfo.metadata || {},
        source: 'refresh_tokens_handler',
        interface: 'web'
      }

      // Refresh tokens using service layer
      const refreshResult = await authService.refreshTokens(
        body.refreshToken,
        deviceInfo
      )

      const processingTime = Date.now() - startTime

      // Update success metrics
      this.metrics.successful++
      this.updateProcessingTimeMetric(processingTime)

      // Track unique user
      if (refreshResult.user?.id) {
        this.metrics.uniqueUsers.add(refreshResult.user.id)
      }

      logger.info('Token refresh completed successfully with service layer', {
        ...logContext,
        userId: refreshResult.user?.id,
        sessionId: refreshResult.session?.id,
        processingTime
      })

      return this.formatServiceResponse(refreshResult, processingTime, requestContext)

    } catch (error) {
      const processingTime = Date.now() - startTime

      // Update error metrics based on error type
      this.updateErrorMetrics(error, processingTime)

      logger.error('Token refresh failed with service layer', {
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
          layer: 'RefreshTokensHandler',
          processingTime,
          serviceLayer: true
        }
        throw error
      }

      // Wrap unexpected errors with service context
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Token refresh processing failed',
        layer: 'RefreshTokensHandler.run',
        meta: {
          originalError: error.message,
          processingTime,
          serviceIntegration: true
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
    } else if (errorCode === 401 || errorMessage.includes('invalid') || errorMessage.includes('unauthorized')) {
      this.metrics.unauthorized++
    } else if (errorMessage.includes('expired') || errorMessage.includes('session')) {
      this.metrics.sessionExpired++
    } else if (errorMessage.includes('authentication') || errorMessage.includes('refresh')) {
      this.metrics.failed++
    } else {
      this.metrics.errors++
    }
  }

  /**
  * Format service layer response with proper structure
  * @private
  */
  static formatServiceResponse(refreshData, processingTime, context) {
    const user = refreshData.user || {}
    const session = refreshData.session || {}
    const tokens = refreshData.tokens || {}

    const data = {
      userId: refreshData.userId || user.id,
      email: refreshData.email || user.email,
      accessToken: refreshData.accessToken || tokens.accessToken || session.accessToken,
      refreshToken: refreshData.refreshToken || tokens.refreshToken || session.refreshToken,
      sessionId: refreshData.sessionId || session.sessionId || session.id,
      expiresAt: refreshData.expiresAt || session.expiresAt,
      ...(refreshData.deviceId && { deviceId: refreshData.deviceId }),
      ...(refreshData.lastLoginAt && { lastLoginAt: refreshData.lastLoginAt })
    }

    const meta = {
      processingTime: `${processingTime}ms`,
      refreshMethod: 'token',
      version: '3.0.0',
      serviceLayer: true,
      requestId: context.requestId,
      interface: 'web'
    }

    return this.success(data, 'Token refresh successful', { meta })
  }

  /**
  * Get comprehensive token refresh metrics
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
          requestsPerSecond: (this.metrics.totalRequests / (uptime / 1000)).toFixed(2),
          interface: 'web'
        },
        service: serviceMetrics,
        combined: {
          totalRefreshAttempts: totalAttempts,
          handlerVersion: '3.0.0',
          serviceIntegration: true,
          interface: 'web',
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      return {
        handler: {
          ...this.metrics,
          uniqueUsers: this.metrics.uniqueUsers.size,
          error: 'Failed to calculate some metrics',
          interface: 'web'
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
      sessionExpired: 0,
      errors: 0,
      averageProcessingTime: 0,
      uniqueUsers: new Set(),
      peakConcurrency: 0,
      lastReset: new Date()
    }

    return previousMetrics
  }
}

module.exports = RefreshTokensHandler
