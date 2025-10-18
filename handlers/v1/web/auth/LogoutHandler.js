const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const AuthModel = require('models/AuthModel')
const { getAuthService } = require('../../../../services')
const logger = require('../../../../util/logger')

/**
* Enhanced LogoutHandler - Secure Session Termination with Service Layer Integration
*
* Features:
* - Service layer integration for secure logout
* - Comprehensive metrics tracking and monitoring
* - Enhanced security validation and audit logging
* - Advanced error handling and logging
* - Session lifecycle management
* - Multi-device logout support
* - Security audit trail
*
* @extends BaseHandler
* @version 3.0.0 - Service Layer Integration with Enhanced Security
*/
class LogoutHandler extends BaseHandler {
  // Logout metrics for observability and monitoring
  static metrics = {
    totalRequests: 0,
    successful: 0,
    failed: 0,
    unauthorized: 0,
    sessionNotFound: 0,
    errors: 0,
    averageProcessingTime: 0,
    uniqueUsers: new Set(), // Track unique logout attempts
    multiDeviceLogouts: 0,
    peakConcurrency: 0,
    lastReset: new Date()
  }

  static get accessTag() {
    return 'web#auth:logout'
  }

  static get validationRules() {
    return {
      body: {
        refreshToken: new RequestRule(AuthModel.schema.refreshToken, { required: true }),

        // Optional fields for enhanced security and multi-device logout
        logoutAllDevices: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; logout from all devices'
        }), { required: false }),

        deviceInfo: new RequestRule(new Rule({
          validator: v => typeof v === 'object' && v !== null,
          description: 'object; device information for security tracking'
        }), { required: false }),

        reason: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length <= 200,
          description: 'string; reason for logout (optional)'
        }), { required: false })
      }
    }
  }

  /**
  * Process logout request with enhanced security and service layer integration
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
      requestId: ctx.requestId || `logout_${Date.now()}`,
      timestamp: new Date().toISOString()
    }

    const logContext = {
      ...requestContext,
      handler: 'LogoutHandler',
      logoutAllDevices: body.logoutAllDevices || false
    }

    try {
      // Get pre-initialized authentication service from global registry
      const authService = getAuthService()

      // Validate service is available
      if (!authService) {
        throw new ErrorWrapper({
          ...errorCodes.INTERNAL_SERVER_ERROR,
          message: 'Authentication service not available',
          meta: { layer: 'LogoutHandler' }
        })
      }

      logger.info('Logout attempt started with service layer', logContext)

      // Prepare device information for service layer
      const ipAddress = typeof requestContext.ip === 'string' ? requestContext.ip : ''
      const rawDeviceInfo = (body.deviceInfo && typeof body.deviceInfo === 'object')
        ? body.deviceInfo
        : {}

      const deviceInfoForService = {
        ...rawDeviceInfo,
        userAgent: requestContext.userAgent || rawDeviceInfo.userAgent || '',
        ip: ipAddress || rawDeviceInfo.ip || '',
        ipAddress: ipAddress || rawDeviceInfo.ipAddress || rawDeviceInfo.ip || '',
        requestId: requestContext.requestId,
        deviceDetails: rawDeviceInfo.deviceDetails || rawDeviceInfo.details || {},
        metadata: rawDeviceInfo.metadata || {},
        source: 'logout_handler',
        interface: 'web'
      }

      // Prepare logout options
      const logoutOptions = {
        logoutAllDevices: body.logoutAllDevices || false,
        reason: body.reason || 'user_initiated',
        ip: requestContext.ip,
        userAgent: requestContext.userAgent,
        requestId: requestContext.requestId
      }

      // Perform logout using service layer
      const logoutResult = await authService.logoutByRefreshToken(
        body.refreshToken,
        {
          ...logoutOptions,
          deviceInfo: deviceInfoForService
        }
      )

      const processingTime = Date.now() - startTime

      // Update success metrics
      this.metrics.successful++
      this.updateProcessingTimeMetric(processingTime)

      // Track unique user
      if (logoutResult.userId) {
        this.metrics.uniqueUsers.add(logoutResult.userId)
      }

      // Track multi-device logout
      if (body.logoutAllDevices) {
        this.metrics.multiDeviceLogouts++
      }

      logger.info('Logout completed successfully with service layer', {
        ...logContext,
        userId: logoutResult.userId,
        sessionId: logoutResult.sessionId,
        logoutAllDevices: body.logoutAllDevices,
        processingTime
      })

      return this.formatServiceResponse(logoutResult, processingTime, requestContext)

    } catch (error) {
      const processingTime = Date.now() - startTime

      // Update error metrics based on error type
      this.updateErrorMetrics(error, processingTime)

      logger.error('Logout failed with service layer', {
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
          layer: 'LogoutHandler',
          processingTime,
          serviceLayer: true
        }
        throw error
      }

      // Wrap unexpected errors with service context
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Logout processing failed',
        layer: 'LogoutHandler.run',
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

    if (errorCode === 401 || errorMessage.includes('invalid') || errorMessage.includes('unauthorized')) {
      this.metrics.unauthorized++
    } else if (errorMessage.includes('not found') || errorMessage.includes('session')) {
      this.metrics.sessionNotFound++
    } else if (errorMessage.includes('authentication') || errorMessage.includes('logout')) {
      this.metrics.failed++
    } else {
      this.metrics.errors++
    }
  }

  /**
  * Format service layer response with proper structure
  * @private
  */
  static formatServiceResponse(logoutData, processingTime, context) {
    const data = {
      success: logoutData.success,
      userId: logoutData.userId,
      sessionId: logoutData.sessionId,
      logoutAllDevices: logoutData.logoutType === 'all_devices',
      message: logoutData.message || 'User logged out successfully'
    }

    const meta = {
      processingTime: `${processingTime}ms`,
      logoutMethod: 'token',
      version: '3.0.0',
      serviceLayer: true,
      requestId: context.requestId,
      interface: 'web'
    }

    return this.success(data, 'Logout successful', { meta })
  }

  /**
  * Get comprehensive logout metrics
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
          totalLogoutAttempts: totalAttempts,
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
      unauthorized: 0,
      sessionNotFound: 0,
      errors: 0,
      averageProcessingTime: 0,
      uniqueUsers: new Set(),
      multiDeviceLogouts: 0,
      peakConcurrency: 0,
      lastReset: new Date()
    }

    return previousMetrics
  }
}

module.exports = LogoutHandler
