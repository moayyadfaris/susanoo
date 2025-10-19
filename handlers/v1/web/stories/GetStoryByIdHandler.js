const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const StoryModel = require('models/StoryModel')
const { getStoryService } = require('../../../../services')
const logger = require('../../../../util/logger')
const roles = require('config').roles

/**
 * WebGetStoryByIdHandler - Fetches a single story for the newsroom portal.
 *
 * Features:
 * - Leverages `StoryService.getStoryById` to centralize permissions, caching, and record shaping.
 * - Validates the path parameter (`id`) using the canonical model rule.
 * - Supports optional `include` query parameter for relations (`tags`, `attachments`, etc.).
 *
 * Usage:
 * - Endpoint: `GET /api/v1/web/stories/:id`
 * - Access: `web#stories:get-by-id`
 * - Query Params: `include` (comma separated or array), `includeDeleted` (admin only)
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
            const allowed = ['tags', 'owner', 'country', 'attachments', 'categories', 'editor', 'stats']
            if (typeof value === 'string') {
              return value.split(',').every(item => allowed.includes(item.trim()))
            }
            if (Array.isArray(value)) {
              return value.every(item => allowed.includes(item))
            }
            return 'include must be a string or array'
          },
          description: 'Additional relations to include'
        }), { required: false }),
        includeDeleted: new RequestRule(new Rule({
          validator: value => ['true', 'false', true, false].includes(value),
          description: 'Allow viewing soft-deleted stories (admin only)'
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
      const query = { ...ctx.query }
      if (query.includeDeleted && ![roles.admin, roles.superadmin].includes(currentUser.role)) {
        delete query.includeDeleted
      }

      const story = await storyService.getStoryById(Number(ctx.params.id), query, {
        currentUser,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'] || ctx.headers?.['User-Agent']
      })

      logger.info('Web story retrieved', {
        ...logContext,
        status: story?.status,
        type: story?.type
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
}

module.exports = GetStoryByIdHandler
