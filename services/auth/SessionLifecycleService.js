const BaseService = require('../BaseService')
const SessionDAO = require('../../database/dao/SessionDAO')
const { ErrorWrapper } = require('backend-core')
const { randomUUID } = require('crypto')

class SessionLifecycleService extends BaseService {
  static get DefaultCacheClass() {
    if (this._defaultCacheClass === undefined) {
      try {
        // Lazy-load to avoid hard dependency during tests without config
        this._defaultCacheClass = require('./session/SessionCacheService')
      } catch (error) {
        this._defaultCacheClass = null
      }
    }
    return this._defaultCacheClass
  }

  constructor(options = {}) {
    super(options)

    this.registerDependency('sessionDAO', options.sessionDAO || SessionDAO)
    if (options.userDAO) this.registerDependency('userDAO', options.userDAO)
    if (options.authHelpers) this.registerDependency('authHelpers', options.authHelpers)

    const cacheService = options.sessionCacheService || SessionLifecycleService.DefaultCacheClass
    if (cacheService) {
      this.registerDependency('sessionCacheService', cacheService)
    }

    this.config = {
      sessionTimeout: 24 * 60 * 60 * 1000,
      rememberMeExpiry: 30 * 24 * 60 * 60 * 1000,
      refreshTokenRotation: true,
      maxLogoutAttempts: 10,
      logoutWindowMinutes: 5,
      ...options.config
    }
  }

  get sessionDAO() {
    return this.getDependency('sessionDAO')
  }

  get userDAO() {
    return this.dependencies.has('userDAO') ? this.getDependency('userDAO') : null
  }

  get authHelpers() {
    return this.dependencies.has('authHelpers') ? this.getDependency('authHelpers') : null
  }

  get cacheService() {
    return this.dependencies.has('sessionCacheService') ? this.getDependency('sessionCacheService') : null
  }

  prepareSessionCachePayload(sessionRecord) {
    if (!sessionRecord) return null
    if (typeof sessionRecord.toJSON === 'function') {
      return sessionRecord.toJSON()
    }
    return { ...sessionRecord }
  }

  async invokeCache(methodName, userId, sessionData, logContext = {}) {
    const cacheService = this.cacheService
    if (!cacheService) {
      return null
    }

    const target = typeof cacheService[methodName] === 'function'
      ? cacheService
      : (cacheService.constructor && typeof cacheService.constructor[methodName] === 'function'
        ? cacheService.constructor
        : null)

    if (!target) {
      return null
    }

    try {
      const args = methodName === 'clearUserSessions'
        ? [userId, logContext]
        : [userId, sessionData, logContext]
      const result = await target[methodName](...args)

      if (result && result.success === false && !result.fallback) {
        this.logger?.warn?.('Session cache operation reported failure', {
          method: methodName,
          userId,
          sessionId: sessionData?.id,
          error: result.error,
          context: logContext
        })
      }

      return result
    } catch (error) {
      this.logger?.warn?.('Session cache operation failed', {
        method: methodName,
        userId,
        sessionId: sessionData?.id,
        error: error.message,
        context: logContext
      })
      return null
    }
  }

  validateRefreshTokenInput(refreshToken) {
    if (typeof refreshToken !== 'string') {
      throw new ErrorWrapper({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token must be a string',
        statusCode: 400
      })
    }

    const trimmed = refreshToken.trim()
    if (!trimmed.length) {
      throw new ErrorWrapper({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token cannot be empty',
        statusCode: 400
      })
    }

    if (trimmed.length > 512) {
      throw new ErrorWrapper({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token exceeds maximum length',
        statusCode: 400,
        meta: { length: trimmed.length, max: 512 }
      })
    }

    const tokenPattern = /^[A-Za-z0-9+/=.\-]+$/
    if (!tokenPattern.test(trimmed)) {
      throw new ErrorWrapper({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token contains invalid characters',
        statusCode: 400
      })
    }

    return trimmed
  }

  async checkLogoutRateLimit(userId, ip) {
    if (!this.sessionDAO.countRecentLogouts || !userId) {
      return
    }

    try {
      const recentAttempts = await this.sessionDAO.countRecentLogouts(userId, this.config.logoutWindowMinutes)

      if (recentAttempts > this.config.maxLogoutAttempts) {
        throw new ErrorWrapper({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many logout attempts. Please try again later.',
          statusCode: 429,
          meta: {
            userId,
            recentAttempts,
            timeWindowMinutes: this.config.logoutWindowMinutes,
            ip
          }
        })
      }
    } catch (error) {
      if (error instanceof ErrorWrapper) {
        throw error
      }

      this.logger?.warn?.('Logout rate limit check failed', {
        userId,
        ip,
        error: error.message
      })
    }
  }

  async createSession(user, deviceInfo = {}, options = {}) {
    return this.executeOperation('createSession', async (context) => {
      const rememberMe = options.rememberMe ?? false
      const expiryDuration = rememberMe
        ? this.config.rememberMeExpiry
        : this.config.sessionTimeout
      const now = new Date()

      const expiresAt = new Date(Date.now() + expiryDuration)
      const normalizedFingerprint = typeof deviceInfo.fingerprint === 'string' ? deviceInfo.fingerprint : ''
      const normalizeDeviceFingerprintForStorage = source => {
        if (!source) {
          return null
        }
        if (typeof source === 'string') {
          const trimmed = source.trim()
          if (!trimmed.length) {
            return null
          }
          return { value: trimmed }
        }
        if (Array.isArray(source)) {
          return source.length ? source : null
        }
        if (typeof source === 'object') {
          return Object.keys(source).length ? source : null
        }
        return null
      }

      const sanitizeObject = (payload, disallowedKeys = []) => {
        if (!payload || typeof payload !== 'object') {
          return {}
        }

        const blacklist = new Set(disallowedKeys)
        return Object.fromEntries(
          Object.entries(payload)
            .filter(([key, value]) => {
              if (blacklist.has(key)) return false
              if (value === undefined || value === null) return false
              if (typeof value === 'string' && value.trim().length === 0) return false
              if (typeof value === 'object') {
                if (Array.isArray(value)) {
                  return value.length > 0
                }
                return Object.keys(value).length > 0
              }
              return true
            })
        )
      }

      const normalizedDeviceFingerprint = (() => {
        const fingerprintSource = deviceInfo.deviceFingerprint ?? deviceInfo.fingerprint
        return normalizeDeviceFingerprintForStorage(fingerprintSource)
      })()
      const normalizedUserAgent = typeof deviceInfo.userAgent === 'string' ? deviceInfo.userAgent : ''
      const normalizedIpAddress = typeof deviceInfo.ipAddress === 'string' && deviceInfo.ipAddress.trim().length
        ? deviceInfo.ipAddress.trim()
        : (typeof deviceInfo.ip === 'string' ? deviceInfo.ip.trim() : '')
      const deviceDetails = (deviceInfo.deviceDetails && typeof deviceInfo.deviceDetails === 'object')
        ? deviceInfo.deviceDetails
        : {}
      const extraMetadata = (deviceInfo.metadata && typeof deviceInfo.metadata === 'object')
        ? deviceInfo.metadata
        : {}
      const sanitizedDeviceDetails = sanitizeObject(deviceDetails, [
        'ip',
        'ipAddress',
        'userAgent',
        'ua',
        'fingerprint',
        'deviceFingerprint'
      ])
      const sanitizedExtraMetadata = sanitizeObject(extraMetadata, [
        'ip',
        'ipAddress',
        'userAgent',
        'ua',
        'fingerprint',
        'deviceFingerprint'
      ])
      const sessionType = rememberMe
        ? 'persistent'
        : (typeof deviceInfo.sessionType === 'string' && deviceInfo.sessionType.length
          ? deviceInfo.sessionType
          : 'standard')
      const securityLevel = typeof deviceInfo.securityLevel === 'string' && deviceInfo.securityLevel.length
        ? deviceInfo.securityLevel
        : 'low'

      const pruneEmpty = payload => Object.fromEntries(
        Object.entries(payload || {}).filter(([_, value]) => {
          if (value === undefined || value === null) {
            return false
          }
          if (typeof value === 'string') {
            return value.trim().length > 0
          }
          if (typeof value === 'object') {
            return Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0
          }
          return true
        })
      )

      const metadataPayload = pruneEmpty({
        rememberMe,
        requestId: deviceInfo.requestId || context?.operationId,
        source: deviceInfo.source || 'login_handler',
        platform: deviceInfo.platform,
        browser: deviceInfo.browser,
        securityLevel,
        attributes: sanitizedExtraMetadata
      })

      const deviceInfoPayload = pruneEmpty({
        deviceFingerprint: normalizedDeviceFingerprint,
        platform: deviceInfo.platform,
        browser: deviceInfo.browser,
        rememberMe,
        requestId: deviceInfo.requestId,
        ...sanitizedDeviceDetails
      })

      const sessionRecord = await this.sessionDAO.baseCreate({
        userId: user.id,
        refreshToken: randomUUID(),
        ua: normalizedUserAgent,
        userAgent: normalizedUserAgent || null,
        fingerprint: normalizedFingerprint,
        deviceFingerprint: normalizedDeviceFingerprint,
        ipAddress: normalizedIpAddress,
        expiredAt: expiresAt.getTime(),
        isActive: true,
        lastActivity: now,
        lastActivityAt: now,
        sessionType,
        securityLevel,
        metadata: Object.keys(metadataPayload).length ? metadataPayload : null,
        deviceInfo: Object.keys(deviceInfoPayload).length ? deviceInfoPayload : null,
        createdBy: user.id,
        updatedBy: user.id
      })

      const sessionId = sessionRecord.id

      const authHelpers = this.authHelpers
      const accessToken = await authHelpers.makeAccessTokenHelper(user, sessionId)
      const refreshToken = sessionRecord.refreshToken

      const cachePayload = this.prepareSessionCachePayload(sessionRecord)
      if (cachePayload) {
        cachePayload.expiresAt = expiresAt.getTime()
        await this.invokeCache('addSession', user.id, cachePayload, {
          operation: 'create_session',
          sessionId,
          fingerprint: sessionRecord.fingerprint,
          ipAddress: sessionRecord.ipAddress,
          context
        })
      }

      return {
        sessionId,
        accessToken,
        refreshToken,
        expiresAt,
        sessionRecord
      }
    }, { userId: user.id, deviceInfo, options })
  }

  async refreshTokens(refreshToken, deviceInfo = {}, options = {}) {
    return this.executeOperation('refreshTokens', async (context) => {
      const normalizedToken = this.validateRefreshTokenInput(refreshToken)

      const session = await this.sessionDAO.baseGetWhere(
        { refreshToken: normalizedToken },
        { throwOnNotFound: false }
      )

      if (!session) {
        throw new ErrorWrapper({
          code: 'INVALID_SESSION',
          message: 'Invalid or expired refresh token',
          statusCode: 401
        })
      }

      const requestFingerprint = deviceInfo?.fingerprint || options?.fingerprint
      if (requestFingerprint) {
        const sessionFingerprint = session.fingerprint || session.deviceInfo?.fingerprint
        if (sessionFingerprint && sessionFingerprint !== requestFingerprint) {
          throw new ErrorWrapper({
            code: 'UNAUTHORIZED',
            message: 'Session verification failed',
            statusCode: 401,
            layer: 'SessionLifecycleService.refreshTokens',
            meta: { reason: 'fingerprint_mismatch' }
          })
        }
      }

      const sessionExpiry = session.expiresAt || session.expiredAt
      if (!sessionExpiry || Date.now() > new Date(sessionExpiry).getTime()) {
        await this.sessionDAO.deleteSession(session.id)
        await this.invokeCache(
          'removeSpecificSession',
          session.userId,
          this.prepareSessionCachePayload(session),
          { operation: 'refresh_tokens', reason: 'session_expired', sessionId: session.id, context }
        )

        throw new ErrorWrapper({
          code: 'SESSION_EXPIRED',
          message: 'Session has expired',
          statusCode: 401
        })
      }

      const user = await this.userDAO.getUserById(session.userId)

      if (!user || !user.isActive) {
        await this.sessionDAO.deleteSession(session.id)
        await this.invokeCache(
          'removeSpecificSession',
          session.userId,
          this.prepareSessionCachePayload(session),
          { operation: 'refresh_tokens', reason: 'user_inactive', sessionId: session.id, context }
        )
        throw new ErrorWrapper({
          code: 'USER_NOT_FOUND',
          message: 'User not found or inactive',
          statusCode: 401
        })
      }

      const cacheSnapshot = this.prepareSessionCachePayload(session)
      if (cacheSnapshot) {
        await this.invokeCache(
          'removeSpecificSession',
          session.userId,
          cacheSnapshot,
          { operation: 'refresh_tokens', step: 'remove_old_session', sessionId: session.id, context }
        )
      }

      await this.sessionDAO.deleteSession(session.id)

      const newSession = await this.createSession(user, deviceInfo, {
        rememberMe: session.sessionType === 'persistent'
      })

      return {
        user,
        session: {
          id: newSession.sessionId,
          refreshToken: newSession.refreshToken,
          expiresAt: newSession.expiresAt,
          deviceInfo: deviceInfo || {}
        },
        tokens: {
          accessToken: newSession.accessToken,
          refreshToken: newSession.refreshToken,
          expiresAt: newSession.expiresAt
        }
      }
    }, { refreshToken: '***', deviceInfo, options })
  }

  async logoutSession(sessionId, options = {}) {
    return this.executeOperation('logoutSession', async (context) => {
      const session = await this.sessionDAO.getSessionById(sessionId, { throwOnNotFound: false })

      if (!session) {
        return {
          success: false,
          session: null,
          sessionsInvalidated: 0,
          cacheCleared: false,
          logoutAllDevices: !!options.logoutAllDevices,
          alreadyInvalidated: true
        }
      }

      let sessionsInvalidated = 0
      let cacheCleared = false
      const cachePayload = this.prepareSessionCachePayload(session)

      const deleteCount = await this.sessionDAO.deleteSession(sessionId)
      sessionsInvalidated += typeof deleteCount === 'number' ? deleteCount : 0

      if (cachePayload) {
        const cacheResult = await this.invokeCache(
          'removeSpecificSession',
          session.userId,
          cachePayload,
          {
            operation: 'logout_session',
            sessionId,
            logoutAllDevices: !!options.logoutAllDevices,
            reason: options.reason,
            context
          }
        )

        cacheCleared = cacheCleared || (cacheResult?.success && !cacheResult?.fallback)
      }

      if (options.logoutAllDevices) {
        const removedCount = await this.sessionDAO.deleteUserSessions(session.userId)
        sessionsInvalidated += typeof removedCount === 'number' ? removedCount : 0

        const cacheResult = await this.invokeCache(
          'clearUserSessions',
          session.userId,
          null,
          { operation: 'logout_all_sessions', sessionId, reason: options.reason, context }
        )
        cacheCleared = cacheCleared || (cacheResult?.success && !cacheResult?.fallback)
      }

      return {
        success: true,
        session,
        sessionsInvalidated,
        cacheCleared,
        logoutAllDevices: !!options.logoutAllDevices
      }
    }, { sessionId, options })
  }

  async logoutByRefreshToken(refreshToken, options = {}) {
    return this.executeOperation('logoutByRefreshToken', async (context) => {
      const normalizedToken = this.validateRefreshTokenInput(refreshToken)
      const reason = options.reason || 'user_initiated'

      if (options.userId) {
        await this.checkLogoutRateLimit(options.userId, options.ip)
      }

      const whereClause = { refreshToken: normalizedToken }
      if (options.userId) {
        whereClause.userId = options.userId
      }

      const session = await this.sessionDAO.baseGetWhere(whereClause, { throwOnNotFound: false })

      if (!session) {
        throw new ErrorWrapper({
          code: 'INVALID_SESSION',
          message: 'Invalid or expired refresh token',
          statusCode: 401,
          meta: {
            userId: options.userId,
            reason
          }
        })
      }

      if (options.userId && session.userId !== options.userId) {
        throw new ErrorWrapper({
          code: 'SESSION_OWNERSHIP_MISMATCH',
          message: 'Session ownership mismatch',
          statusCode: 403,
          meta: {
            expectedUserId: options.userId,
            sessionUserId: session.userId
          }
        })
      }

      const expiresAt = session.expiresAt || session.expiredAt
      if (expiresAt && Date.now() > new Date(expiresAt).getTime()) {
        await this.sessionDAO.deleteSession(session.id)
        await this.invokeCache(
          'removeSpecificSession',
          session.userId,
          this.prepareSessionCachePayload(session),
          { operation: 'logout_by_refresh', reason: 'session_expired', sessionId: session.id, context }
        )

        throw new ErrorWrapper({
          code: 'SESSION_EXPIRED',
          message: 'Session already expired',
          statusCode: 401,
          meta: {
            sessionId: session.id,
            expiredAt: expiresAt
          }
        })
      }

      const logoutResult = await this.logoutSession(session.id, {
        logoutAllDevices: options.logoutAllDevices || false,
        reason,
        context: {
          requestId: options.requestId || context.operationId,
          ipAddress: options.ipAddress || options.ip,
          userAgent: options.userAgent
        }
      })

      if (this.userDAO) {
        await this.userDAO.baseUpdate(session.userId, {
          lastLogoutAt: new Date(),
          updatedAt: new Date()
        })
      }

      return {
        success: logoutResult.success,
        userId: session.userId,
        sessionId: session.id,
        logoutType: logoutResult.logoutAllDevices ? 'all_devices' : 'current_device',
        sessionsInvalidated: logoutResult.sessionsInvalidated,
        cacheCleared: logoutResult.cacheCleared
      }
    }, { refreshToken: '***', options })
  }

  async validateSession(accessToken, options = {}) {
    return this.executeOperation('validateSession', async (context) => {
      const authHelpers = this.authHelpers
      const tokenData = await authHelpers.parseTokenHelper(accessToken, 'access')

      if (!tokenData || !tokenData.userId || !tokenData.sessionId) {
        throw new ErrorWrapper({
          code: 'INVALID_ACCESS_TOKEN',
          message: 'Invalid or expired access token',
          statusCode: 401
        })
      }

      const session = await this.sessionDAO.getSessionById(tokenData.sessionId, { throwOnNotFound: false })

      if (!session) {
        throw new ErrorWrapper({
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
          statusCode: 401
        })
      }

      const sessionExpiresAt = session.expiresAt || session.expiredAt
      if (!sessionExpiresAt || Date.now() > new Date(sessionExpiresAt).getTime()) {
        await this.sessionDAO.deleteSession(session.id)
        await this.invokeCache(
          'removeSpecificSession',
          session.userId,
          this.prepareSessionCachePayload(session),
          { operation: 'validate_session', reason: 'session_expired', sessionId: session.id, context }
        )
        throw new ErrorWrapper({
          code: 'SESSION_EXPIRED',
          message: 'Session has expired',
          statusCode: 401
        })
      }

      const user = await this.userDAO.getUserById(session.userId)

      if (!user || !user.isActive) {
        await this.sessionDAO.deleteSession(session.id)
        await this.invokeCache(
          'removeSpecificSession',
          session.userId,
          this.prepareSessionCachePayload(session),
          { operation: 'validate_session', reason: 'user_inactive', sessionId: session.id, context }
        )
        throw new ErrorWrapper({
          code: 'USER_INACTIVE',
          message: 'User account is inactive',
          statusCode: 403
        })
      }

      let activeSessionRecord = session
      if (options.updateActivity !== false) {
        activeSessionRecord = await this.sessionDAO.updateSession(session.id, {
          lastActivityAt: new Date()
        })
      }

      if (activeSessionRecord) {
        const cachePayload = this.prepareSessionCachePayload(activeSessionRecord)
        if (cachePayload) {
          await this.invokeCache(
            'updateSession',
            user.id,
            cachePayload,
            { operation: 'validate_session', sessionId: activeSessionRecord.id, context }
          )
        }
      }

      return {
        user,
        session: {
          id: session.id,
          createdAt: session.createdAt,
          lastActivityAt: activeSessionRecord?.lastActivityAt || session.lastActivityAt,
          deviceInfo: session.deviceInfo
        }
      }
    }, { options })
  }

  async clearCachedSessions(userId, logContext = {}) {
    await this.invokeCache('clearUserSessions', userId, null, logContext)
  }
}

module.exports = SessionLifecycleService
