const BaseHandler = require('handlers/BaseHandler')
const { RequestRule } = require('backend-core')
const StoryModel = require('models/StoryModel')
const StoryAttachmentModel = require('models/StoryAttachmentModel')
const { ownerPolicy } = require('acl/policies')
const { getStoryService, getStoryAttachmentService } = require('services')

/**
 * Usage: POST /api/v1/stories/{storyId}/attachments/{attachmentId}
 */
class LinkStoryAttachmentHandler extends BaseHandler {
  static get accessTag() {
    return 'stories:attachments:assign'
  }

  static get validationRules() {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true }),
        itemId: new RequestRule(StoryAttachmentModel.schema.attachmentId, { required: true })
      }
    }
  }

  static async run(req) {
    const { currentUser } = req
    const storyService = getStoryService()
    const storyAttachmentService = getStoryAttachmentService()

    const story = await storyService.getStoryById(Number(req.params.id), {}, { currentUser })
    await ownerPolicy(story, currentUser)

    const result = await storyAttachmentService.assignStoryAttachment(req.params.id, req.params.itemId, {
      userId: currentUser?.id,
      story
    })

    const message = result.assigned
      ? 'Attachment linked to story'
      : (result.reason || 'Attachment already linked to story')

    return this.success(result, message)
  }
}

module.exports = LinkStoryAttachmentHandler
