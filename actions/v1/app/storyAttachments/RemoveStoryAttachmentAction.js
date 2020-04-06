const BaseAction = require(__folders.actions + '/BaseAction')
const { RequestRule } = require('backend-core')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const StoryModel = require(__folders.models + '/StoryModel')
const AttachmentModel = require(__folders.models + '/AttachmentModel')
const StoryAttachmentDAO = require(__folders.dao + '/StoryAttachmentDAO')
const { isOwnerPolicy } = require(__folders.policy)

class RemoveStoryAttachmentAction extends BaseAction {
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

module.exports = RemoveStoryAttachmentAction
