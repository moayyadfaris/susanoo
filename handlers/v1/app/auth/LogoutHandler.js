const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const AuthModel = require('models/AuthModel')
const { getAuthService } = require('../../../../services')

/**
 * LogoutHandler - Secure user session termination with comprehensive audit trail
 * 
 * Handles user logout operations with:
 * - Secure token validation and revocation
 * - Session cleanup and invalidation
 * - Security audit logging
 * - Multi-device session management
 * - Comprehensive error handling
 * 
 * @extends BaseHandler
 * @version 2.0.0
 */
class LogoutHandler extends BaseHandler {
  /**
   * Access control tag for logout operations
   */
  static get accessTag() {
    return 'auth:logout'
  }

  /**
   * Enhanced validation rules with security constraints
   */
  static get validationRules() {
    return {
      body: {
        refreshToken: new RequestRule(AuthModel.schema.refreshToken, { 
          required: true
        }),
        logoutAll: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; Logout from all devices'
        }), { 
          required: false
        }),
        reason: new RequestRule(new Rule({
          validator: v => {
            if (typeof v !== 'string') return false
            if (v.length > 100) return false
            const validReasons = ['user_initiated', 'security_concern', 'admin_forced', 'token_refresh']
            return validReasons.includes(v)
          },
          description: 'string; max 100 chars; one of: user_initiated, security_concern, admin_forced, token_refresh'
        }), {
          required: false
        })
      },
      // headers: {
      //   'user-agent': new RequestRule(new Rule({
      //     validator: v => typeof v === 'string',
      //     description: 'string; User agent header'
      //   }), { required: false }),
      //   'x-device-id': new RequestRule(new Rule({
      //     validator: v => typeof v === 'string',
      //     description: 'string; Device identifier header'
      //   }), { required: false }),
      //   'x-client-version': new RequestRule(new Rule({
      //     validator: v => typeof v === 'string',
      //     description: 'string; Client version header'
      //   }), { required: false })
      // }
    }
  }

  /**
   * Enhanced logout processing with comprehensive security features
   * 
   * @param {Object} ctx - Request context
   * @param {Object} ctx.currentUser - Authenticated user
   * @param {Object} ctx.body - Request body
   * @param {string} ctx.body.refreshToken - Token to invalidate
   * @param {boolean} [ctx.body.logoutAll=false] - Logout from all devices
   * @param {string} [ctx.body.reason] - Logout reason
   * @param {Object} ctx.headers - Request headers
   * @param {string} ctx.ip - Client IP address
   * @param {string} ctx.requestId - Unique request identifier
   * @returns {Promise<Object>} Logout response
   * @throws {AuthenticationError} Invalid or expired token
   * @throws {ValidationError} Invalid input data
   * @throws {SecurityError} Security policy violation
   * @throws {DatabaseError} Database operation failure
   */
  static async run(ctx) {
    const startTime = Date.now()
    const logContext = {
      userId: ctx.currentUser?.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.headers?.['user-agent'],
      deviceId: ctx.headers?.['x-device-id']
    }

    try {
      this.logger.info('Logout process initiated', logContext)

      const authService = getAuthService()
      if (!authService) {
        throw new ErrorWrapper({
          ...errorCodes.INTERNAL_SERVER_ERROR,
          message: 'Authentication service not available',
          layer: 'LogoutHandler.run',
          meta: { requestId: ctx.requestId }
        })
      }

      // Enhanced input validation and security checks
      await this.validateLogoutRequest(ctx, logContext)

      // Perform logout via service layer
      const logoutResult = await authService.logoutByRefreshToken(ctx.body.refreshToken, {
        userId: ctx.currentUser.id,
        logoutAllDevices: ctx.body.logoutAll || false,
        reason: ctx.body.reason || 'user_initiated',
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        requestId: ctx.requestId
      })

      // Audit successful logout
      await this.auditLogoutSuccess(ctx, logoutResult, logContext)

      // Performance monitoring
      const duration = Date.now() - startTime
      this.logger.info('Logout completed successfully', {
        ...logContext,
        duration,
        sessionsInvalidated: logoutResult.sessionsInvalidated,
        logoutType: logoutResult.logoutType || (ctx.body.logoutAll ? 'all_devices' : 'current_device')
      })

      const logoutType = logoutResult.logoutType || (ctx.body.logoutAll ? 'all_devices' : 'current_device')
      const successMessage = logoutType === 'all_devices'
        ? `User logged out from all devices (${logoutResult.sessionsInvalidated} sessions invalidated)`
        : 'User logged out from current session'

      return this.result({
        message: successMessage,
        data: {
          sessionsInvalidated: logoutResult.sessionsInvalidated,
          timestamp: new Date().toISOString(),
          metadata: {
            logoutType,
            reason: ctx.body.reason || 'user_initiated'
          },
          invalidationDetails: {
            cacheCleared: logoutResult.cacheCleared,
            logoutAllDevices: logoutResult.logoutType === 'all_devices' || !!ctx.body.logoutAll
          }
        },
        status: 200,
        headers: {
          'X-Logout-Session-ID': logoutResult.sessionId,
          'X-Sessions-Invalidated': logoutResult.sessionsInvalidated.toString()
        }
      })

    } catch (error) {
      const duration = Date.now() - startTime
      
      // Comprehensive error logging
      this.logger.error('Logout process failed', {
        ...logContext,
        error: error.message,
        errorCode: error.code,
        stack: error.stack,
        duration
      })

      // Audit failed logout attempt
      await this.auditLogoutFailure(ctx, error, logContext).catch(auditError => {
        this.logger.error('Failed to audit logout failure', { 
          ...logContext, 
          auditError: auditError.message 
        })
      })

      // Re-throw with enhanced context
      if (error instanceof ErrorWrapper) {
        throw error
      }

      // Wrap unexpected errors
      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Logout operation failed',
        layer: 'LogoutHandler.run',
        meta: {
          originalError: error.message,
          userId: ctx.currentUser?.id,
          requestId: ctx.requestId
        }
      })
    }
  }

  /**
   * Validate logout request with enhanced security checks
   */
  static async validateLogoutRequest(ctx, logContext) {
    const { currentUser, body, headers, ip } = ctx

    // Validate user context
    if (!currentUser || !currentUser.id) {
      throw new ErrorWrapper({
        ...errorCodes.AUTHENTICATION,
        message: 'Invalid user context for logout',
        layer: 'LogoutHandler.validateLogoutRequest',
        meta: { requestId: ctx.requestId }
      })
    }

    // Validate refresh token format and length
    if (!body.refreshToken || typeof body.refreshToken !== 'string') {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Invalid refresh token format',
        layer: 'LogoutHandler.validateLogoutRequest'
      })
    }

    if (body.refreshToken.length > 512) {
      throw new ErrorWrapper({
        ...errorCodes.FORBIDDEN,
        message: 'Refresh token exceeds maximum length',
        layer: 'LogoutHandler.validateLogoutRequest',
        meta: {
          tokenLength: body.refreshToken.length,
          maxLength: 512
        }
      })
    }

    // Security pattern validation
    const tokenPattern = /^[A-Za-z0-9+/=.-]+$/
    if (!tokenPattern.test(body.refreshToken)) {
      throw new ErrorWrapper({
        ...errorCodes.FORBIDDEN,
        message: 'Refresh token contains invalid characters',
        layer: 'LogoutHandler.validateLogoutRequest'
      })
    }

    this.logger.debug('Logout request validation passed', logContext)
  }

  /**
   * Audit successful logout
   */
  static async auditLogoutSuccess(ctx, logoutResult, logContext) {
    try {
      const auditData = {
        userId: ctx.currentUser.id,
        action: 'logout_success',
        sessionId: logoutResult.sessionId,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        deviceId: ctx.headers?.['x-device-id'],
        logoutType: logoutResult.logoutType || (ctx.body.logoutAll ? 'all_devices' : 'current_device'),
        sessionsInvalidated: logoutResult.sessionsInvalidated,
        reason: ctx.body.reason || 'user_initiated',
        timestamp: new Date(),
        requestId: ctx.requestId
      }

      // Store audit log (this could be enhanced with a dedicated audit service)
      this.logger.info('Logout audit - success', auditData)
      
      // Could also store in dedicated audit table
      // await AuditDAO.create(auditData)
      
    } catch (error) {
      this.logger.error('Failed to audit logout success', {
        ...logContext,
        error: error.message
      })
    }
  }

  /**
   * Audit failed logout attempt
   */
  static async auditLogoutFailure(ctx, error, logContext) {
    try {
      const auditData = {
        userId: ctx.currentUser?.id,
        action: 'logout_failure',
        error: error.message,
        errorCode: error.code,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        //deviceId: ctx.headers?.['x-device-id'],
        reason: ctx.body?.reason,
        timestamp: new Date(),
        requestId: ctx.requestId
      }

      this.logger.warn('Logout audit - failure', auditData)
      
    } catch (auditError) {
      this.logger.error('Failed to audit logout failure', {
        ...logContext,
        auditError: auditError.message
      })
    }
  }

}

module.exports = LogoutHandler
