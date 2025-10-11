const { RequestRule, ErrorWrapper, errorCodes } = require('backend-core')
const addSession = require('handlers/v1/common/addSession')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const AuthModel = require('models/AuthModel')
const SessionDAO = require('database/dao/SessionDAO')
const SessionEntity = require('handlers/v1/common/SessionEntity')
const { makeAccessTokenHelper, verifySessionHelper } = require('helpers').authHelpers

/**
 * RefreshTokensHandler - Secure token rotation and session renewal
 * 
 * Handles refresh-token flow with:
 * - Single-use refresh token rotation (verify first, then invalidate)
 * - Fingerprint-bound session verification
 * - User validation and deactivation checks
 * - Structured logging and lightweight metrics
 * - Robust error handling with clear semantics
 * 
 * @extends BaseHandler
 * @version 2.0.0
 */
class RefreshTokensHandler extends BaseHandler {
  // Lightweight metrics for observability
  static metrics = {
    totalRequests: 0,
    successful: 0,
    unauthorized: 0,
    errors: 0,
    averageProcessingTime: 0
  }

  static get accessTag () {
    return 'auth:refresh-tokens'
  }

  static get validationRules () {
    return {
      body: {
        refreshToken: new RequestRule(AuthModel.schema.refreshToken, { required: true }),
        fingerprint: new RequestRule(AuthModel.schema.fingerprint, { required: true }) // https://github.com/Valve/fingerprintjs2
      }
    }
  }

  static async run (ctx) {
    const start = Date.now()
    this.metrics.totalRequests++

    const logContext = {
      requestId: ctx.requestMetadata?.id || ctx.requestId,
      ip: ctx.requestMetadata?.ip || ctx.ip,
      userAgent: ctx.requestMetadata?.userAgent || ctx.headers?.['User-Agent']
    }

    try {
      const reqRefreshToken = ctx.body?.refreshToken
      const reqFingerprint = ctx.body?.fingerprint

      // Basic guard rails (validation middleware should ensure these, but double-check defensively)
      if (!reqRefreshToken || !reqFingerprint) {
        this.metrics.unauthorized++
        throw new ErrorWrapper({
          ...errorCodes.UNAUTHORIZED,
          message: 'Missing credentials for token refresh',
          layer: 'RefreshTokensHandler.run'
        })
      }

      this.logger.info('Token refresh initiated', {
        ...logContext,
        hasRefreshToken: !!reqRefreshToken,
        hasFingerprint: !!reqFingerprint
      })

      // 1) Load session by refresh token
      const oldSession = await SessionDAO.getByRefreshToken(reqRefreshToken)
      if (!oldSession) {
        this.metrics.unauthorized++
        this.logger.warn('Refresh token not found', { ...logContext })
        throw new ErrorWrapper({
          ...errorCodes.UNAUTHORIZED,
          message: 'Invalid refresh token',
          layer: 'RefreshTokensHandler.run'
        })
      }

      // 2) Verify session (status/expiry/fingerprint)
      try {
        await verifySessionHelper(new SessionEntity(oldSession), reqFingerprint)
      } catch (e) {
        this.metrics.unauthorized++
        this.logger.warn('Session verification failed', { ...logContext, error: e?.message })
        throw new ErrorWrapper({
          ...errorCodes.UNAUTHORIZED,
          message: 'Session verification failed',
          layer: 'RefreshTokensHandler.run',
          meta: { reason: e?.message }
        })
      }

      // 3) Load user and validate
      const user = await UserDAO.baseGetById(oldSession.userId)
      if (!user) {
        this.metrics.unauthorized++
        this.logger.warn('User not found for session', { ...logContext, userId: oldSession.userId })
        throw new ErrorWrapper({
          ...errorCodes.UNAUTHORIZED,
          message: 'User not found',
          layer: 'RefreshTokensHandler.run'
        })
      }
      if (user.isActive === false) {
        this.metrics.unauthorized++
        this.logger.warn('User is deactivated', { ...logContext, userId: user.id })
        throw new ErrorWrapper({
          ...errorCodes.FORBIDDEN,
          message: 'User account is deactivated',
          layer: 'RefreshTokensHandler.run'
        })
      }

      // 4) Invalidate the old refresh token (single-use tokens)
      await SessionDAO.baseRemoveWhere({ refreshToken: reqRefreshToken })

      // 5) Create a new session (rotate refresh token)
      const newSession = new SessionEntity({
        userId: user.id,
        ip: ctx.ip,
        ua: ctx.headers['User-Agent'],
        fingerprint: reqFingerprint
      })
      await addSession(newSession)

      // 6) Create new access token
      const accessToken = await makeAccessTokenHelper(user)

      const duration = Date.now() - start
      // Update metrics
      this.metrics.successful++
      this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime + duration) / 2

      this.logger.info('Token refresh completed', {
        ...logContext,
        userId: user.id,
        duration
      })

      return this.result({
        data: {
          userId: user.id,
          accessToken,
          refreshToken: newSession.refreshToken
        },
        headers: {
          'X-Session-Rotated': '1'
        }
      })
    } catch (error) {
      const duration = Date.now() - start
      this.metrics.errors++
      this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime + duration) / 2

      this.logger.error('Token refresh failed', {
        ...logContext,
        duration,
        error: error?.message,
        stack: error?.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to refresh tokens',
        layer: 'RefreshTokensHandler.run',
        meta: { originalError: error?.message }
      })
    }
  }

  static getMetrics () {
    return { ...this.metrics }
  }
}

module.exports = RefreshTokensHandler
