const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const StoryModel = require('models/StoryModel')
const StoryAttachmentModel = require('models/StoryAttachmentModel')
const { getStoryService } = require('../../../../services')
const logger = require('../../../../util/logger')
const storyType = require('config').storyType

/**
 * WebCreateStoryHandler - Creates newsroom stories via StoryService.
 *
 * Features:
 * - Thin transport wrapper; all business logic (permission checks, rate limiting, duplicate detection)
 *   is handled by `StoryService.createStory`.
 * - Validates incoming payloads against the canonical model rules to keep contracts consistent.
 * - Automatically assigns the current user and defaults the story type/status for web submissions.
 *
 * Usage:
 * - Endpoint: `POST /api/v1/web/stories`
 * - Requires authentication and the `web#stories:create` access tag.
 * - Body fields: `title`, `details`, `fromTime`, `toTime`, optional `tags`, `attachments`, `type`, `priority`.
 */
class CreateStoryHandler extends BaseHandler {
  static get accessTag() {
    return 'web#stories:create'
  }

  static get validationRules() {
    return {
      body: {
        title: new RequestRule(StoryModel.schema.title, { required: true }),
        details: new RequestRule(StoryModel.schema.details, { required: true }),
        fromTime: new RequestRule(StoryModel.schema.fromTime, { required: false }),
        toTime: new RequestRule(StoryModel.schema.toTime, { required: false }),
        tags: new RequestRule(StoryModel.schema.tags, { required: false }),
        attachments: new RequestRule(StoryAttachmentModel.schema.attachmentIds, { required: false }),
        type: new RequestRule(new Rule({
          validator: value => {
            if (value === undefined || value === null) return true
            return Object.values(storyType).some(({ type }) => type === value) ||
              'Invalid story type supplied'
          },
          description: 'Story type enum; defaults to STORY if omitted'
        }), { required: false }),
        priority: new RequestRule(StoryModel.schema.priority, { required: false })
      }
    }
  }

  static async run(ctx) {
    const storyService = getStoryService()

    if (!storyService) {
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Story service not available',
        layer: 'WebCreateStoryHandler.run'
      })
    }

    const { currentUser } = ctx
    if (!currentUser) {
      throw new ErrorWrapper({
        ...errorCodes.AUTHENTICATION,
        message: 'Authentication required',
        layer: 'WebCreateStoryHandler.run'
      })
    }

    const logContext = {
      handler: 'WebCreateStoryHandler',
      requestId: ctx.requestId,
      ip: ctx.ip,
      userId: currentUser.id
    }

    try {
      const payload = {
        ...ctx.body,
        type: ctx.body.type || storyType.story.type
      }

      const createdStory = await storyService.createStory(payload, {
        currentUser,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'] || ctx.headers?.['User-Agent']
      })

      logger.info('Web story created', {
        ...logContext,
        storyId: createdStory.id,
        status: createdStory.status,
        type: createdStory.type
      })

      return this.result({
        data: createdStory,
        message: 'Story created successfully.'
      })
    } catch (error) {
      logger.error('Web story creation failed', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Unable to create story',
        layer: 'WebCreateStoryHandler.run',
        meta: {
          originalError: error.message
        }
      })
    }
  }
}

module.exports = CreateStoryHandler
