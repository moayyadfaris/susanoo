const { RequestRule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const StoryModel = require('models/StoryModel')
const { performance } = require('perf_hooks')
const { getStoryService } = require('services')

/**
 * CreateStoryHandler
 *
 * - Transport-only orchestration: delegates business logic to StoryService.
 * - Handles request validation, auth context, and response shaping.
 * - Logs request lifecycle, captures performance metrics, and surfaces service errors.
 *
 * ### How to use the API
 * - **Endpoint:** `POST /api/v1/stories`
 * - **Required fields:** `title`, `details`, `type`
 * - **Optional fields:** `status`, `priority`, `countryId`, `tags`, `attachments`, `location`, `metadata`, `scheduledAt`, `isInEditMode`
 * - **Authentication:** Bearer token required (user must have `stories:create` access)
 * - **Behaviour:** The service enforces rate limits, duplicate detection, validation, and relationship wiring (tags/attachments).
 * - **Response:** Returns sanitized story data with contextual metadata upon success.
 *
 * This handler intentionally avoids duplicating business rules. Any change to creation workflows should occur in StoryService so all consumers remain consistent.
 */
class CreateStoryHandler extends BaseHandler {
  static get accessTag () {
    return 'stories:create'
  }

  static get validationRules () {
    return {
      body: {
        title: new RequestRule(StoryModel.schema.title, { required: true }),
        details: new RequestRule(StoryModel.schema.details, { required: true }),
        type: new RequestRule(StoryModel.schema.type, { required: true }),
        status: new RequestRule(StoryModel.schema.status, { required: false }),
        priority: new RequestRule(StoryModel.schema.priority, { required: false }),
        countryId: new RequestRule(StoryModel.schema.countryId, { required: false }),
        parentId: new RequestRule(StoryModel.schema.parentId, { required: false }),
        fromTime: new RequestRule(StoryModel.schema.fromTime, { required: false }),
        toTime: new RequestRule(StoryModel.schema.toTime, { required: false }),
        tags: new RequestRule(StoryModel.schema.tags, { required: false }),
        attachments: new RequestRule(StoryModel.schema.attachments, { required: false }),
        location: new RequestRule(StoryModel.schema.location, { required: false }),
        metadata: new RequestRule(StoryModel.schema.metadata, { required: false }),
        scheduledAt: new RequestRule(StoryModel.schema.fromTime, { required: false }),
        isInEditMode: new RequestRule(StoryModel.schema.isInEditMode, { required: false })
      }
    }
  }

  static async run (ctx) {
    const startTime = performance.now()
    const { currentUser, body } = ctx
    const requestId = ctx.requestMetadata?.id || `req_${Date.now()}`

    try {
      const storyService = getStoryService()
      const createdStory = await storyService.createStory(body, {
        currentUser,
        requestId,
        ip: ctx.ip || ctx.req?.ip,
        userAgent: ctx.req?.get?.('User-Agent')
      })

      this.logStoryCreation(ctx, createdStory, performance.now() - startTime)

      return this.result({
        data: createdStory,
        message: 'Story created successfully'
      })

    } catch (error) {
      const processingTime = performance.now() - startTime

      this.logger.error('CreateStoryHandler failed', {
        requestId,
        error: error.message,
        processingTime: `${processingTime.toFixed(2)}ms`,
        userId: currentUser?.id,
        storyData: JSON.stringify(body, null, 2),
        stack: error.stack
      })

      this.logStoryCreation(ctx, null, processingTime, error.message)

      throw error
    }
  }

  static logStoryCreation(ctx, story, processingTime, error = null) {
    const logData = {
      handler: 'CreateStoryHandler',
      processingTime: `${processingTime.toFixed(2)}ms`,
      userId: ctx.currentUser?.id,
      ip: ctx.ip || ctx.req?.ip,
      userAgent: ctx.req?.get?.('User-Agent'),
      storyId: story?.id,
      storyTitle: story?.title,
      storyType: story?.type,
      storyStatus: story?.status,
      success: !error,
      error
    }

    if (error) {
      this.logger.error('Story creation failed', logData)
    } else {
      this.logger.info('Story created successfully', logData)
    }
  }
}

module.exports = CreateStoryHandler
