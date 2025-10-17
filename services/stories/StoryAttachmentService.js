const BaseService = require('../BaseService')
const StoryAttachmentDAO = require('../../database/dao/StoryAttachmentDAO')
const AttachmentDAO = require('../../database/dao/AttachmentDAO')
const StoryDAO = require('../../database/dao/StoryDAO')
const StoryAttachmentModel = require('../../models/StoryAttachmentModel')
const { ErrorWrapper, errorCodes } = require('backend-core')

class StoryAttachmentService extends BaseService {
  constructor(options = {}) {
    super(options)
    this.registerDependency('storyAttachmentDAO', options.storyAttachmentDAO || StoryAttachmentDAO)
    this.registerDependency('attachmentDAO', options.attachmentDAO || AttachmentDAO)
    this.registerDependency('storyDAO', options.storyDAO || StoryDAO)
  }

  async prepareAttachmentGraph(attachmentIds = [], { transaction } = {}) {
    return this.executeOperation('prepareAttachmentGraph', async () => {
      if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
        return []
      }

      const normalizedIds = await this.validateAttachmentIds(attachmentIds, { transaction })
      const storyAttachmentDAO = this.getDependency('storyAttachmentDAO')
      return storyAttachmentDAO.prepareAttachmentInsertion(normalizedIds)
    }, { attachmentIds })
  }

  async validateAttachmentIds(attachmentIds = [], { transaction } = {}) {
    const normalizedIds = attachmentIds.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)
    if (normalizedIds.length !== attachmentIds.length) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION_FAILED,
        message: 'Attachment IDs must be positive integers'
      })
    }

    const attachmentDAO = this.getDependency('attachmentDAO')
    const existing = await attachmentDAO.query(transaction).whereIn('id', normalizedIds)
    if (existing.length !== attachmentIds.length) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION_FAILED,
        message: 'One or more attachment IDs are invalid'
      })
    }
    return normalizedIds
  }

  async removeStoryAttachment(storyId, attachmentId, context = {}) {
    return this.executeOperation('removeStoryAttachment', async () => {
      let story = context.story
      if (!story) {
        const storyDAO = this.getDependency('storyDAO')
        story = await storyDAO.baseGetById(Number(storyId))
      }
      if (!story) {
        throw new ErrorWrapper({ ...errorCodes.NOT_FOUND, message: 'Story not found' })
      }

      const storyAttachmentDAO = this.getDependency('storyAttachmentDAO')
      const removed = await storyAttachmentDAO.removeAttachment(storyId, attachmentId)
      if (removed === 0) {
        throw new ErrorWrapper({ ...errorCodes.NOT_FOUND, message: 'Attachment not linked to story' })
      }

      return {
        storyId: Number(storyId),
        attachmentId: Number(attachmentId),
        removed: true,
        updatedBy: context.userId || null
      }
    }, { storyId, attachmentId, userId: context.userId })
  }

  async assignStoryAttachment(storyId, attachmentId, context = {}) {
    return this.executeOperation('assignStoryAttachment', async () => {
      const normalizedIds = await this.validateAttachmentIds([attachmentId])
      const normalizedAttachmentId = normalizedIds[0]

      let story = context.story
      if (!story) {
        const storyDAO = this.getDependency('storyDAO')
        story = await storyDAO.baseGetById(Number(storyId))
      }

      if (!story) {
        throw new ErrorWrapper({ ...errorCodes.NOT_FOUND, message: 'Story not found' })
      }

      const storyDAO = this.getDependency('storyDAO')
      const alreadyLinked = await storyDAO.relatedQuery('attachments')
        .for(Number(storyId))
        .where('attachments.id', normalizedAttachmentId)
        .first()

      if (alreadyLinked) {
        return {
          storyId: Number(storyId),
          attachmentId: normalizedAttachmentId,
          assigned: false,
          reason: 'Attachment already linked to story'
        }
      }

      await storyDAO.relatedQuery('attachments')
        .for(Number(storyId))
        .relate(normalizedAttachmentId)

      return {
        storyId: Number(storyId),
        attachmentId: normalizedAttachmentId,
        assigned: true,
        updatedBy: context.userId || null
      }
    }, { storyId, attachmentId, userId: context.userId })
  }
}

module.exports = StoryAttachmentService
