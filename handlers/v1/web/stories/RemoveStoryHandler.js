const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const StoryModel = require('models/StoryModel')
const { getStoryService } = require('../../../../services')
const logger = require('../../../../util/logger')

/**
 * WebRemoveStoryHandler - Removes newsroom stories through StoryService orchestration.
 *
 * Features:
 * - Delegates soft/permanent deletion flows to `StoryService.removeStory`, which enforces ownership, status, and dependency rules.
 * - Supports optional `permanent` and `reason` query params to drive audit-friendly deletion behaviour.
 * - Produces consistent log entries, structured API responses, and propagates domain errors verbatim.
 *
 * Usage:
 * - Endpoint: `DELETE /api/v1/web/stories/:id`
 * - Access tag: `web#stories:delete`
 */
class RemoveStoryHandler extends BaseHandler {
  static get accessTag() {
    return 'web#stories:delete'
  }

  static get validationRules() {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true })
      },
      query: {
        permanent: new RequestRule(new Rule({
          validator: value => {
            if (value === undefined) return true
            if (typeof value === 'boolean') return true

            if (typeof value === 'string') {
              const normalized = value.toLowerCase()
              if (['true', 'false', '1', '0', 'yes', 'no'].includes(normalized)) {
                return true
              }
            }

            return 'permanent must be a boolean-like value (true/false)'
          },
          description: 'Set to true for irreversible deletion. Only superadmins are allowed.'
        }), { required: false }),
        reason: new RequestRule(new Rule({
          validator: value => {
            if (value === undefined || value === null) return true
            if (typeof value !== 'string') return 'reason must be a string'
            const trimmed = value.trim()
            if (!trimmed.length) return 'reason cannot be empty'
            if (trimmed.length < 5) return 'reason must be at least 5 characters'
            if (trimmed.length > 240) return 'reason must be 240 characters or less'
            return true
          },
          description: 'Optional explanation stored with soft deletions (required for published stories).'
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
        layer: 'WebRemoveStoryHandler.run'
      })
    }

    const { currentUser } = ctx
    if (!currentUser) {
      throw new ErrorWrapper({
        ...errorCodes.AUTHENTICATION,
        message: 'Authentication required',
        layer: 'WebRemoveStoryHandler.run'
      })
    }

    const logContext = {
      handler: 'WebRemoveStoryHandler',
      requestId: ctx.requestId,
      ip: ctx.ip,
      userId: currentUser.id,
      storyId: ctx.params.id
    }

    try {
      const storyId = Number.parseInt(ctx.params.id, 10)
      const deletionResult = await storyService.removeStory(storyId, { ...ctx.query }, {
        currentUser,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'] || ctx.headers?.['User-Agent']
      })

      logger.info('Web story removed', {
        ...logContext,
        deletionType: deletionResult.deletionType,
        canRecover: deletionResult.canRecover
      })

      return this.result({
        data: deletionResult,
        message: `Story ${storyId} removed (${deletionResult.deletionType}).`
      })
    } catch (error) {
      logger.error('Web story deletion failed', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Unable to remove story',
        layer: 'WebRemoveStoryHandler.run',
        meta: {
          originalError: error.message
        }
      })
    }
  }
}

module.exports = RemoveStoryHandler
