/**
 * AuthService - Enterprise Authentication Business Logic Service
 * 
 * Centralized authentication service providing:
 * - User authentication and authorization
 * - Session management and security
 * - Token lifecycle management (access, refresh, OTP)
 * - Device fingerprinting and security monitoring
 * - Multi-factor authentication support
 * - Password management and security policies
 * - Login attempt monitoring and rate limiting
 * - Security audit logging and compliance
 * 
 * @version 2.0.0
 * @author Susanoo API Team
 */

const BaseService = require('../BaseService')
const UserDAO = require('../../database/dao/UserDAO')
const SessionDAO = require('../../database/dao/SessionDAO')
const SessionLifecycleService = require('./SessionLifecycleService')
const { ErrorWrapper } = require('backend-core')
const joi = require('joi')

/**
 * Enterprise authentication service with comprehensive security features
 */
class AuthService extends BaseService {
  constructor(options = {}) {
    super(options)
    
    // Register dependencies
    this.registerDependency('userDAO', options.userDAO || UserDAO)
    this.registerDependency('sessionDAO', options.sessionDAO || SessionDAO)
    if (options.sessionCacheService) {
      this.registerDependency('sessionCacheService', options.sessionCacheService)
    }
    this.registerDependency('authHelpers', options.authHelpers || require('../../helpers/auth'))
    
    // Authentication configuration
    this.config = {
      // Session settings
      sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      refreshTokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
      rememberMeExpiry: 30 * 24 * 60 * 60 * 1000, // 30 days
      
      // Security settings
      maxLoginAttempts: 5,
      lockoutDuration: 15 * 60 * 1000, // 15 minutes
      passwordMinLength: 8,
      passwordMaxLength: 128,
      
      // Token settings
      accessTokenExpiry: '1h',
      refreshTokenRotation: true,
      
      // Device tracking
      trackDevices: true,
      maxDevicesPerUser: 5,
      
      ...options.config
    }
    
    // Security monitoring
    this.securityMetrics = {
      loginAttempts: new Map(),
      suspiciousActivities: new Map(),
      deviceRegistrations: new Map()
    }

    const sessionLifecycle = options.sessionLifecycleService || new SessionLifecycleService({
      sessionDAO: this.getDependency('sessionDAO'),
      userDAO: this.getDependency('userDAO'),
      authHelpers: this.getDependency('authHelpers'),
      sessionCacheService: this.dependencies.has('sessionCacheService')
        ? this.getDependency('sessionCacheService')
        : null,
      config: {
        sessionTimeout: this.config.sessionTimeout,
        rememberMeExpiry: this.config.rememberMeExpiry,
        refreshTokenRotation: this.config.refreshTokenRotation,
        maxLogoutAttempts: this.config.maxLoginAttempts,
        logoutWindowMinutes: 5
      },
      logger: this.logger
    })

    this.registerDependency('sessionLifecycleService', sessionLifecycle)
    this.sessionLifecycle = sessionLifecycle
  }

  /**
   * Authenticate user with email and password
   * @param {Object} credentials - Login credentials
   * @param {Object} deviceInfo - Device information
   * @param {Object} options - Authentication options
   * @returns {Promise<Object>} Authentication result with tokens
   */
  async authenticateUser(credentials, deviceInfo = {}, options = {}) {
    return this.executeOperation('authenticateUser', async (context) => {
      // Validate input
      const validatedCredentials = this.validateCredentials(credentials)
      const validatedDeviceInfo = this.validateDeviceInfo(deviceInfo)
      
      // Check rate limiting
      await this.checkRateLimit(validatedCredentials.email, context)
      
      // Get user from database
      const userDAO = this.getDependency('userDAO')
      const user = await userDAO.getByEmail(validatedCredentials.email)
      
      if (!user) {
        await this.recordFailedAttempt(validatedCredentials.email, 'USER_NOT_FOUND', context)
        throw new ErrorWrapper({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          statusCode: 401
        })
      }
      
      // Verify password
      const authHelpers = this.getDependency('authHelpers')
      const isPasswordValid = await authHelpers.checkPasswordHelper(
        validatedCredentials.password, 
        user.passwordHash // Use passwordHash field, not password
      )
      
      if (!isPasswordValid) {
        await this.recordFailedAttempt(validatedCredentials.email, 'INVALID_PASSWORD', context)
        throw new ErrorWrapper({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          statusCode: 401
        })
      }
      
      // Check if user account is active
      if (!user.isActive) {
        await this.recordFailedAttempt(validatedCredentials.email, 'ACCOUNT_DISABLED', context)
        throw new ErrorWrapper({
          code: 'ACCOUNT_DISABLED',
          message: 'Account has been disabled',
          statusCode: 403
        })
      }
      
      // Generate session and tokens
      const sessionData = await this.sessionLifecycle.createSession(
        user,
        validatedDeviceInfo,
        { rememberMe: options.rememberMe }
      )
      
      // Clear failed attempts
      await this.clearFailedAttempts(validatedCredentials.email)
      
      // Log successful authentication
      this.emit('auth:login_success', {
        userId: user.id,
        email: user.email,
        deviceInfo: validatedDeviceInfo,
        sessionId: sessionData.sessionId,
        context
      })
      
      return {
        user: this.sanitizeUserData(user),
        session: sessionData,
        tokens: {
          accessToken: sessionData.accessToken,
          refreshToken: sessionData.refreshToken
        },
        expiresAt: sessionData.expiresAt
      }
    }, { email: credentials?.email, deviceInfo })
  }

  /**
   * Refresh authentication tokens
   * @param {string} refreshToken - Current refresh token
   * @param {Object} deviceInfo - Device information
   * @returns {Promise<Object>} New tokens
   */
  async refreshTokens(refreshToken, deviceInfo = {}) {
    return this.executeOperation('refreshTokens', async (context) => {
      const lifecycleResult = await this.sessionLifecycle.refreshTokens(refreshToken, deviceInfo, { context })
      const { user, session, tokens } = lifecycleResult

      this.emit('auth:tokens_refreshed', {
        userId: user.id,
        sessionId: session.id,
        deviceInfo,
        context
      })

      return {
        success: true,
        user: this.sanitizeUserData(user),
        session,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      }
    }, { refreshToken: '***', deviceInfo })
  }

  /**
   * Logout user and invalidate session
   * @param {string} sessionId - Session ID to logout
   * @param {Object} options - Logout options
   * @returns {Promise<boolean>} Success status
  */
  async logoutUser(sessionId, options = {}) {
    return this.executeOperation('logoutUser', async (context) => {
      const result = await this.sessionLifecycle.logoutSession(sessionId, { ...options, context })

      if (result.session) {
        this.emit('auth:logout', {
          userId: result.session.userId,
          sessionId,
          logoutAllDevices: result.logoutAllDevices,
          reason: options.reason,
          context
        })
      }

      return result
    }, { sessionId, options })
  }

  /**
   * Logout using refresh token (with optional all-device invalidation)
   * @param {string} refreshToken - Refresh token to invalidate
   * @param {Object} options - Logout options
   * @returns {Promise<Object>} Logout result
  */
  async logoutByRefreshToken(refreshToken, options = {}) {
    return this.executeOperation('logoutByRefreshToken', async (context) => {
      const lifecycleResult = await this.sessionLifecycle.logoutByRefreshToken(refreshToken, {
        ...options,
        context: {
          requestId: options.requestId || context.operationId,
          ip: options.ip,
          userAgent: options.userAgent
        }
      })

      if (lifecycleResult.success) {
        this.emit('auth:logout', {
          userId: lifecycleResult.userId,
          sessionId: lifecycleResult.sessionId,
          logoutAllDevices: lifecycleResult.logoutType === 'all_devices',
          reason: options.reason || 'user_initiated',
          context
        })
      }

      return lifecycleResult
    }, { refreshToken: '***', logoutAllDevices: options.logoutAllDevices, userId: options.userId })
  }

  /**
   * Validate user session
   * @param {string} accessToken - Access token to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Session and user data
  */
  async validateSession(accessToken, options = {}) {
    return this.executeOperation('validateSession', async (context) => {
      const { user, session } = await this.sessionLifecycle.validateSession(accessToken, { ...options, context })

      return {
        user: this.sanitizeUserData(user),
        session
      }
    }, { tokenData: '***', options })
  }

  /**
   * Change user password with security validations
   * @param {number} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @param {Object} options - Change options
   * @returns {Promise<boolean>} Success status
   */
  async changePassword(userId, currentPassword, newPassword, options = {}) {
    return this.executeOperation('changePassword', async (context) => {
      // Validate new password
      this.validatePassword(newPassword)
      
      // Get user
      const userDAO = this.getDependency('userDAO')
      const user = await userDAO.getUserById(userId)
      
      if (!user) {
        throw new ErrorWrapper({
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          statusCode: 404
        })
      }
      
      // Verify current password
      const authHelpers = this.getDependency('authHelpers')
      const isCurrentPasswordValid = await authHelpers.checkPasswordHelper(
        currentPassword, 
        user.password
      )
      
      if (!isCurrentPasswordValid) {
        throw new ErrorWrapper({
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password is incorrect',
          statusCode: 400
        })
      }
      
      // Check if new password is different
      const isSamePassword = await authHelpers.checkPasswordHelper(
        newPassword, 
        user.password
      )
      
      if (isSamePassword) {
        throw new ErrorWrapper({
          code: 'SAME_PASSWORD',
          message: 'New password must be different from current password',
          statusCode: 400
        })
      }
      
      // Hash new password
      const hashedPassword = await authHelpers.makePasswordHashHelper(newPassword)
      
      // Update password
      await userDAO.updateUser(userId, {
        password: hashedPassword,
        passwordChangedAt: new Date()
      })
      
      // Invalidate all sessions if requested
      if (options.invalidateAllSessions !== false) {
        const sessionDAO = this.getDependency('sessionDAO')
        await sessionDAO.deleteUserSessions(userId)
        await this.sessionLifecycle.clearCachedSessions(userId, {
          operation: 'password_changed',
          reason: 'credentials_rotated'
        })
      }
      
      this.emit('auth:password_changed', {
        userId,
        invalidatedSessions: options.invalidateAllSessions !== false,
        context
      })
      
      return true
    }, { userId, options })
  }

  // ===============================
  // PRIVATE HELPER METHODS
  // ===============================

  /**
   * Validate login credentials
   * @private
   */
  validateCredentials(credentials) {
    const schema = joi.object({
      email: joi.string().email().max(100).required(),
      password: joi.string().min(this.config.passwordMinLength).max(this.config.passwordMaxLength).required()
    })
    
    return this.validateInput(credentials, schema)
  }

  /**
   * Validate device information
   * @private
   */
  validateDeviceInfo(deviceInfo) {
    const schema = joi.object({
      fingerprint: joi.string().min(10).max(100).optional(),
      userAgent: joi.string().max(500).optional(),
      ipAddress: joi.string().ip().optional(),
      platform: joi.string().max(50).optional(),
      browser: joi.string().max(50).optional()
    })
    
    return this.validateInput(deviceInfo, schema)
  }

  /**
   * Validate password strength
   * @private
   */
  validatePassword(password) {
    if (typeof password !== 'string') {
      throw new ErrorWrapper({
        code: 'INVALID_PASSWORD_TYPE',
        message: 'Password must be a string',
        statusCode: 400
      })
    }
    
    if (password.length < this.config.passwordMinLength) {
      throw new ErrorWrapper({
        code: 'PASSWORD_TOO_SHORT',
        message: `Password must be at least ${this.config.passwordMinLength} characters`,
        statusCode: 400
      })
    }
    
    if (password.length > this.config.passwordMaxLength) {
      throw new ErrorWrapper({
        code: 'PASSWORD_TOO_LONG',
        message: `Password must be no more than ${this.config.passwordMaxLength} characters`,
        statusCode: 400
      })
    }
    
    return true
  }

  /**
   * Check rate limiting for login attempts
   * @private
   */
  async checkRateLimit(email, context) {
    const attempts = this.securityMetrics.loginAttempts.get(email) || { count: 0, lastAttempt: null }
    
    if (attempts.count >= this.config.maxLoginAttempts) {
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt
      
      if (timeSinceLastAttempt < this.config.lockoutDuration) {
        throw new ErrorWrapper({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many login attempts. Please try again later.',
          statusCode: 429,
          meta: {
            retryAfter: Math.ceil((this.config.lockoutDuration - timeSinceLastAttempt) / 1000)
          }
        })
      } else {
        // Reset attempts after lockout period
        this.securityMetrics.loginAttempts.delete(email)
      }
    }
  }

  /**
   * Record failed login attempt
   * @private
   */
  async recordFailedAttempt(email, reason, context) {
    const attempts = this.securityMetrics.loginAttempts.get(email) || { count: 0, lastAttempt: null }
    
    attempts.count++
    attempts.lastAttempt = Date.now()
    
    this.securityMetrics.loginAttempts.set(email, attempts)
    
    this.emit('auth:failed_attempt', {
      email,
      reason,
      attemptCount: attempts.count,
      context
    })
  }

  /**
   * Clear failed login attempts
   * @private
   */
  async clearFailedAttempts(email) {
    this.securityMetrics.loginAttempts.delete(email)
  }

  /**
   * Sanitize user data for API response
   * @private
   */
  sanitizeUserData(user) {
    const sanitized = { ...user }
    
    // Remove sensitive fields
    delete sanitized.password
    delete sanitized.passwordResetToken
    delete sanitized.emailConfirmToken
    
    return sanitized
  }
}

module.exports = AuthService
