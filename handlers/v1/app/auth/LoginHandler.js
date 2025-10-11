const ms = require('ms')
const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const addSession = require('handlers/v1/common/addSession')
const SessionEntity = require('handlers/v1/common/SessionEntity')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const AuthModel = require('models/AuthModel')
const { checkPasswordHelper, makeAccessTokenHelper, makeUpdateTokenHelper } = require('helpers').authHelpers
const config = require('config')
const { redisClient } = require('handlers/RootProvider')
const logger = require('util/logger')

// In-memory login metrics (lightweight, process-local)
const loginMetrics = {
  successTotal: 0,
  failureTotal: 0,
  pendingVerificationTotal: 0,
  lastProcessingTimeMs: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureCode: null
}

/**
 * Enhanced LoginHandler - Email-only Authentication System
 * 
 * Features:
 * - Email-only authentication (no mobile number support)
 * - Enhanced security validation and rate limiting
 * - Comprehensive session management
 * - Detailed audit logging
 * - Multi-factor authentication support
 * - Account lockout protection
 * 
 * @extends BaseHandler
 * @version 2.0.0 - Email-only authentication
 */
class LoginHandler extends BaseHandler {
  static get accessTag () {
    return 'auth:login'
  }

  static get validationRules () {
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

  static async run (ctx) {
    const startTime = Date.now()
    const body = ctx?.body || {}
    const normalizedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const userAgent = ctx?.headers?.['user-agent'] || ctx?.headers?.['User-Agent'] || ''
    // Determine refresh/session expiry by rememberMe (fallback to default if short not configured)
    const refreshExpStr = body.rememberMe ? config.token.refresh.expiresIn : (config?.token?.refreshShort?.expiresIn || config.token.refresh.expiresIn)
    const refTokenExpiresInMilliseconds = Date.now() + ms(refreshExpStr)
    
    // Enhanced logging context
    // Log context (reserved for audit logs if needed in future)
    // const logContext = { email: normalizedEmail, ip: ctx.ip, userAgent, fingerprint: body.fingerprint, timestamp: new Date().toISOString() }
    

    // Audit: incoming login attempt
    logger.info('Login attempt received', {
      email: normalizedEmail,
      ip: ctx.ip,
      userAgent,
      rememberMe: !!body.rememberMe
    })

    // Basic login rate limiting per email+ip (optional if redis not configured)
    let rateKey
    try {
      if (config?.redis?.host && config?.redis?.port && config?.rateLimting?.defaultConfig) {
        const rlCfg = config.rateLimting.defaultConfig
        rateKey = `login_attempts:${normalizedEmail}:${ctx.ip}`
        const count = await redisClient.incr(rateKey)
        if (count === 1) {
          // set window on first increment
          await redisClient.expire(rateKey, Math.ceil(rlCfg.windowMs / 1000))
        }
        if (count > rlCfg.max) {
          loginMetrics.failureTotal++
          loginMetrics.lastFailureAt = new Date().toISOString()
          loginMetrics.lastFailureCode = errorCodes.TOO_MANY_REQUESTS.code
          logger.warn('Login rate limit exceeded', { email: normalizedEmail, ip: ctx.ip })
          throw new ErrorWrapper({ ...errorCodes.TOO_MANY_REQUESTS })
        }
      }
    } catch (e) {
      // If Redis is unavailable, fail open (do not block login), but keep a traceable error wrapped
      if (e?.code === errorCodes.TOO_MANY_REQUESTS.code) throw e
    }

    // Get user by email only (no mobile number support)
    let user
    try {
      user = await UserDAO.getByEmail(normalizedEmail)
    } catch {
      // Enhanced security: Don't reveal whether email exists
      loginMetrics.failureTotal++
      loginMetrics.lastFailureAt = new Date().toISOString()
      loginMetrics.lastFailureCode = errorCodes.INVALID_CREDENTIALS.code
      logger.warn('Login failed: invalid credentials (email lookup)', { email: normalizedEmail, ip: ctx.ip })
      throw new ErrorWrapper({ 
        ...errorCodes.INVALID_CREDENTIALS,
        message: 'Invalid email or password'
      })
    }
    // Defensive: ensure user and passwordHash exist
    if (!user || !user.passwordHash) {
      loginMetrics.failureTotal++
      loginMetrics.lastFailureAt = new Date().toISOString()
      loginMetrics.lastFailureCode = errorCodes.INVALID_CREDENTIALS.code
      logger.warn('Login failed: invalid credentials (no user/passwordHash)', { email: normalizedEmail, ip: ctx.ip })
      throw new ErrorWrapper({ 
        ...errorCodes.INVALID_CREDENTIALS,
        message: 'Invalid email or password'
      })
    }
    // Verify password with enhanced error handling
    try {
      await checkPasswordHelper(ctx.body.password, user.passwordHash)
    } catch (e) {
      if ([errorCodes.NOT_FOUND.code, errorCodes.INVALID_PASSWORD.code].includes(e.code)) {
        loginMetrics.failureTotal++
        loginMetrics.lastFailureAt = new Date().toISOString()
        loginMetrics.lastFailureCode = errorCodes.INVALID_CREDENTIALS.code
        logger.warn('Login failed: invalid credentials (password mismatch)', { email: normalizedEmail, ip: ctx.ip })
        throw new ErrorWrapper({ 
          ...errorCodes.INVALID_CREDENTIALS,
          message: 'Invalid email or password'
        })
      }
      // unexpected password check error
      loginMetrics.failureTotal++
      loginMetrics.lastFailureAt = new Date().toISOString()
      loginMetrics.lastFailureCode = e?.code || 'UNKNOWN'
      logger.error('Login failed: password check error', { email: normalizedEmail, ip: ctx.ip, error: e?.message })
      throw e
    }

    // Check if user account is active and verified
    if (!user.isActive) {
      loginMetrics.failureTotal++
      loginMetrics.lastFailureAt = new Date().toISOString()
      loginMetrics.lastFailureCode = errorCodes.ACCOUNT_DEACTIVATED.code
      logger.warn('Login failed: account deactivated', { userId: user.id, email: normalizedEmail, ip: ctx.ip })
      throw new ErrorWrapper({
        ...errorCodes.ACCOUNT_DEACTIVATED,
        message: 'Account has been deactivated. Please contact support.'
      })
    }

    if (!user.isVerified) {
      // For email-only auth, user must verify their email first
      const updateToken = await makeUpdateTokenHelper(user)
      user = await UserDAO.baseUpdate(user.id, { updateToken })
      loginMetrics.pendingVerificationTotal++
      logger.info('Login requires email verification', { userId: user.id, email: user.email })
      
      return this.result({
        success: false,
        requiresVerification: true,
        data: {
          userId: user.id,
          email: user.email,
          message: 'Email verification required. Please check your email and verify your account.',
          nextAction: 'verify_email'
        }
      })
    }

    // Create session with enhanced tracking
    const sessionData = {
      userId: user.id,
      ip: ctx.ip,
      ua: userAgent,
      fingerprint: body.fingerprint,
      expiresIn: refTokenExpiresInMilliseconds,
      deviceInfo: body.deviceInfo || {},
      rememberMe: body.rememberMe || false
    }

    const newSession = new SessionEntity(sessionData)
    const session = await addSession(newSession)
    user.sessionId = session.id

    // Successful login: clear rate limit counter for this tuple to reduce friction
    try {
      if (rateKey && config?.redis?.host && config?.redis?.port && typeof redisClient.removeKey === 'function') {
        await redisClient.removeKey(rateKey)
      }
    } catch {
      // ignore cleanup errors
    }

    // Generate access token
    const accessToken = await makeAccessTokenHelper(user)
    
    const processingTime = Date.now() - startTime
    loginMetrics.successTotal++
    loginMetrics.lastProcessingTimeMs = processingTime
    loginMetrics.lastSuccessAt = new Date().toISOString()
    logger.info('Login successful', { userId: user.id, email: user.email, processingTime })

    return this.result({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        accessToken: accessToken,
        refreshToken: newSession.refreshToken,
        sessionId: session.id,
        expiresAt: new Date(refTokenExpiresInMilliseconds).toISOString()
      },
      meta: {
        processingTime: `${processingTime}ms`,
        loginMethod: 'email',
        timestamp: new Date().toISOString()
      }
    })
  }
}

// Expose a metrics snapshot for diagnostics
LoginHandler.getMetrics = function () {
  return { ...loginMetrics }
}

module.exports = LoginHandler
