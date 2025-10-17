const { RequestRule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const AuthModel = require('models/AuthModel')
const { getAuthService } = require('../../../../services')

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

      if (!reqRefreshToken || !reqFingerprint) {
        throw new ErrorWrapper({
          ...errorCodes.UNAUTHORIZED,
          message: 'Missing credentials for token refresh',
          layer: 'RefreshTokensHandler.run'
        })
      }

      const authService = getAuthService()
      if (!authService) {
        throw new ErrorWrapper({
          ...errorCodes.INTERNAL_SERVER_ERROR,
          message: 'Authentication service unavailable',
          layer: 'RefreshTokensHandler.run'
        })
      }

      this.logger.info('Token refresh initiated', {
        ...logContext,
        hasRefreshToken: !!reqRefreshToken,
        hasFingerprint: !!reqFingerprint
      })

      const deviceInfo = {
        fingerprint: reqFingerprint,
        userAgent: ctx.requestMetadata?.userAgent || ctx.headers?.['user-agent'] || ctx.headers?.['User-Agent'],
        ip: ctx.requestMetadata?.ip || ctx.ip
      }

      const serviceResult = await authService.refreshTokens(reqRefreshToken, deviceInfo)

      this.logger.debug('Refresh tokens service result', {
        ...logContext,
        hasResult: !!serviceResult,
        success: serviceResult?.success,
        hasAccessToken: !!serviceResult?.accessToken,
        hasRefreshToken: !!serviceResult?.refreshToken
      })

      if (!serviceResult?.success) {
        throw new ErrorWrapper({
          ...errorCodes.SERVER,
          message: 'Token refresh service returned unexpected response',
          layer: 'RefreshTokensHandler.run',
          meta: { serviceResult }
        })
      }

      if (!serviceResult.accessToken || !serviceResult.refreshToken) {
        throw new ErrorWrapper({
          ...errorCodes.SERVER,
          message: 'Token refresh failed',
          layer: 'RefreshTokensHandler.run',
          meta: { serviceResult }
        })
      }

      const duration = Date.now() - start
      // Update metrics
      this.metrics.successful++
      this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime + duration) / 2

      this.logger.info('Token refresh completed', {
        ...logContext,
        userId: serviceResult.user?.id,
        duration
      })

      return this.result({
        message: 'Tokens refreshed successfully',
        data: {
          userId: serviceResult.user?.id,
          sessionId: serviceResult.session?.id,
          accessToken: serviceResult.accessToken,
          refreshToken: serviceResult.refreshToken,
          expiresAt: serviceResult.expiresAt
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
        if (error.code === 'UNAUTHORIZED') {
          this.metrics.unauthorized++
        }
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
