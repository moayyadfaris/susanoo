const { RequestRule, ErrorWrapper, errorCodes } = require('backend-core')
const joi = require('joi')

const BaseHandler = require('handlers/BaseHandler')
const { Rule } = require('backend-core')
const { getUserService } = require('../../../../services')
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
    try {
      const userService = getUserService()
      if (!userService) {
        throw new ErrorWrapper({
          ...errorCodes.INTERNAL_SERVER_ERROR,
          message: 'User service not available',
          layer: 'ListUsersHandler.run'
        })
      }

      const result = await userService.listUsers({
        query: ctx.query,
        currentUser: ctx.currentUser,
        requestId: ctx.requestId,
        ip: ctx.ip,
        headers: ctx.headers
      })

      return this.result(result)
    } catch (error) {
      logger.error('User list request failed', {
        requestId: ctx.requestId,
        userId: ctx.currentUser?.id,
        error: error.message,
        stack: error.stack
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
          queryParams: ctx.query
        }
      })
    }
  }
}

module.exports = ListUsersHandler
