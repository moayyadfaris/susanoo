const BaseHandler = require('handlers/BaseHandler')
const { RequestRule } = require('backend-core')
const StoryModel = require('models/StoryModel')
const StoryAttachmentModel = require('models/StoryAttachmentModel')
const { ownerPolicy } = require('acl/policies')
const { getStoryService, getStoryAttachmentService } = require('services')

/**
 * Usage: DELETE /api/v1/stories/{storyId}/attachments/{attachmentId}
 */
class RemoveStoryAttachmentHandler extends BaseHandler {
  static get accessTag() {
    return 'stories:attachments:remove'
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

    const result = await storyAttachmentService.removeStoryAttachment(req.params.id, req.params.itemId, {
      userId: currentUser?.id,
      story
    })

    return this.success(result, 'Attachment removed from story')
  }
}

module.exports = RemoveStoryAttachmentHandler
