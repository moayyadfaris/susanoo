const { RequestRule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const StoryDAO = require('database/dao/StoryDAO')
const StoryModel = require('models/StoryModel')
const storyType = require('config').storyType
const TagDAO = require('database/dao/TagDAO')
const StoryAttachmentModel = require('models/StoryAttachmentModel')
const { getStoryAttachmentService } = require('services')

class CreateStoryHandler extends BaseHandler {
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
        attachments: new RequestRule(StoryAttachmentModel.schema.attachmentIds)
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
      const storyAttachmentService = getStoryAttachmentService()
      storyData.attachments = await storyAttachmentService.prepareAttachmentGraph(storyData.attachments)
    }
    storyData.status = storyStatus
    storyData.userId = currentUser.id
    storyData.type = storyType.story

    const data = await StoryDAO.create(storyData)
    return this.result({ data })
  }
}

module.exports = CreateStoryHandler
