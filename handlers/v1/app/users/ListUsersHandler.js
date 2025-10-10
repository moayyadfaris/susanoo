const { RequestRule, ErrorWrapper, errorCodes } = require('backend-core')
const joi = require('joi')

const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const { Rule } = require('backend-core')
const logger = require('util/logger')

/**
 * ListUsersHandler - Enhanced user listing with comprehensive filtering and optimization
 * 
 * Features:
 * - Advanced filtering (name, email, role, status, date ranges)
 * - Flexible sorting with multiple field support
 * - Field selection for optimized data transfer
 * - Search functionality across multiple fields
 * - Performance monitoring and caching considerations
 * - Comprehensive error handling and logging
 * - Security-focused data sanitization
 * 
 * API Usage Examples:
 * 
 * Basic listing:
 * GET /users?page=0&limit=20
 * 
 * Search users:
 * GET /users?search=john&limit=10
 * 
 * Filter by status:
 * GET /users?filter={"isActive":true,"isEmailConfirmed":true}
 * 
 * Filter by date range:
 * GET /users?filter={"createdAfter":"2024-01-01","createdBefore":"2024-12-31"}
 * 
 * Custom field selection:
 * GET /users?fields=id,firstName,lastName,email&include=profileImage
 * 
 * Complex query:
 * GET /users?search=dev&filter={"isActive":true}&orderByField=createdAt&orderByDirection=desc&include=profileImage,interests
 * 
 * @extends BaseHandler
 * @version 2.0.0
 */
class ListUsersHandler extends BaseHandler {
  /**
   * Access control tag for user listing
   */
  static get accessTag() {
    return 'users:list'
  }

  /**
   * Enhanced validation rules with comprehensive filtering options
   */
  static get validationRules() {
    return {
      query: {
        ...this.baseQueryParams,
        
        // Enhanced sorting options
        orderByField: new RequestRule(new Rule({
          validator: v => {
            const allowedFields = [
              'id', 'createdAt', 'updatedAt', 'firstName', 'lastName', 
              'email', 'username', 'isActive', 'isEmailConfirmed'
            ]
            const result = joi.string().valid(...allowedFields).validate(v)
            return result.error ? result.error.message : true
          },
          description: 'String; field to sort by; allowed: id, createdAt, updatedAt, firstName, lastName, email, username, isActive, isEmailConfirmed'
        }), { required: false }),
        
        orderByDirection: new RequestRule(new Rule({
          validator: v => {
            const result = joi.string().valid('asc', 'desc').validate(v)
            return result.error ? result.error.message : true
          },
          description: 'String; sort direction; asc or desc'
        }), { required: false }),

        // Advanced filtering options
        filter: new RequestRule(new Rule({
          validator: v => {
            if (typeof v === 'string') {
              try {
                v = JSON.parse(v)
              } catch (e) {
                return 'Invalid JSON format for filter'
              }
            }
            
            const filterSchema = joi.object({
              name: joi.string().min(1).max(100),
              firstName: joi.string().min(1).max(50),
              lastName: joi.string().min(1).max(50),
              email: joi.string().email(),
              username: joi.string().min(1).max(50),
              isActive: joi.boolean(),
              isEmailConfirmed: joi.boolean(),
              hasProfileImage: joi.boolean(),
              createdAfter: joi.date().iso(),
              createdBefore: joi.date().iso(),
              updatedAfter: joi.date().iso(),
              updatedBefore: joi.date().iso()
            }).unknown(false)
            
            const result = filterSchema.validate(v)
            return result.error ? result.error.message : true
          },
          description: 'Object; filtering options - name, firstName, lastName, email, username, isActive, isEmailConfirmed, hasProfileImage, createdAfter, createdBefore, updatedAfter, updatedBefore'
        }), { required: false }),

        // Search functionality
        search: new RequestRule(new Rule({
          validator: v => {
            const result = joi.string().min(1).max(100).validate(v)
            return result.error ? result.error.message : true
          },
          description: 'String; search term to match against name, email, username; min 1, max 100 characters'
        }), { required: false }),

        // Field selection for optimized responses
        fields: new RequestRule(new Rule({
          validator: v => {
            const allowedFields = [
              'id', 'firstName', 'lastName', 'email', 'username', 
              'isActive', 'isEmailConfirmed', 'createdAt', 'updatedAt',
              'profileImageId', 'profileImage'
            ]
            
            if (typeof v === 'string') {
              v = v.split(',').map(field => field.trim())
            }
            
            if (!Array.isArray(v)) {
              return 'Fields must be an array or comma-separated string'
            }
            
            const invalidFields = v.filter(field => !allowedFields.includes(field))
            if (invalidFields.length > 0) {
              return `Invalid fields: ${invalidFields.join(', ')}. Allowed: ${allowedFields.join(', ')}`
            }
            
            return true
          },
          description: 'Array or comma-separated string; fields to include in response'
        }), { required: false }),

        // Include relations
        include: new RequestRule(new Rule({
          validator: v => {
            const allowedIncludes = ['profileImage', 'interests', 'stories']
            
            if (typeof v === 'string') {
              v = v.split(',').map(inc => inc.trim())
            }
            
            if (!Array.isArray(v)) {
              return 'Include must be an array or comma-separated string'
            }
            
            const invalidIncludes = v.filter(inc => !allowedIncludes.includes(inc))
            if (invalidIncludes.length > 0) {
              return `Invalid includes: ${invalidIncludes.join(', ')}. Allowed: ${allowedIncludes.join(', ')}`
            }
            
            return true
          },
          description: 'Array or comma-separated string; relations to include - profileImage, interests, stories'
        }), { required: false })
      }
    }
  }

  /**
   * Enhanced user listing with comprehensive filtering and optimization
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
      logger.info('User list request initiated', {
        ...logContext,
        query: this.sanitizeLogQuery(ctx.query)
      })

      // Parse and prepare query parameters
      const queryParams = await this.prepareQueryParams(ctx.query, logContext)
      
      // Execute the enhanced DAO query
      const data = await UserDAO.getAdvancedList(queryParams)
      
      // Format and sanitize the response
      const formattedData = await this.formatResponse(data, queryParams, logContext)
      
      // Performance monitoring
      const duration = Date.now() - startTime
      logger.info('User list request completed', {
        ...logContext,
        duration,
        totalResults: data.total,
        returnedResults: data.results?.length || 0,
        queryComplexity: this.calculateQueryComplexity(queryParams)
      })

      return this.result({
        data: formattedData.results,
        meta: {
          pagination: {
            page: queryParams.page || 0,
            limit: queryParams.limit || 50,
            total: data.total,
            pages: Math.ceil(data.total / (queryParams.limit || 50))
          },
          query: {
            filters: queryParams.filter || {},
            search: queryParams.search || null,
            sort: {
              field: queryParams.orderByField || 'createdAt',
              direction: queryParams.orderByDirection || 'desc'
            }
          },
          performance: {
            duration,
            cacheHit: formattedData.cacheHit || false
          }
        },
        headers: {
          'X-Total-Count': data.total.toString(),
          'X-Page': (queryParams.page || 0).toString(),
          'X-Limit': (queryParams.limit || 50).toString(),
          'X-Performance': `${duration}ms`
        }
      })

    } catch (error) {
      const duration = Date.now() - startTime
      
      logger.error('User list request failed', {
        ...logContext,
        error: error.message,
        stack: error.stack,
        duration,
        query: this.sanitizeLogQuery(ctx.query)
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to retrieve user list',
        layer: 'ListUsersHandler.run',
        meta: {
          originalError: error.message,
          duration,
          queryParams: this.sanitizeLogQuery(ctx.query)
        }
      })
    }
  }

  /**
   * Prepare and validate query parameters
   */
  static async prepareQueryParams(query, logContext) {
    try {
      const params = { ...query }

      // Parse filter if it's a string
      if (typeof params.filter === 'string') {
        try {
          params.filter = JSON.parse(params.filter)
        } catch (e) {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'Invalid JSON format for filter parameter',
            layer: 'ListUsersHandler.prepareQueryParams'
          })
        }
      }

      // Parse fields if it's a string
      if (typeof params.fields === 'string') {
        params.fields = params.fields.split(',').map(field => field.trim()).filter(Boolean)
      }

      // Parse include if it's a string
      if (typeof params.include === 'string') {
        params.include = params.include.split(',').map(inc => inc.trim()).filter(Boolean)
      }

      // Set defaults
      params.page = parseInt(params.page) || 0
      params.limit = parseInt(params.limit) || 50
      params.orderByField = params.orderByField || 'createdAt'
      params.orderByDirection = params.orderByDirection || 'desc'

      // Validate date ranges in filter
      if (params.filter) {
        await this.validateDateRanges(params.filter)
      }

      logger.debug('Query parameters prepared', {
        ...logContext,
        preparedParams: this.sanitizeLogQuery(params)
      })

      return params

    } catch (error) {
      if (error instanceof ErrorWrapper) {
        throw error
      }
      
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Invalid query parameters',
        layer: 'ListUsersHandler.prepareQueryParams',
        meta: { originalError: error.message }
      })
    }
  }

  /**
   * Format response data with security considerations
   */
  static async formatResponse(data, params, logContext) {
    try {
      const formattedResults = await Promise.all(
        data.results.map(user => this.formatUserData(user, params))
      )

      return {
        results: formattedResults,
        cacheHit: false // TODO: Implement caching
      }

    } catch (error) {
      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to format response data',
        layer: 'ListUsersHandler.formatResponse',
        meta: { originalError: error.message }
      })
    }
  }

  /**
   * Format individual user data
   */
  static async formatUserData(user, params) {
    const formatted = { ...user }

    // Add computed fields
    if (user.firstName && user.lastName) {
      formatted.fullName = `${user.firstName} ${user.lastName}`.trim()
    }

    // Format profile image if included
    if (user.profileImage) {
      formatted.profileImage = {
        id: user.profileImage.id,
        url: user.profileImage.path ? `${process.env.S3_BASE_URL}${user.profileImage.path}` : null,
        originalName: user.profileImage.originalName,
        size: user.profileImage.size,
        mimeType: user.profileImage.mimeType
      }
    }

    // Remove sensitive fields
    delete formatted.password
    delete formatted.refreshTokensMap
    delete formatted.resetPasswordToken
    delete formatted.emailConfirmationToken

    return formatted
  }

  /**
   * Validate date ranges in filters
   */
  static async validateDateRanges(filters) {
    if (filters.createdAfter && filters.createdBefore) {
      if (new Date(filters.createdAfter) >= new Date(filters.createdBefore)) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'createdAfter must be before createdBefore',
          layer: 'ListUsersHandler.validateDateRanges'
        })
      }
    }

    if (filters.updatedAfter && filters.updatedBefore) {
      if (new Date(filters.updatedAfter) >= new Date(filters.updatedBefore)) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'updatedAfter must be before updatedBefore',
          layer: 'ListUsersHandler.validateDateRanges'
        })
      }
    }
  }

  /**
   * Calculate query complexity for monitoring
   */
  static calculateQueryComplexity(params) {
    let complexity = 1

    if (params.search) complexity += 2
    if (params.filter && Object.keys(params.filter).length > 0) {
      complexity += Object.keys(params.filter).length
    }
    if (params.include && params.include.length > 0) {
      complexity += params.include.length * 2
    }

    return complexity
  }

  /**
   * Sanitize query for logging (remove sensitive data)
   */
  static sanitizeLogQuery(query) {
    const sanitized = { ...query }
    
    // Remove any potentially sensitive filter values
    if (sanitized.filter && typeof sanitized.filter === 'object') {
      sanitized.filter = { ...sanitized.filter }
      if (sanitized.filter.email) {
        sanitized.filter.email = '[REDACTED]'
      }
    }
    
    return sanitized
  }
}

module.exports = ListUsersHandler
