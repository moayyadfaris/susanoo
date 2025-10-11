const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const SessionDAO = require('database/dao/SessionDAO')
const UserDAO = require('database/dao/UserDAO')

/**
 * LogoutAllSessionsHandler - Centralized multi-session termination with audit and controls
 *
 * Features:
 * - Logout from all sessions or all OTHER sessions (exclude current)
 * - Optional current session identification via sessionId or refreshToken
 * - Structured logging with request/user context and metrics
 * - Auditing of success/failure and reason tracking
 * - Cache invalidation hooks and resilient error handling
 *
 * Backward compatibility:
 * - If no body is provided, defaults to logging out from ALL sessions (legacy behavior)
 * - To exclude the current session, provide either sessionId or refreshToken with excludeCurrent=true
 *
 * @extends BaseHandler
 * @version 2.0.0
 */
class LogoutAllSessionsHandler extends BaseHandler { // Default: logout all; supports excludeCurrent when identifiers provided
  // Lightweight metrics for observability
  static metrics = {
    totalRequests: 0,
    successful: 0,
    errors: 0,
    averageProcessingTime: 0
  }

  static get accessTag () {
    return 'auth:logout-all-sessions'
  }

  static get validationRules () {
    return {
      body: {
        excludeCurrent: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; When true, invalidate all other sessions and keep the current one'
        }), { required: false }),
        sessionId: new RequestRule(new Rule({
          validator: v => Number.isInteger(v) && v > 0,
          description: 'number; Current session id to preserve when excludeCurrent=true'
        }), { required: false }),
        refreshToken: new RequestRule(require('models/AuthModel').schema.refreshToken, { required: false }),
        reason: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && ['user_initiated', 'security_concern', 'admin_forced', 'token_refresh'].includes(v),
          description: 'string; one of: user_initiated, security_concern, admin_forced, token_refresh'
        }), { required: false })
      }
    }
  }

  static async run (ctx) {
    const start = Date.now()
    this.metrics.totalRequests++

    const { currentUser, body = {}, headers } = ctx
    const excludeCurrent = body.excludeCurrent === true // default stays false for backward compatibility

    const logContext = {
      requestId: ctx.requestMetadata?.id || ctx.requestId,
      ip: ctx.requestMetadata?.ip || ctx.ip,
      userAgent: ctx.requestMetadata?.userAgent || headers?.['user-agent'],
      userId: currentUser?.id
    }

    try {
      if (!currentUser?.id) {
        throw new ErrorWrapper({
          ...errorCodes.AUTHENTICATION,
          message: 'Invalid user context',
          layer: 'LogoutAllSessionsHandler.run'
        })
      }

      this.logger.info('Logout-all-sessions initiated', { ...logContext, excludeCurrent })

      // Basic optional rate-limit probe (non-blocking if unsupported)
      await this.checkLogoutRateLimit(currentUser.id, ctx.ip, logContext)

      let sessionsInvalidated = 0
      let message = ''

      if (excludeCurrent) {
        // Identify the current session to preserve
        const currentSession = await this.identifyCurrentSession(ctx, logContext)

        // Count sessions before
        const beforeCount = await this.safeCountSessions(currentUser.id)

        await SessionDAO.removeOtherSessions(currentUser.id, currentSession.id)

        const afterCount = await this.safeCountSessions(currentUser.id)
        sessionsInvalidated = Math.max(0, beforeCount - afterCount)
        message = 'User is logged out from all other sessions.'

        this.logger.info('Other sessions invalidated', { ...logContext, sessionId: currentSession.id, sessionsInvalidated })
      } else {
        // Logout from ALL sessions (legacy behavior)
        const beforeCount = await this.safeCountSessions(currentUser.id)
        const result = await SessionDAO.baseRemoveWhere({ userId: currentUser.id })
        // Best-effort count
        const affected = (result && (result.affectedRows || result.length)) || beforeCount || 0
        sessionsInvalidated = affected
        message = 'User is logged out from all sessions.'
        this.logger.info('All sessions invalidated', { ...logContext, sessionsInvalidated })
      }

      // Update user metadata and clear caches (non-fatal if fails)
      await this.postLogoutMaintenance(currentUser.id, logContext)

      const duration = Date.now() - start
      this.metrics.successful++
      this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime + duration) / 2

      // Audit success
      await this.auditLogoutAllSuccess(ctx, { sessionsInvalidated, excludeCurrent }, logContext)

      return this.result({
        message,
        data: {
          sessionsInvalidated,
          timestamp: new Date().toISOString(),
          metadata: {
            mode: excludeCurrent ? 'others_only' : 'all',
            reason: body.reason || 'user_initiated'
          }
        },
        status: 200,
        headers: {
          'X-Sessions-Invalidated': String(sessionsInvalidated),
          'X-Logout-Mode': excludeCurrent ? 'others_only' : 'all'
        }
      })
    } catch (error) {
      const duration = Date.now() - start
      this.metrics.errors++
      this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime + duration) / 2

      this.logger.error('Logout-all-sessions failed', { ...logContext, duration, error: error?.message, stack: error?.stack })

      await this.auditLogoutAllFailure(ctx, error, logContext).catch(auditError => {
        this.logger.error('Failed to audit logout-all failure', { ...logContext, auditError: auditError?.message })
      })

      if (error instanceof ErrorWrapper) throw error

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to logout from sessions',
        layer: 'LogoutAllSessionsHandler.run',
        meta: { originalError: error?.message }
      })
    }
  }

  // Identify the current session using either sessionId or refreshToken
  static async identifyCurrentSession(ctx, logContext) {
    const { currentUser, body = {} } = ctx

    if (body.sessionId) {
      this.logger.debug('Identifying current session via sessionId', { ...logContext, sessionId: body.sessionId })
      const session = await SessionDAO.baseGetById(body.sessionId)
      if (!session || session.userId !== currentUser.id) {
        throw new ErrorWrapper({
          ...errorCodes.FORBIDDEN,
          message: 'Session does not belong to the current user',
          layer: 'LogoutAllSessionsHandler.identifyCurrentSession',
          meta: { sessionId: body.sessionId, userId: currentUser.id }
        })
      }
      return session
    }

    if (body.refreshToken) {
      this.logger.debug('Identifying current session via refreshToken', { ...logContext, hasToken: true })
      const session = await SessionDAO.getByRefreshToken(body.refreshToken)
      if (!session || session.userId !== currentUser.id) {
        throw new ErrorWrapper({
          ...errorCodes.FORBIDDEN,
          message: 'Invalid session for provided refresh token',
          layer: 'LogoutAllSessionsHandler.identifyCurrentSession',
          meta: { userId: currentUser.id }
        })
      }
      return session
    }

    throw new ErrorWrapper({
      ...errorCodes.VALIDATION,
      message: 'excludeCurrent=true requires sessionId or refreshToken',
      layer: 'LogoutAllSessionsHandler.identifyCurrentSession'
    })
  }

  // Count sessions safely (normalizes DB count responses)
  static async safeCountSessions(userId) {
    try {
      const result = await SessionDAO.getUserSessionsCount(userId)
      const key = Object.keys(result || {}).find(k => k.toLowerCase().includes('count'))
      const val = key ? result[key] : 0
      return typeof val === 'number' ? val : parseInt(val || '0', 10)
    } catch {
      return 0
    }
  }

  // Post-logout user maintenance: update timestamps and clear caches
  static async postLogoutMaintenance(userId, logContext) {
    try {
      await UserDAO.baseUpdate(userId, { lastLogoutAt: new Date(), updatedAt: new Date() })
    } catch (e) {
      this.logger.warn('Failed to update user logout timestamp', { ...logContext, error: e?.message })
    }

    await this.clearUserCache(userId, logContext)
  }

  // Optional rate limit check (non-fatal)
  static async checkLogoutRateLimit(userId, ip, logContext) {
    try {
      const recentAttempts = await SessionDAO.countRecentLogouts(userId, 5)
      if (recentAttempts > 50) {
        this.logger.warn('High volume logout-all attempts', { ...logContext, recentAttempts })
      }
    } catch (e) {
      this.logger.warn('Rate limit check failed', { ...logContext, error: e?.message })
    }
  }

  // Clear user cache keys (best effort)
  static async clearUserCache(userId, logContext) {
    try {
      const RedisClient = require('clients/RedisClient')
      if (RedisClient && RedisClient.isConnected()) {
        await RedisClient.del(`user:${userId}:profile`)
        await RedisClient.del(`user:${userId}:permissions`)
        await RedisClient.del(`user:${userId}:sessions`)
        this.logger.debug('User cache cleared', { ...logContext, userId })
      }
    } catch (e) {
      this.logger.warn('Failed to clear user cache', { ...logContext, error: e?.message, userId })
    }
  }

  // Audit helpers
  static async auditLogoutAllSuccess(ctx, result, logContext) {
    try {
      const audit = {
        userId: ctx.currentUser.id,
        action: 'logout_all_success',
        excludeCurrent: result.excludeCurrent,
        sessionsInvalidated: result.sessionsInvalidated,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        reason: ctx.body?.reason || 'user_initiated',
        timestamp: new Date(),
        requestId: ctx.requestId
      }
      this.logger.info('Logout-all audit - success', audit)
    } catch (e) {
      this.logger.warn('Failed to audit logout-all success', { ...logContext, error: e?.message })
    }
  }

  static async auditLogoutAllFailure(ctx, error, logContext) {
    try {
      const audit = {
        userId: ctx.currentUser?.id,
        action: 'logout_all_failure',
        error: error?.message,
        errorCode: error?.code,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        reason: ctx.body?.reason,
        timestamp: new Date(),
        requestId: ctx.requestId
      }
      this.logger.warn('Logout-all audit - failure', audit)
    } catch (e) {
      this.logger.error('Failed to audit logout-all failure', { ...logContext, error: e?.message })
    }
  }

  static getMetrics () {
    return { ...this.metrics }
  }
}

module.exports = LogoutAllSessionsHandler
