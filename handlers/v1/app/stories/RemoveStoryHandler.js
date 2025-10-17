const { RequestRule, ErrorWrapper, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const StoryModel = require('models/StoryModel')
const { performance } = require('perf_hooks')
const { getStoryService } = require('services')

class RemoveStoryHandler extends BaseHandler {
  static get accessTag () {
    return 'stories:delete'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true })
      },
      query: {
        permanent: new RequestRule(new Rule({
          validator: v => this.validateBooleanLike(v, 'permanent'),
          description: 'Perform permanent deletion'
        }), { required: false }),
        reason: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length <= 500,
          description: 'Optional deletion reason (max 500 chars)'
        }), { required: false })
      }
    }
  }

  static async run (ctx) {
    const startTime = performance.now()
    const { currentUser, params, query } = ctx
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
      const result = await storyService.removeStory(storyId, query, {
        currentUser,
        requestId,
        ip: ctx.ip || ctx.req?.ip,
        userAgent: ctx.req?.get?.('User-Agent')
      })

      this.logStoryDeletion(ctx, { id: storyId }, performance.now() - startTime)

      return this.result({
        data: result,
        message: `Story ${storyId} was ${this.parseBoolean(query.permanent) ? 'permanently deleted' : 'removed'}`
      })

    } catch (error) {
      const processingTime = performance.now() - startTime

      this.logger.error('RemoveStoryHandler failed', {
        requestId,
        storyId,
        error: error.message,
        processingTime: `${processingTime.toFixed(2)}ms`,
        userId: currentUser?.id,
        permanent: query?.permanent,
        stack: error.stack
      })

      this.logStoryDeletion(ctx, null, processingTime, query, error.message)

      throw error
    }
  }

  static logStoryDeletion(ctx, story, processingTime, query = {}, error = null) {
    const logData = {
      handler: 'RemoveStoryHandler',
      processingTime: `${processingTime.toFixed(2)}ms`,
      userId: ctx.currentUser?.id,
      storyId: story?.id || ctx.params?.id,
      permanent: this.parseBoolean(query.permanent),
      success: !error,
      error
    }

    if (error) {
      this.logger.error('Story deletion failed', logData)
    } else {
      this.logger.info('Story deletion processed', logData)
    }
  }

  static parseBoolean(value) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.toLowerCase()
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true
      if (['false', '0', 'no', 'n'].includes(normalized)) return false
    }
    return false
  }

  static validateBooleanLike(value, name) {
    if (value === undefined || value === null || value === '') return true
    if (typeof value === 'boolean') return true
    if (typeof value === 'string' && ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'].includes(value.toLowerCase())) return true
    return `${name} must be a boolean value`
  }
}

module.exports = RemoveStoryHandler
