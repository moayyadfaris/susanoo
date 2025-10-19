const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const StoryModel = require('models/StoryModel')
const { getStoryService } = require('../../../../services')
const logger = require('../../../../util/logger')
const roles = require('config').roles

const ALLOWED_RELATIONS = ['tags', 'owner', 'country', 'attachments', 'categories', 'editor', 'stats']
const FORMAT_MODES = ['full', 'summary', 'minimal']

/**
 * WebGetStoryByIdHandler - Fetches newsroom stories with rich projection support.
 *
 * Features:
 * - Delegates retrieval, permission checks, and shaping to `StoryService.getStoryById`.
 * - Normalizes include lists, boolean-like query strings, and validates projection modes.
 * - Allows privileged callers to request extended metadata or deleted stories (with guard rails).
 *
 * Usage:
 * - Endpoint: `GET /api/v1/web/stories/:id`
 * - Access tag: `web#stories:get-by-id`
 * - Query params:
 *   - `include`: comma string or array (tags, owner, country, attachments, categories, editor, stats)
 *   - `format`: `full` | `summary` | `minimal`
 *   - `includeDeleted`: boolean (admins & superadmins)
 *   - `includeMetadata`: boolean (superadmins only)
 *   - `includePrivate`: boolean (owner or superadmin)
 */
class GetStoryByIdHandler extends BaseHandler {
  static get accessTag() {
    return 'web#stories:get-by-id'
  }

  static get validationRules() {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true })
      },
      query: {
        include: new RequestRule(new Rule({
          validator: value => {
            if (typeof value === 'string') {
              return value.split(',').every(item => ALLOWED_RELATIONS.includes(item.trim()))
            }
            if (Array.isArray(value)) {
              return value.every(item => ALLOWED_RELATIONS.includes(item))
            }
            return 'include must be a string or array'
          },
          description: 'Additional relations to include'
        }), { required: false }),
        includeDeleted: new RequestRule(new Rule({
          validator: value => ['true', 'false', '1', '0', 'yes', 'no', true, false].includes(
            typeof value === 'string' ? value.toLowerCase() : value
          ),
          description: 'Allow viewing soft-deleted stories (admin only)'
        }), { required: false }),
        includeMetadata: new RequestRule(new Rule({
          validator: value => ['true', 'false', '1', '0', 'yes', 'no', true, false].includes(
            typeof value === 'string' ? value.toLowerCase() : value
          ),
          description: 'Expose metadata/audit details (superadmin only)'
        }), { required: false }),
        includePrivate: new RequestRule(new Rule({
          validator: value => ['true', 'false', '1', '0', 'yes', 'no', true, false].includes(
            typeof value === 'string' ? value.toLowerCase() : value
          ),
          description: 'Request access to private stories (subject to ownership)'
        }), { required: false }),
        format: new RequestRule(new Rule({
          validator: value => {
            if (value === undefined) return true
            if (typeof value !== 'string') return 'format must be a string'
            return FORMAT_MODES.includes(value.toLowerCase()) || `format must be one of: ${FORMAT_MODES.join(', ')}`
          },
          description: 'Projection mode: full (default), summary, or minimal'
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
        layer: 'WebGetStoryByIdHandler.run'
      })
    }

    const { currentUser } = ctx
    if (!currentUser) {
      throw new ErrorWrapper({
        ...errorCodes.AUTHENTICATION,
        message: 'Authentication required',
        layer: 'WebGetStoryByIdHandler.run'
      })
    }

    const logContext = {
      handler: 'WebGetStoryByIdHandler',
      requestId: ctx.requestId,
      ip: ctx.ip,
      userId: currentUser.id,
      storyId: ctx.params.id
    }

    try {
      const storyId = Number.parseInt(ctx.params.id, 10)
      const query = this.normalizeQuery(ctx.query)

      if (query.includeDeleted && ![roles.admin, roles.superadmin].includes(currentUser.role)) {
        query.includeDeleted = false
      }

      if (query.includeMetadata && currentUser.role !== roles.superadmin) {
        query.includeMetadata = false
      }

      if (query.include) {
        query.include = query.include.filter((relation, index, list) => relation && list.indexOf(relation) === index)
      }

      if (!FORMAT_MODES.includes(query.format || 'full')) {
        query.format = 'full'
      }

      const story = await storyService.getStoryById(storyId, query, {
        currentUser,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'] || ctx.headers?.['User-Agent']
      })

      logger.info('Web story retrieved', {
        ...logContext,
        status: story?.status,
        type: story?.type,
        format: query.format,
        include: query.include
      })

      return this.result({
        data: story
      })
    } catch (error) {
      logger.error('Web story retrieval failed', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Unable to fetch story',
        layer: 'WebGetStoryByIdHandler.run',
        meta: {
          originalError: error.message
        }
      })
    }
  }

  static normalizeQuery(rawQuery = {}) {
    const sanitized = { ...rawQuery }

    if (sanitized.include) {
      if (typeof sanitized.include === 'string') {
        sanitized.include = sanitized.include
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
      } else if (!Array.isArray(sanitized.include)) {
        delete sanitized.include
      }
    }

    sanitized.includeDeleted = this.parseBoolean(sanitized.includeDeleted)
    sanitized.includeMetadata = this.parseBoolean(sanitized.includeMetadata)
    sanitized.includePrivate = this.parseBoolean(sanitized.includePrivate)

    if (typeof sanitized.format === 'string') {
      sanitized.format = sanitized.format.toLowerCase()
    }

    return sanitized
  }

  static parseBoolean(value) {
    if (value === undefined || value === null) return undefined
    if (typeof value === 'boolean') return value
    const normalized = value.toString().toLowerCase()
    if (['true', '1', 'yes'].includes(normalized)) return true
    if (['false', '0', 'no'].includes(normalized)) return false
    return undefined
  }
}

module.exports = GetStoryByIdHandler
