const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const StoryModel = require('models/StoryModel')
const { getStoryService } = require('../../../../services')
const logger = require('../../../../util/logger')
const storyType = require('config').storyType
const roles = require('config').roles

/**
 * WebListStoriesHandler - Lists stories from the perspective of the newsroom portal.
 *
 * Features:
 * - Delegates all heavy lifting (permissions, filtering, caching, data shaping) to `StoryService.listStories`.
 * - Applies role-aware scoping: editors only see their own stories, while admins/superadmins see all stories.
 * - Validates and documents supported query parameters (status, type, pagination, ordering, search).
 * - Returns structured pagination metadata (`meta.pagination`) and exposes total counts via response headers.
 *
 * Usage:
 * - **Endpoint:** `GET /api/v1/web/stories`
 * - **Authentication:** Required. Caller must hold the `web#stories:list` access tag.
 * - **Roles:** Editors receive only their submissions; Admins/Superadmins receive the full dataset.
 * - **Common query params:** `status`, `type`, `countryId`, `term`, `page`, `limit`, `orderBy`, `include`.
 */
class ListStoriesHandler extends BaseHandler {
  static get accessTag() {
    return 'web#stories:list'
  }

  static get validationRules() {
    const ORDERABLE_FIELDS = ['id', 'createdAt', 'updatedAt', 'toTime']
    const STORY_TYPES = Object.values(storyType).map(({ type }) => type)
    const INCLUDE_RELATIONS = ['tags', 'owner', 'country', 'attachments', 'categories', 'editor', 'stats']

    return {
      query: {
        ...this.baseQueryParams,
        orderBy: new RequestRule(new Rule({
          validator: value => {
            if (typeof value === 'string') {
              const [field, direction] = value.split(':')
              if (!ORDERABLE_FIELDS.includes(field)) {
                return `orderBy field must be one of: ${ORDERABLE_FIELDS.join(', ')}`
              }
              if (!['asc', 'desc'].includes(direction)) {
                return 'orderBy direction must be \"asc\" or \"desc\"'
              }
              return true
            }

            if (value && typeof value === 'object') {
              const { field, direction } = value
              if (!ORDERABLE_FIELDS.includes(field)) {
                return `orderBy.field must be one of: ${ORDERABLE_FIELDS.join(', ')}`
              }
              if (!['asc', 'desc'].includes(direction)) {
                return 'orderBy.direction must be \"asc\" or \"desc\"'
              }
              return true
            }

            return 'orderBy must be a string \"field:direction\" or object { field, direction }'
          },
          description: 'Sort as \"field:direction\" or { field, direction }'
        }), { required: false }),
        status: new RequestRule(StoryModel.schema.status, { required: false }),
        type: new RequestRule(new Rule({
          validator: value => {
            if (typeof value === 'string') return STORY_TYPES.includes(value)
            if (Array.isArray(value)) return value.every(item => STORY_TYPES.includes(item))
            return 'Type must be a string or array of strings'
          },
          description: 'Story type filter. Accepts single value or array.'
        }), { required: false }),
        term: new RequestRule(new Rule({
          validator: term => {
            if (typeof term !== 'string') return 'Search term must be a string'
            const trimmed = term.trim()
            if (trimmed.length < 2 || trimmed.length > 100) {
              return 'Search term must be between 2 and 100 characters'
            }
            return true
          },
          description: 'Free-text search term'
        }), { required: false }),
        include: new RequestRule(new Rule({
          validator: value => {
            if (typeof value === 'string') {
              return value.split(',').every(item => INCLUDE_RELATIONS.includes(item.trim()))
            }
            if (Array.isArray(value)) {
              return value.every(item => INCLUDE_RELATIONS.includes(item))
            }
            return 'Include must be a string or array'
          },
          description: 'Comma separated or array of relations to include'
        }), { required: false })
      }
    }
  }

  static async run(ctx) {
    const storyService = getStoryService()

    if (!storyService) {
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Story service not available',
        layer: 'WebListStoriesHandler.run'
      })
    }

    const { currentUser } = ctx
    if (!currentUser) {
      throw new ErrorWrapper({
        ...errorCodes.AUTHENTICATION,
        message: 'Authentication required',
        layer: 'WebListStoriesHandler.run'
      })
    }

    const logContext = {
      handler: 'WebListStoriesHandler',
      requestId: ctx.requestId,
      ip: ctx.ip,
      userId: currentUser.id,
      role: currentUser.role
    }

    try {
      const query = { ...ctx.query }
      if (currentUser.role === roles.admin || currentUser.role === roles.superadmin) {
        query.includeAll = true
      }

      const serviceResult = await storyService.listStories(query, {
        currentUser,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'] || ctx.headers?.['User-Agent']
      })

      logger.info('Web stories fetched', {
        ...logContext,
        resultCount: serviceResult?.data?.length || 0,
        cached: serviceResult?.meta?.cached
      })

      return this.result({
        data: serviceResult.data,
        headers: serviceResult.headers,
        meta: {
          ...serviceResult.meta,
          pagination: serviceResult.pagination
        }
      })
    } catch (error) {
      logger.error('Web stories listing failed', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Unable to fetch stories',
        layer: 'WebListStoriesHandler.run',
        meta: {
          originalError: error.message
        }
      })
    }
  }
}

module.exports = ListStoriesHandler
