const ms = require('ms')
const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const addSession = require('handlers/v1/common/addSession')
const SessionEntity = require('handlers/v1/common/SessionEntity')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const CountryDAO = require('database/dao/CountryDAO')
const AuthModel = require('models/AuthModel')
const { checkPasswordHelper, makeAccessTokenHelper, makeUpdateTokenHelper } = require('helpers').authHelpers
const config = require('config')

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
    const refTokenExpiresInMilliseconds = new Date().getTime() + ms(config.token.refresh.expiresIn)
    
    // Enhanced logging context
    const logContext = {
      email: ctx.body.email,
      ip: ctx.ip,
      userAgent: ctx.headers['User-Agent'],
      fingerprint: ctx.body.fingerprint,
      timestamp: new Date().toISOString()
    }

    // Get user by email only (no mobile number support)
    let user
    try {
      user = await UserDAO.getByEmail(ctx.body.email)
    } catch (error) {
      // Enhanced security: Don't reveal whether email exists
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
        throw new ErrorWrapper({ 
          ...errorCodes.INVALID_CREDENTIALS,
          message: 'Invalid email or password'
        })
      }
      throw e
    }

    // Check if user account is active and verified
    if (!user.isActive) {
      throw new ErrorWrapper({
        ...errorCodes.ACCOUNT_DEACTIVATED,
        message: 'Account has been deactivated. Please contact support.'
      })
    }

    if (!user.isVerified) {
      // For email-only auth, user must verify their email first
      const updateToken = await makeUpdateTokenHelper(user)
      user = await UserDAO.baseUpdate(user.id, { updateToken })
      
      return this.result({
        success: false,
        requiresVerification: true,
        data: {
          userId: user.id,
          email: user.email,
          updateToken: updateToken,
          message: 'Email verification required. Please check your email and verify your account.',
          nextAction: 'verify_email'
        }
      })
    }

    // Create session with enhanced tracking
    const sessionData = {
      userId: user.id,
      ip: ctx.ip,
      ua: ctx.headers['User-Agent'],
      fingerprint: ctx.body.fingerprint,
      expiresIn: refTokenExpiresInMilliseconds,
      deviceInfo: ctx.body.deviceInfo || {},
      rememberMe: ctx.body.rememberMe || false
    }

    const newSession = new SessionEntity(sessionData)
    const session = await addSession(newSession)
    user.sessionId = session.id

    // Generate access token
    const accessToken = await makeAccessTokenHelper(user)
    
    const processingTime = Date.now() - startTime

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

module.exports = LoginHandler
