const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const StoryModel = require(__folders.models + '/StoryModel')
const TagDAO = require(__folders.dao + '/TagDAO')
const StoryAttachmentDAO = require(__folders.dao + '/StoryAttachmentDAO')
const StoryAttachmentModel = require(__folders.models + '/StoryAttachmentModel')
const { ErrorWrapper, errorCodes } = require('backend-core')

class UpdateStoryHandler extends BaseHandler {
  static get accessTag () {
    return 'web#stories:update'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true })
      },
      body: {
        title: new RequestRule(StoryModel.schema.title, { required: true }),
        details: new RequestRule(StoryModel.schema.details, { required: true }),
        toTime: new RequestRule(StoryModel.schema.toTime, { required: true }),
        fromTime: new RequestRule(StoryModel.schema.fromTime, { required: true }),
        tags: new RequestRule(StoryModel.schema.tags, { required: true }),
        attachments: new RequestRule(StoryAttachmentModel.schema.attachmentsId),
        status: new RequestRule(StoryModel.schema.status, { required: true })
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const model = await StoryDAO.baseGetById(ctx.params.id)
    if (model.status === 'DELETED') {
      throw new ErrorWrapper({ ...errorCodes.INVALID_STORY_STATUS })
    }
    let storyData = Object.assign(model, ctx.body)
    if (storyData.tags) {
      const preparedTags = await TagDAO.prepareStoryTagsInsertion(storyData.tags, currentUser.id)
      storyData.tags = preparedTags
    }
    if (storyData.attachments) {
      storyData.attachments = await StoryAttachmentDAO.prepareAttachmentInsertion(storyData.attachments)
    }

    const data = await StoryDAO.update(storyData)
    return this.result({ data })
  }
}

module.exports = UpdateStoryHandler
