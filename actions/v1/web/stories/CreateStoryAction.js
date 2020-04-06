const { RequestRule } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const StoryModel = require(__folders.models + '/StoryModel')
const storyType = require(__folders.config).storyType
const TagDAO = require(__folders.dao + '/TagDAO')
const StoryAttachmentDAO = require(__folders.dao + '/StoryAttachmentDAO')
const StoryAttachmentModel = require(__folders.models + '/StoryAttachmentModel')

class CreateStoryAction extends BaseAction {
  static get accessTag () {
    return 'web#stories:create'
  }

  static get validationRules () {
    return {
      body: {
        title: new RequestRule(StoryModel.schema.title, { required: true }),
        details: new RequestRule(StoryModel.schema.details, { required: true }),
        fromTime: new RequestRule(StoryModel.schema.fromTime, { required: true }),
        toTime: new RequestRule(StoryModel.schema.toTime, { required: true }),
        tags: new RequestRule(StoryModel.schema.tags, { required: true }),
        attachments: new RequestRule(StoryAttachmentModel.schema.attachmentsId)
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const storyData = ctx.body
    let storyStatus = ''
    if (storyData.tags) {
      // Prepare tags before graph insert
      const preparedTags = await TagDAO.prepareStoryTagsInsertion(storyData.tags, currentUser.id)
      storyData.tags = preparedTags
    }
    if (storyData.attachments) {
      storyData.attachments = await StoryAttachmentDAO.prepareAttachmentInsertion(storyData.attachments)
    }
    storyData.status = storyStatus
    storyData.userId = currentUser.id
    storyData.type = storyType.story

    const data = await StoryDAO.create(storyData)
    return this.result({ data })
  }
}

module.exports = CreateStoryAction
