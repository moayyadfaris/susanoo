const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const TagDAO = require(__folders.dao + '/TagDAO')
const StoryAttachmentDAO = require(__folders.dao + '/StoryAttachmentDAO')
const StoryModel = require(__folders.models + '/StoryModel')
const StoryAttachmentModel = require(__folders.models + '/StoryAttachmentModel')

class CreateStoryHandler extends BaseHandler {
  static get accessTag () {
    return 'stories:create'
  }

  static get validationRules () {
    return {
      body: {
        title: new RequestRule(StoryModel.schema.title, { required: true }),
        details: new RequestRule(StoryModel.schema.details, { required: true }),
        status: new RequestRule(StoryModel.schema.status, { required: true }),
        type: new RequestRule(StoryModel.schema.type, { required: true }),
        tags: new RequestRule(StoryModel.schema.tags, { required: true }),
        attachments: new RequestRule(StoryAttachmentModel.schema.attachmentsId)
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const storyData = ctx.body
    // Prepare tags before graph insert
    const preparedTags = await TagDAO.prepareStoryTagsInsertion(storyData.tags, currentUser.id)
    storyData.tags = preparedTags

    // Set UserId
    storyData.userId = currentUser.id

    // Prepare attachments before graph insert
    if (storyData.attachments) {
      storyData.attachments = await StoryAttachmentDAO.prepareAttachmentInsertion(storyData.attachments)
    }
    const data = await StoryDAO.create(storyData)
    return this.result({ data })
  }
}

module.exports = CreateStoryHandler
