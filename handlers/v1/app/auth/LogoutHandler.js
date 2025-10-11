const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const SessionDAO = require('database/dao/SessionDAO')
const AuthModel = require('models/AuthModel')
const UserDAO = require('database/dao/UserDAO')

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

      // Enhanced input validation and security checks
      await this.validateLogoutRequest(ctx, logContext)

      // Find and validate the target session
      const session = await this.findAndValidateSession(ctx, logContext)

      // Perform secure logout operation
      const logoutResult = await this.performSecureLogout(ctx, session, logContext)

      // // Audit successful logout
      await this.auditLogoutSuccess(ctx, session, logoutResult, logContext)

      // Performance monitoring
      const duration = Date.now() - startTime
      this.logger.info('Logout completed successfully', {
        ...logContext,
        duration,
        sessionsInvalidated: logoutResult.sessionsInvalidated,
        logoutType: ctx.body.logoutAll ? 'all_devices' : 'current_device'
      })

      return this.result({
        message: logoutResult.message,
        data: {
          sessionsInvalidated: logoutResult.sessionsInvalidated,
          timestamp: new Date().toISOString(),
          metadata: {
            logoutType: ctx.body.logoutAll ? 'all_devices' : 'current_device',
            reason: ctx.body.reason || 'user_initiated'
          }
        },
        status: 200,
        headers: {
          'X-Logout-Session-ID': session.id,
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

    // Rate limiting check (if user has too many recent logout attempts)
    await this.checkLogoutRateLimit(currentUser.id, ip, logContext)

    this.logger.debug('Logout request validation passed', logContext)
  }

  /**
   * Find and validate the session to be terminated
   */
  static async findAndValidateSession(ctx, logContext) {
    const { currentUser, body } = ctx

    try { 

      // Find the session by refresh token
      const session = await SessionDAO.baseGetWhere({ 
        refreshToken: body.refreshToken,
        userId: currentUser.id 
      })

      

      if (!session) {
        throw new ErrorWrapper({
          ...errorCodes.AUTHENTICATION,
          message: 'Invalid or expired refresh token',
          layer: 'LogoutHandler.findAndValidateSession',
          meta: {
            userId: currentUser.id,
            hashedToken: this.hashToken(body.refreshToken.substring(0, 8))
          }
        })
      }

      // Validate session ownership
      if (session.userId !== currentUser.id) {
        throw new ErrorWrapper({
          ...errorCodes.FORBIDDEN,
          message: 'Session ownership mismatch',
          layer: 'LogoutHandler.findAndValidateSession',
          meta: {
            sessionUserId: session.userId,
            currentUserId: currentUser.id
          }
        })
      }

      // Check if session is already expired
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        throw new ErrorWrapper({
          ...errorCodes.AUTHENTICATION,
          message: 'Session already expired',
          layer: 'LogoutHandler.findAndValidateSession',
          meta: {
            sessionId: session.id,
            expiresAt: session.expiresAt
          }
        })
      }

      this.logger.debug('Session validated successfully', {
        ...logContext,
        sessionId: session.id,
        sessionCreatedAt: session.createdAt
      })

      return session

    } catch (error) {
      if (error instanceof ErrorWrapper) {
        throw error
      }
      
      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to validate session',
        layer: 'LogoutHandler.findAndValidateSession',
        meta: {
          originalError: error.message,
          userId: currentUser.id
        }
      })
    }
  }

  /**
   * Perform secure logout with session invalidation
   */
  static async performSecureLogout(ctx, session, logContext) {
    const { currentUser, body } = ctx
    let sessionsInvalidated = 0
    let message = ''

    try {
      if (body.logoutAll) {
        // Logout from all devices - invalidate all user sessions
        const result = await SessionDAO.baseRemoveWhere({ userId: currentUser.id })
        sessionsInvalidated = result.affectedRows || result.length || 1
        message = `User logged out from all devices (${sessionsInvalidated} sessions invalidated)`
        
        this.logger.info('All user sessions invalidated', {
          ...logContext,
          sessionsInvalidated
        })
      } else {
        // Logout from current device only

        await SessionDAO.baseRemoveWhere({ 
          refreshToken: body.refreshToken,
          userId: currentUser.id 
        })
        sessionsInvalidated = 1
        message = 'User logged out from current session'
       
        this.logger.info('Current session invalidated', {
          ...logContext,
          sessionId: session.id
        })         
      }

      // Update user's last logout timestamp
      await UserDAO.baseUpdate(currentUser.id, {
        lastLogoutAt: new Date(),
        updatedAt: new Date()
      })

      // Clear any cached user data (if using Redis/cache)
      await this.clearUserCache(currentUser.id, logContext)

      return {
        message,
        sessionsInvalidated,
        logoutType: body.logoutAll ? 'all_devices' : 'current_device'
      }

    } catch (error) {
      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to invalidate session(s)',
        layer: 'LogoutHandler.performSecureLogout',
        meta: {
          originalError: error.message,
          userId: currentUser.id,
          sessionId: session.id
        }
      })
    }
  }

  /**
   * Check logout rate limiting to prevent abuse
   */
  static async checkLogoutRateLimit(userId, ip, logContext) {
    // This could be enhanced with Redis-based rate limiting
    // For now, we'll implement a basic check
    
    try {
      // Check recent logout attempts in the last 5 minutes
      const recentAttempts = await SessionDAO.countRecentLogouts(userId, 5)
      
      if (recentAttempts > 10) {
        throw new ErrorWrapper({
          ...errorCodes.TOO_MANY_REQUESTS,
          message: 'Too many logout attempts',
          layer: 'LogoutHandler.checkLogoutRateLimit',
          meta: {
            userId,
            recentAttempts,
            timeWindow: '5 minutes'
          }
        })
      }
    } catch (error) {
      // Don't fail logout for rate limit check errors, just log
      this.logger.warn('Rate limit check failed', {
        ...logContext,
        error: error.message
      })
    }
  }

  /**
   * Clear user cache data
   */
  static async clearUserCache(userId, logContext) {
    try {
      // Clear Redis cache if available
      const RedisClient = require('clients/RedisClient')
      
      if (RedisClient && RedisClient.isConnected()) {
        await RedisClient.del(`user:${userId}:profile`)
        await RedisClient.del(`user:${userId}:permissions`)
        await RedisClient.del(`user:${userId}:sessions`)
        
        this.logger.debug('User cache cleared', { ...logContext, userId })
      }
    } catch (error) {
      // Don't fail logout for cache clear errors
      this.logger.warn('Failed to clear user cache', {
        ...logContext,
        error: error.message,
        userId
      })
    }
  }

  /**
   * Audit successful logout
   */
  static async auditLogoutSuccess(ctx, session, logoutResult, logContext) {
    try {
      const auditData = {
        userId: ctx.currentUser.id,
        action: 'logout_success',
        sessionId: session.id,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        deviceId: ctx.headers?.['x-device-id'],
        logoutType: ctx.body.logoutAll ? 'all_devices' : 'current_device',
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

  /**
   * Hash token for secure logging
   */
  static hashToken(tokenPart) {
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(tokenPart).digest('hex').substring(0, 16)
  }
}

module.exports = LogoutHandler
