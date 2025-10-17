const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule } = require('backend-core')
const { performance } = require('perf_hooks')
const { getStoryService } = require('services')
const StoryModel = require('models/StoryModel')

class GetStoryByIdHandler extends BaseHandler {
  static get accessTag () {
    return 'stories:get-by-id'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true })
      },
      query: {
        includeDeleted: new RequestRule(new Rule({
          validator: v => this.validateBooleanLike(v, 'includeDeleted'),
          description: 'Include deleted stories'
        }), { required: false }),
        includePrivate: new RequestRule(new Rule({
          validator: v => this.validateBooleanLike(v, 'includePrivate'),
          description: 'Include private stories'
        }), { required: false }),
        includeMetadata: new RequestRule(new Rule({
          validator: v => this.validateBooleanLike(v, 'includeMetadata'),
          description: 'Include metadata for super admins'
        }), { required: false }),
        include: new RequestRule(new Rule({
          validator: v => this.validateIncludes(v, ['tags', 'owner', 'country', 'attachments', 'editor']),
          description: 'Additional relations to include'
        }), { required: false }),
        format: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && ['full', 'summary', 'minimal'].includes(v),
          description: 'Response format: full, summary, minimal'
        }), { required: false })
      }
    }
  }

  static async run (ctx) {
    const startTime = performance.now()
    const { currentUser, params, query } = ctx
    const storyId = parseInt(params.id, 10)
    const requestId = ctx.requestMetadata?.id || `req_${Date.now()}`

    try {
      if (Number.isNaN(storyId) || storyId <= 0) {
        return this.result({
          success: false,
          status: 400,
          message: 'Invalid story ID provided'
        })
      }

      const storyService = getStoryService()
      const story = await storyService.getStoryById(storyId, query, {
        currentUser,
        requestId,
        ip: ctx.ip || ctx.req?.ip,
        userAgent: ctx.req?.get?.('User-Agent')
      })

      this.logStoryRetrieval(ctx, story, performance.now() - startTime)

      return this.result({
        data: story,
        message: 'Story retrieved successfully'
      })

    } catch (error) {
      const processingTime = performance.now() - startTime

      this.logger.error('GetStoryByIdHandler failed', {
        requestId,
        storyId,
        error: error.message,
        processingTime: `${processingTime.toFixed(2)}ms`,
        userId: currentUser?.id,
        stack: error.stack
      })

      this.logStoryRetrieval(ctx, null, processingTime, error.message)

      throw error
    }
  }

  static logStoryRetrieval(ctx, story, processingTime, error = null) {
    const logData = {
      handler: 'GetStoryByIdHandler',
      processingTime: `${processingTime.toFixed(2)}ms`,
      userId: ctx.currentUser?.id,
      ip: ctx.ip || ctx.req?.ip,
      userAgent: ctx.req?.get?.('User-Agent'),
      storyId: story?.id || ctx.params?.id,
      storyTitle: story?.title,
      storyType: story?.type,
      storyStatus: story?.status,
      format: ctx.query?.format || 'full',
      success: !error,
      error
    }

    if (error) {
      this.logger.error('Story retrieval failed', logData)
    } else {
      this.logger.info('Story retrieved successfully', logData)
    }
  }

  static validateBooleanLike(value, name) {
    if (value === undefined || value === null || value === '') return true
    if (typeof value === 'boolean') return true
    if (typeof value === 'string' && ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'].includes(value.toLowerCase())) return true
    return `${name} must be a boolean value`
  }

  static validateIncludes(value, allowed) {
    if (value === undefined || value === null || value === '') return true
    const includes = Array.isArray(value) ? value : value.toString().split(',').map(v => v.trim())
    return includes.every(inc => allowed.includes(inc)) || 'Invalid include value'
  }
}

module.exports = GetStoryByIdHandler
