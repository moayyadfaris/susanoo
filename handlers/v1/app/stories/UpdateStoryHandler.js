const { RequestRule, ErrorWrapper } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const StoryModel = require('models/StoryModel')
const { performance } = require('perf_hooks')
const { getStoryService } = require('services')

class UpdateStoryHandler extends BaseHandler {
  static get accessTag () {
    return 'stories:update'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true })
      },
      body: {
        title: new RequestRule(StoryModel.schema.title, { required: false }),
        details: new RequestRule(StoryModel.schema.details, { required: false }),
        type: new RequestRule(StoryModel.schema.type, { required: false }),
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
        isInEditMode: new RequestRule(StoryModel.schema.isInEditMode, { required: false }),
        expectedVersion: new RequestRule(StoryModel.schema.version, { required: false })
      },
      notEmptyBody: true
    }
  }

  static async run (ctx) {
    const startTime = performance.now()
    const { currentUser, params, body } = ctx
    const storyId = parseInt(params.id, 10)
    const requestId = ctx.requestMetadata?.id || `req_${Date.now()}`

    if (Number.isNaN(storyId) || storyId <= 0) {
      throw new ErrorWrapper({
        code: 'INVALID_STORY_ID',
        message: 'Invalid story ID provided',
        statusCode: 400
      })
    }

    try {
      const storyService = getStoryService()
      const updatedStory = await storyService.updateStory(storyId, body, {
        currentUser,
        requestId,
        ip: ctx.ip || ctx.req?.ip,
        userAgent: ctx.req?.get?.('User-Agent')
      })

      this.logStoryUpdate(ctx, { id: storyId }, updatedStory, performance.now() - startTime)

      return this.result({
        data: updatedStory,
        message: 'Story updated successfully'
      })

    } catch (error) {
      const processingTime = performance.now() - startTime

      this.logger.error('UpdateStoryHandler failed', {
        requestId,
        storyId,
        error: error.message,
        processingTime: `${processingTime.toFixed(2)}ms`,
        userId: currentUser?.id,
        updateData: JSON.stringify(body, null, 2),
        stack: error.stack
      })

      this.logStoryUpdate(ctx, null, null, processingTime, error.message)

      throw error
    }
  }

  static logStoryUpdate(ctx, beforeStory, afterStory, processingTime, error = null) {
    const logData = {
      handler: 'UpdateStoryHandler',
      processingTime: `${processingTime.toFixed(2)}ms`,
      userId: ctx.currentUser?.id,
      storyId: afterStory?.id || beforeStory?.id || ctx.params?.id,
      fromStatus: beforeStory?.status,
      toStatus: afterStory?.status,
      success: !error,
      error
    }

    if (error) {
      this.logger.error('Story update failed', logData)
    } else {
      this.logger.info('Story updated successfully', logData)
    }
  }
}

module.exports = UpdateStoryHandler
