const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const StoryModel = require(__folders.models + '/StoryModel')
const { ownerPolicy } = require(__folders.policy)
const { ErrorWrapper, errorCodes } = require('backend-core')
const TagDAO = require(__folders.dao + '/TagDAO')
const StoryAttachmentModel = require(__folders.models + '/StoryAttachmentModel')
const StoryAttachmentDAO = require(__folders.dao + '/StoryAttachmentDAO')

class UpdateStoryHandler extends BaseHandler {
  static get accessTag () {
    return 'stories:update'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true })
      },
      body: {
        title: new RequestRule(StoryModel.schema.title, { required: true }),
        details: new RequestRule(StoryModel.schema.details, { required: true }),
        tags: new RequestRule(StoryModel.schema.tags, { required: true }),
        attachments: new RequestRule(StoryAttachmentModel.schema.attachmentsId)
      },
      notEmptyBody: true
    }
  }

  static async run (req) {
    const { currentUser } = req
    let model = await StoryDAO.baseGetById(+req.params.id)
    if (['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'FOR_REVIEW_SE'].includes(model.status)) {
      await ownerPolicy(model, currentUser)
      model = Object.assign(model, req.body)
      model.tags = await TagDAO.prepareStoryTagsInsertion(req.body.tags, currentUser.id)
      if (req.body.attachments) {
        model.attachments = await StoryAttachmentDAO.prepareAttachmentInsertion(req.body.attachments)
      } else {
        model.attachments = null
      }
      const data = await StoryDAO.update(model)
      return this.result({ data })
    }
    throw new ErrorWrapper({ ...errorCodes.INVALID_STORY_STATUS })
  }
}

module.exports = UpdateStoryHandler
