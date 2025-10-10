const BaseHandler = require('handlers/BaseHandler')
const { RequestRule } = require('backend-core')
const StoryDAO = require('database/dao/StoryDAO')
const StoryModel = require('models/StoryModel')
const AttachmentModel = require('models/AttachmentModel')
const StoryAttachmentDAO = require('database/dao/StoryAttachmentDAO')
const { isOwnerPolicy } = require('acl/policies')

class RemoveStoryAttachmentHandler extends BaseHandler {
  static get accessTag () {
    return 'stories:attachments:remove'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true }),
        itemId: new RequestRule(AttachmentModel.schema.id, { required: true })
      }
    }
  }

  static async run (req) {
    const { currentUser } = req
    const story = await StoryDAO.baseGetById(+req.params.id)
    await isOwnerPolicy(story, currentUser)
    await StoryAttachmentDAO.baseRemoveWhere({ 'attachmentId': +req.params.itemId, 'storyId': story.id })

    return this.result({ message: `${req.params.itemId} was removed` })
  }
}

module.exports = RemoveStoryAttachmentHandler
