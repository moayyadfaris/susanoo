const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const StoryModel = require('models/StoryModel')
const { getStoryService } = require('../../../../services')
const logger = require('../../../../util/logger')

/**
 * WebUpdateStoryHandler - Updates newsroom stories via StoryService.
 *
 * Features:
 * - Delegates all mutation logic (optimistic locking, permission checks, tag/attachment orchestration)
 *   to `StoryService.updateStory`.
 * - Accepts partial updates, enforces optional optimistic-locking through `expectedVersion`,
 *   and forwards contextual audit comments for downstream processing.
 * - Emits rich logs capturing actor, target resource, and mutated fields for observability.
 *
 * Usage:
 * - Endpoint: `PUT /api/v1/web/stories/:id`
 * - Access tag: `web#stories:update`
 * - Supply at least one mutable field in the JSON body; include `expectedVersion` to guard concurrent edits.
 */
class UpdateStoryHandler extends BaseHandler {
  static get accessTag() {
    return 'web#stories:update'
  }

  static get validationRules() {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true })
      },
      body: {
        title: new RequestRule(StoryModel.schema.title, { required: false }),
        details: new RequestRule(StoryModel.schema.details, { required: false }),
        toTime: new RequestRule(StoryModel.schema.toTime, { required: false }),
        fromTime: new RequestRule(StoryModel.schema.fromTime, { required: false }),
        tags: new RequestRule(StoryModel.schema.tags, { required: false }),
        attachments: new RequestRule(new Rule({
          validator: value => {
            if (value === undefined || value === null) return true
            if (!Array.isArray(value)) return 'attachments must be an array of positive integers'
            if (!value.length) return true
            const invalid = value.some(id => !Number.isInteger(id) || id <= 0)
            return invalid ? 'attachments must contain positive integers only' : true
          },
          description: 'Attachment identifiers to associate; provide an empty array to clear attachments'
        }), { required: false }),
        status: new RequestRule(StoryModel.schema.status, { required: false }),
        priority: new RequestRule(StoryModel.schema.priority, { required: false }),
        expectedVersion: new RequestRule(StoryModel.schema.version, { required: false }),
        metadata: new RequestRule(StoryModel.schema.metadata, { required: false }),
        location: new RequestRule(StoryModel.schema.location, { required: false }),
        type: new RequestRule(StoryModel.schema.type, { required: false }),
        parentId: new RequestRule(StoryModel.schema.parentId, { required: false }),
        isInEditMode: new RequestRule(StoryModel.schema.isInEditMode, { required: false }),
        auditComment: new RequestRule(new Rule({
          validator: value => {
            if (value === undefined || value === null) return true
            if (typeof value !== 'string') return 'auditComment must be a string'
            const trimmed = value.trim()
            if (!trimmed.length) return 'auditComment cannot be empty'
            if (trimmed.length > 240) return 'auditComment must be 240 characters or less'
            return true
          },
          description: 'Optional comment stored in audit logs for traceability'
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
        layer: 'WebUpdateStoryHandler.run'
      })
    }

    const { currentUser } = ctx
    if (!currentUser) {
      throw new ErrorWrapper({
        ...errorCodes.AUTHENTICATION,
        message: 'Authentication required',
        layer: 'WebUpdateStoryHandler.run'
      })
    }

    const logContext = {
      handler: 'WebUpdateStoryHandler',
      requestId: ctx.requestId,
      ip: ctx.ip,
      userId: currentUser.id,
      storyId: ctx.params.id
    }

    try {
      const storyId = Number.parseInt(ctx.params.id, 10)
      if (!ctx.body || typeof ctx.body !== 'object' || Array.isArray(ctx.body)) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION_FAILED,
          message: 'Request body must be a JSON object with fields to update',
          layer: 'WebUpdateStoryHandler.run'
        })
      }

      const updatePayload = { ...ctx.body }
      const updatableKeys = [
        'title',
        'details',
        'fromTime',
        'toTime',
        'tags',
        'attachments',
        'status',
        'priority',
        'expectedVersion',
        'metadata',
        'location',
        'type',
        'parentId',
        'isInEditMode'
      ]
      const contextualKeys = ['auditComment']

      const providedKeys = Object.keys(updatePayload || {})
      const hasUpdatableField = providedKeys.some(key => updatableKeys.includes(key))

      if (!hasUpdatableField) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION_FAILED,
          message: 'At least one updatable field must be provided in the request body',
          layer: 'WebUpdateStoryHandler.run'
        })
      }

      const auditContext = updatePayload.auditComment
      let sanitizedAuditComment
      if (auditContext !== undefined) {
        if (typeof auditContext === 'string') {
          sanitizedAuditComment = auditContext.trim()
        }
        delete updatePayload.auditComment
      }

      const updatedStory = await storyService.updateStory(storyId, updatePayload, {
        currentUser,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'] || ctx.headers?.['User-Agent'],
        auditComment: sanitizedAuditComment
      })

      logger.info('Web story updated', {
        ...logContext,
        status: updatedStory.status,
        version: updatedStory.version,
        fields: providedKeys.filter(key => !contextualKeys.includes(key))
      })

      return this.result({
        data: updatedStory,
        message: 'Story updated successfully.',
        meta: {
          version: updatedStory.version,
          expectedVersion: ctx.body?.expectedVersion
        }
      })
    } catch (error) {
      logger.error('Web story update failed', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Unable to update story',
        layer: 'WebUpdateStoryHandler.run',
        meta: {
          originalError: error.message
        }
      })
    }
  }
}

module.exports = UpdateStoryHandler
