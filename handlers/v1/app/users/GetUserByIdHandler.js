const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const UserModel = require('models/UserModel')
const logger = require('util/logger')

/**
 * GetUserByIdHandler - Enhanced user retrieval with comprehensive security and features
 * 
 * Handles user data retrieval with:
 * - Advanced security validation and access control
 * - Performance optimization with selective field loading
 * - Comprehensive audit trail and monitoring
 * - Privacy protection and data sanitization
 * - Error handling and logging
 * - Cache integration support
 * 
 * @extends BaseHandler
 * @version 2.0.0
 */
class GetUserByIdHandler extends BaseHandler {
  /**
   * Access control tag for user retrieval operations
   */
  static get accessTag() {
    return 'users:get-by-id'
  }

  /**
   * Enhanced validation rules with security constraints
   */
  static get validationRules() {
    return {
      params: {
        id: new RequestRule(UserModel.schema.id, { required: true })
      },
      query: {
        // Optional: fields to include in response
        fields: new RequestRule(new Rule({
          validator: v => {
            if (typeof v !== 'string') return false
            const allowedFields = [
              'id', 'name', 'bio', 'role', 'email', 'mobileNumber', 
              'isVerified', 'isActive', 'countryId', 'preferredLanguage', 
              'profileImageId', 'createdAt', 'updatedAt', 'lastLogoutAt'
            ]
            const requestedFields = v.split(',').map(f => f.trim())
            return requestedFields.every(field => allowedFields.includes(field))
          },
          description: 'string; comma-separated list of fields to include in response'
        }), { required: false }),
        
        // Optional: include related data
        include: new RequestRule(new Rule({
          validator: v => {
            if (typeof v !== 'string') return false
            const allowedIncludes = ['country', 'profileImage', 'interests', 'stories']
            const requestedIncludes = v.split(',').map(i => i.trim())
            return requestedIncludes.every(include => allowedIncludes.includes(include))
          },
          description: 'string; comma-separated list of relations to include (country, profileImage, interests, stories)'
        }), { required: false }),
        
        // Optional: format response for specific use case
        format: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && ['full', 'summary', 'public'].includes(v),
          description: 'string; response format: full, summary, or public'
        }), { required: false }),

        // Internal metadata fields added by QueryMiddleware (allow but ignore)
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
   * Enhanced user retrieval with comprehensive features
   * 
   * @param {Object} ctx - Request context
   * @param {Object} ctx.params - URL parameters
   * @param {string} ctx.params.id - User ID to retrieve
   * @param {Object} ctx.query - Query parameters
   * @param {string} [ctx.query.fields] - Specific fields to include
   * @param {string} [ctx.query.include] - Relations to include
   * @param {string} [ctx.query.format] - Response format
   * @param {Object} ctx.currentUser - Current authenticated user
   * @param {string} ctx.requestId - Unique request identifier
   * @param {string} ctx.ip - Client IP address
   * @returns {Promise<Object>} User data response
   * @throws {ErrorWrapper} Various error conditions
   */
  static async run(ctx) {
    const startTime = Date.now()
    const logContext = {
      userId: ctx.params.id,
      requestedBy: ctx.currentUser?.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.headers?.['user-agent']
    }

    try {
      logger.info('User retrieval initiated', logContext)

      // Enhanced security validation
      await this.validateUserAccess(ctx, logContext)

      // Retrieve user with advanced options
      const user = await this.retrieveUserData(ctx, logContext)

      // Apply privacy filters and data sanitization
      const sanitizedUser = await this.sanitizeUserData(user, ctx, logContext)

      // Audit successful retrieval
      await this.auditUserRetrieval(ctx, user, logContext)

      // Performance monitoring
      const duration = Date.now() - startTime
      logger.info('User retrieval completed', {
        ...logContext,
        duration,
        dataSize: JSON.stringify(sanitizedUser).length
      })

      return this.result({
        message: 'User retrieved successfully',
        data: sanitizedUser,
        meta: {
          format: ctx.query.format || 'full',
          fieldsRequested: ctx.query.fields ? ctx.query.fields.split(',').length : 'all',
          includesRequested: ctx.query.include ? ctx.query.include.split(',') : [],
          retrievedAt: new Date().toISOString(),
          version: '2.0.0'
        }
      })

    } catch (error) {
      const duration = Date.now() - startTime
      
      // Comprehensive error logging
      logger.error('User retrieval failed', {
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
        message: 'User retrieval failed',
        layer: 'GetUserByIdHandler.run',
        meta: {
          originalError: error.message,
          userId: ctx.params.id,
          requestId: ctx.requestId
        }
      })
    }
  }

  /**
   * Validate user access permissions and security constraints
   */
  static async validateUserAccess(ctx, logContext) {
    const { params, currentUser, query } = ctx
    const targetUserId = params.id
    const requestingUserId = currentUser?.id

    // Check if user is requesting their own data or has appropriate permissions
    const isSelfRequest = targetUserId === requestingUserId
    const isAdminRequest = currentUser?.role === 'admin' || currentUser?.role === 'superadmin'
    const isPublicRequest = query.format === 'public'

    // Allow public format for any authenticated user
    if (isPublicRequest) {
      logger.debug('Public format request approved', logContext)
      return
    }

    // Allow self-requests
    if (isSelfRequest) {
      logger.debug('Self-request approved', logContext)
      return
    }

    // Allow admin requests
    if (isAdminRequest) {
      logger.debug('Admin request approved', logContext)
      return
    }

    // For non-admin users requesting other users' data, apply restrictions
    if (!isSelfRequest && !isAdminRequest) {
      // Only allow summary format for other users
      if (query.format !== 'summary' && query.format !== 'public') {
        throw new ErrorWrapper({
          ...errorCodes.FORBIDDEN,
          message: 'Insufficient permissions to access full user data',
          layer: 'GetUserByIdHandler.validateUserAccess',
          meta: {
            targetUserId,
            requestingUserId,
            requestedFormat: query.format || 'full'
          }
        })
      }

      // Restrict sensitive fields for other users
      if (query.fields && this.containsSensitiveFields(query.fields)) {
        throw new ErrorWrapper({
          ...errorCodes.FORBIDDEN,
          message: 'Insufficient permissions to access sensitive user fields',
          layer: 'GetUserByIdHandler.validateUserAccess',
          meta: {
            targetUserId,
            requestingUserId,
            requestedFields: query.fields
          }
        })
      }
    }

    logger.debug('User access validation passed', logContext)
  }

  /**
   * Retrieve user data with advanced options
   */
  static async retrieveUserData(ctx, logContext) {
    const { params, query } = ctx

    try {
      // Build retrieval options
      const options = {
        includeHidden: false, // Never include hidden fields like passwords
        throwOnNotFound: true
      }
      
      // Get base user data
      let user = await UserDAO.baseGetById(params.id, options)
    
      // Load related data if requested
      if (query.include) {
        user = await this.loadRelatedData(user, query.include, logContext)
      }

      return user

    } catch (error) {
      if (error.code === errorCodes.NOT_FOUND.code) {
        throw new ErrorWrapper({
          ...errorCodes.NOT_FOUND,
          message: 'User not found or access denied',
          layer: 'GetUserByIdHandler.retrieveUserData',
          meta: {
            userId: params.id
          }
        })
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to retrieve user data',
        layer: 'GetUserByIdHandler.retrieveUserData',
        meta: {
          originalError: error.message,
          userId: params.id
        }
      })
    }
  }

  /**
   * Load related data based on include parameter
   */
  static async loadRelatedData(user, includeParam, logContext) {
    const includes = includeParam.split(',').map(i => i.trim())
    
    try {
      // Load country data if requested
      if (includes.includes('country') && user.countryId) {
        const CountryDAO = require('database/dao/CountryDAO')
        user.country = await CountryDAO.baseGetById(user.countryId, { throwOnNotFound: false })
      }

      // Load profile image if requested
      if (includes.includes('profileImage') && user.profileImageId) {
        const AttachmentDAO = require('database/dao/AttachmentDAO')
        user.profileImage = await AttachmentDAO.baseGetById(user.profileImageId, { throwOnNotFound: false })
      }

      // Load user interests if requested
      if (includes.includes('interests')) {
        const UserInterestDAO = require('database/dao/UserInterestDAO')
        user.interests = await UserInterestDAO.baseGetList({
          page: 0,
          limit: 100,
          filter: { userId: user.id },
          orderBy: { field: 'createdAt', direction: 'desc' }
        }).then(result => result.results || [])
      }

      // Load user stories summary if requested
      if (includes.includes('stories')) {
        const StoryDAO = require('database/dao/StoryDAO')
        user.storiesCount = await StoryDAO.baseGetCount({ userId: user.id })
        user.recentStories = await StoryDAO.baseGetList({
          page: 0,
          limit: 5,
          filter: { userId: user.id },
          orderBy: { field: 'createdAt', direction: 'desc' }
        }).then(result => result.results || [])
      }

      return user

    } catch (error) {
      // Don't fail the main request if related data loading fails
      logger.warn('Failed to load some related data', {
        ...logContext,
        error: error.message,
        includes
      })
      return user
    }
  }

  /**
   * Sanitize user data based on access level and format
   */
  static async sanitizeUserData(user, ctx, logContext) {
    const { query, currentUser } = ctx
    const format = query.format || 'full'
    const targetUserId = user.id
    const requestingUserId = currentUser?.id
    const isSelfRequest = targetUserId === requestingUserId
    const isAdminRequest = currentUser?.role === 'admin' || currentUser?.role === 'superadmin'

    // Apply format-specific filtering
    let sanitizedUser = { ...user }

    switch (format) {
      case 'public':
        sanitizedUser = this.getPublicUserData(user)
        break
      
      case 'summary':
        sanitizedUser = this.getSummaryUserData(user, isSelfRequest || isAdminRequest)
        break
      
      case 'full':
      default:
        // Full data only for self or admin
        if (!isSelfRequest && !isAdminRequest) {
          sanitizedUser = this.getSummaryUserData(user, false)
        }
        break
    }

    // Apply field filtering if specified
    if (query.fields) {
      const requestedFields = query.fields.split(',').map(f => f.trim())
      const filteredUser = {}
      
      requestedFields.forEach(field => {
        if (sanitizedUser.hasOwnProperty(field)) {
          filteredUser[field] = sanitizedUser[field]
        }
      })
      
      sanitizedUser = filteredUser
    }

    // Remove any remaining sensitive data
    delete sanitizedUser.passwordHash
    delete sanitizedUser.updateToken
    delete sanitizedUser.verifyCode
    delete sanitizedUser.resetPasswordToken
    delete sanitizedUser.resetPasswordOTP
    delete sanitizedUser.resetPasswordCode
    delete sanitizedUser.emailConfirmToken

    return sanitizedUser
  }

  /**
   * Get public user data (minimal information)
   */
  static getPublicUserData(user) {
    return {
      id: user.id,
      name: user.name,
      bio: user.bio,
      profileImageId: user.profileImageId,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      // Include loaded relations if available
      ...(user.profileImage && { profileImage: user.profileImage }),
      ...(user.storiesCount !== undefined && { storiesCount: user.storiesCount })
    }
  }

  /**
   * Get summary user data (moderate information)
   */
  static getSummaryUserData(user, includePrivateFields = false) {
    const summaryData = {
      id: user.id,
      name: user.name,
      bio: user.bio,
      role: user.role,
      isVerified: user.isVerified,
      isActive: user.isActive,
      profileImageId: user.profileImageId,
      preferredLanguage: user.preferredLanguage,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Include loaded relations if available
      ...(user.country && { country: user.country }),
      ...(user.profileImage && { profileImage: user.profileImage }),
      ...(user.interests && { interests: user.interests }),
      ...(user.storiesCount !== undefined && { storiesCount: user.storiesCount }),
      ...(user.recentStories && { recentStories: user.recentStories })
    }

    // Add private fields for self-requests or admin requests
    if (includePrivateFields) {
      summaryData.email = user.email
      summaryData.mobileNumber = user.mobileNumber
      summaryData.countryId = user.countryId
      summaryData.lastLogoutAt = user.lastLogoutAt
    }

    return summaryData
  }

  /**
   * Check if requested fields contain sensitive information
   */
  static containsSensitiveFields(fieldsParam) {
    const sensitiveFields = [
      'email', 'mobileNumber', 'newEmail', 'newMobileNumber',
      'passwordHash', 'updateToken', 'verifyCode', 'resetPasswordToken',
      'resetPasswordOTP', 'resetPasswordCode', 'emailConfirmToken',
      'deviceId', 'lastLogoutAt'
    ]
    
    const requestedFields = fieldsParam.split(',').map(f => f.trim())
    return requestedFields.some(field => sensitiveFields.includes(field))
  }

  /**
   * Audit successful user retrieval
   */
  static async auditUserRetrieval(ctx, user, logContext) {
    try {
      const auditData = {
        action: 'user_retrieval_success',
        targetUserId: user.id,
        requestedBy: ctx.currentUser?.id,
        format: ctx.query.format || 'full',
        fieldsRequested: ctx.query.fields || 'all',
        includesRequested: ctx.query.include || 'none',
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        timestamp: new Date(),
        requestId: ctx.requestId
      }

      logger.info('User retrieval audit - success', auditData)
      
    } catch (error) {
      logger.error('Failed to audit user retrieval', {
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
        action: 'user_retrieval_failure',
        targetUserId: ctx.params.id,
        requestedBy: ctx.currentUser?.id,
        error: error.message,
        errorCode: error.code,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        timestamp: new Date(),
        requestId: ctx.requestId
      }

      logger.warn('User retrieval audit - failure', auditData)
      
    } catch (auditError) {
      logger.error('Failed to audit retrieval failure', {
        ...logContext,
        auditError: auditError.message
      })
    }
  }
}

module.exports = GetUserByIdHandler
