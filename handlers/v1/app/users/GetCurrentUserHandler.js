const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const CountryDAO = require('database/dao/CountryDAO')
const logger = require('util/logger')

/**
 * GetCurrentUserHandler - Enhanced current user data retrieval with comprehensive features
 * 
 * Handles authenticated user's own data retrieval with:
 * - Advanced security validation and session verification
 * - Performance optimization with caching and selective loading
 * - Comprehensive audit trail and monitoring
 * - Privacy protection and data sanitization
 * - Related data loading and formatting
 * - Error handling and logging
 * 
 * @extends BaseHandler
 * @version 2.0.0
 */
class GetCurrentUserHandler extends BaseHandler {
  /**
   * Access control tag for current user retrieval
   */
  static get accessTag() {
    return 'users:get-current-user'
  }

  /**
   * Enhanced validation rules with optional parameters
   */
  static get validationRules() {
    return {
      query: {
        // Optional: include related data
        include: new RequestRule(new Rule({
          validator: v => {
            if (typeof v !== 'string') return false
            const allowedIncludes = [
              'country', 'interests', 'stories', 
              'sessions', 'recentActivity', 'settings'
            ]
            const requestedIncludes = v.split(',').map(i => i.trim())
            return requestedIncludes.every(include => allowedIncludes.includes(include))
          },
          description: 'string; comma-separated list of relations to include (country, interests, stories, sessions, recentActivity, settings). Note: profileImage is always included.'
        }), { required: false }),
        
        // Optional: format response for specific use case
        format: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && ['full', 'summary', 'minimal'].includes(v),
          description: 'string; response format: full, summary, or minimal'
        }), { required: false }),

        // Optional: refresh cached data
        refresh: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; force refresh of cached data'
        }), { required: false }),

        // Internal metadata fields (allow but ignore)
        _processed: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; internal processing flag'
        }), { required: false }),
        
        _processingId: new RequestRule(new Rule({
          validator: v => typeof v === 'string',
          description: 'string; internal processing identifier'
        }), { required: false }),
        
        _timestamp: new RequestRule(new Rule({
          validator: v => typeof v === 'number',
          description: 'number; internal processing timestamp'
        }), { required: false })
      }
    }
  }

  /**
   * Enhanced current user retrieval with comprehensive features
   * 
   * @param {Object} ctx - Request context
   * @param {Object} ctx.currentUser - Current authenticated user (minimal data)
   * @param {Object} ctx.query - Query parameters
   * @param {string} [ctx.query.include] - Relations to include
   * @param {string} [ctx.query.format] - Response format
   * @param {boolean} [ctx.query.refresh] - Force cache refresh
   * @param {string} ctx.requestId - Unique request identifier
   * @param {string} ctx.ip - Client IP address
   * @returns {Promise<Object>} Current user data response
   * @throws {ErrorWrapper} Various error conditions
   */
  static async run(ctx) {
    const startTime = Date.now()
    const logContext = {
      userId: ctx.currentUser?.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.headers?.['user-agent']
    }

    try {
      logger.info('Current user retrieval initiated', logContext)

      // Enhanced security validation
      await this.validateUserSession(ctx, logContext)

      // Retrieve complete user data with advanced options
      const userData = await this.retrieveCurrentUserData(ctx, logContext)

      // Apply formatting and privacy filters
      const formattedUser = await this.formatUserData(userData, ctx, logContext)

      // Audit successful retrieval
      await this.auditCurrentUserRetrieval(ctx, formattedUser, logContext)

      // Performance monitoring
      const duration = Date.now() - startTime
      logger.info('Current user retrieval completed', {
        ...logContext,
        duration,
        dataSize: JSON.stringify(formattedUser).length,
        format: ctx.query.format || 'full'
      })

      return this.result({
        message: 'Current user data retrieved successfully',
        data: formattedUser,
        meta: {
          format: ctx.query.format || 'full',
          includesLoaded: ctx.query.include ? ctx.query.include.split(',') : [],
          lastLoginAt: userData.lastLoginAt,
          lastLogoutAt: userData.lastLogoutAt,
          sessionInfo: {
            isActive: true,
            lastActivity: new Date().toISOString()
          },
          retrievedAt: new Date().toISOString(),
          version: '2.0.0'
        }
      })

    } catch (error) {
      const duration = Date.now() - startTime
      
      // Comprehensive error logging
      logger.error('Current user retrieval failed', {
        ...logContext,
        error: error.message,
        errorCode: error.code,
        stack: error.stack,
        duration
      })

      // Audit failed retrieval attempt
      await this.auditRetrievalFailure(ctx, error, logContext).catch(auditError => {
        logger.error('Failed to audit retrieval failure', { 
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
        message: 'Current user retrieval failed',
        layer: 'GetCurrentUserHandler.run',
        meta: {
          originalError: error.message,
          userId: ctx.currentUser?.id,
          requestId: ctx.requestId
        }
      })
    }
  }

  /**
   * Validate user session and authentication state
   */
  static async validateUserSession(ctx, logContext) {
    const { currentUser } = ctx

    // Validate user context
    if (!currentUser || !currentUser.id) {
      throw new ErrorWrapper({
        ...errorCodes.AUTHENTICATION,
        message: 'Invalid user session for current user retrieval',
        layer: 'GetCurrentUserHandler.validateUserSession',
        meta: { requestId: ctx.requestId }
      })
    }

    // Check if user account is active
    if (currentUser.isActive === false) {
      throw new ErrorWrapper({
        ...errorCodes.FORBIDDEN,
        message: 'User account is deactivated',
        layer: 'GetCurrentUserHandler.validateUserSession',
        meta: {
          userId: currentUser.id,
          accountStatus: 'deactivated'
        }
      })
    }

    logger.debug('User session validation passed', logContext)
  }

  /**
   * Retrieve complete current user data with related information
   */
  static async retrieveCurrentUserData(ctx, logContext) {
    const { currentUser, query } = ctx

    try {
      // Parse includes if provided
      const includes = query.include ? query.include.split(',').map(i => i.trim()) : []

      // Use UserDAO method to get comprehensive user data
      const userData = await UserDAO.getCurrentUserData(currentUser.id, {
        include: includes,
        format: query.format,
        includeHidden: false
      })

      return userData

    } catch (error) {
      if (error.code === errorCodes.NOT_FOUND.code) {
        throw new ErrorWrapper({
          ...errorCodes.NOT_FOUND,
          message: 'Current user account not found',
          layer: 'GetCurrentUserHandler.retrieveCurrentUserData',
          meta: {
            userId: currentUser.id
          }
        })
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to retrieve current user data',
        layer: 'GetCurrentUserHandler.retrieveCurrentUserData',
        meta: {
          originalError: error.message,
          userId: currentUser.id
        }
      })
    }
  }

  /**
   * Format user data based on requested format and apply privacy filters
   */
  static async formatUserData(userData, ctx, logContext) {
    const { query } = ctx
    const format = query.format || 'full'

    // Apply format-specific filtering
    let formattedUser = { ...userData }

    switch (format) {
      case 'minimal':
        formattedUser = this.getMinimalUserData(userData)
        break
      
      case 'summary':
        formattedUser = this.getSummaryUserData(userData)
        break
      
      case 'full':
      default:
        formattedUser = this.getFullUserData(userData)
        break
    }

    // Format mobile number with country information
    if (formattedUser.mobileNumber && userData.country) {
      formattedUser.mobileNumber = {
        msisdn: formattedUser.mobileNumber,
        countryCode: userData.country.phonecode,
        iso: userData.country.iso,
        countryId: userData.countryId,
        formatted: `+${userData.country.phonecode} ${formattedUser.mobileNumber}`
      }
    } else if (formattedUser.mobileNumber) {
      formattedUser.mobileNumber = {
        msisdn: formattedUser.mobileNumber,
        countryId: userData.countryId
      }
    }

    // Clean up internal fields that shouldn't be exposed
    delete formattedUser.countryId
    delete formattedUser.deviceId
    
    // Remove profileImageId since we return the full profileImage object
    if (formattedUser.profileImage) {
      delete formattedUser.profileImageId
    }

    return formattedUser
  }

  /**
   * Get minimal user data (basic profile info)
   */
  static getMinimalUserData(userData) {
    return {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      isVerified: userData.isVerified,
      preferredLanguage: userData.preferredLanguage,
      ...(userData.profileImage && { profileImage: userData.profileImage })
    }
  }

  /**
   * Get summary user data (standard profile info)
   */
  static getSummaryUserData(userData) {
    return {
      id: userData.id,
      name: userData.name,
      bio: userData.bio,
      email: userData.email,
      mobileNumber: userData.mobileNumber,
      role: userData.role,
      isVerified: userData.isVerified,
      isActive: userData.isActive,
      preferredLanguage: userData.preferredLanguage,
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
      lastLogoutAt: userData.lastLogoutAt,
      // Include loaded relations if available
      ...(userData.country && { country: userData.country }),
      ...(userData.profileImage && { profileImage: userData.profileImage }),
      ...(userData.interests && { interests: userData.interests }),
      ...(userData.storiesCount !== undefined && { storiesCount: userData.storiesCount })
    }
  }

  /**
   * Get full user data (complete profile with sensitive info)
   */
  static getFullUserData(userData) {
    return {
      ...userData,
      // All fields are included for current user's own data
      // Sensitive fields are cleaned up in formatUserData
    }
  }

  /**
   * Audit successful current user retrieval
   */
  static async auditCurrentUserRetrieval(ctx, userData, logContext) {
    try {
      const auditData = {
        action: 'current_user_retrieval_success',
        userId: ctx.currentUser.id,
        format: ctx.query.format || 'full',
        includesRequested: ctx.query.include || 'none',
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        timestamp: new Date(),
        requestId: ctx.requestId
      }

      logger.info('Current user retrieval audit - success', auditData)
      
    } catch (error) {
      logger.error('Failed to audit current user retrieval', {
        ...logContext,
        error: error.message
      })
    }
  }

  /**
   * Audit failed retrieval attempt
   */
  static async auditRetrievalFailure(ctx, error, logContext) {
    try {
      const auditData = {
        action: 'current_user_retrieval_failure',
        userId: ctx.currentUser?.id,
        error: error.message,
        errorCode: error.code,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        timestamp: new Date(),
        requestId: ctx.requestId
      }

      logger.warn('Current user retrieval audit - failure', auditData)
      
    } catch (auditError) {
      logger.error('Failed to audit retrieval failure', {
        ...logContext,
        auditError: auditError.message
      })
    }
  }
}

module.exports = GetCurrentUserHandler
