const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const StoryModel = require(__folders.models + '/StoryModel')
const { isOwnerPolicy } = require(__folders.policies)
const { ErrorWrapper, errorCodes } = require('backend-core')

class RemoveStoryHandler extends BaseHandler {
  static get accessTag () {
    return 'stories:delete'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true })
      }
    }
  }

  static async run (req) {
    const { currentUser } = req
    const model = await StoryDAO.baseGetById(+req.params.id)
    await isOwnerPolicy(model, currentUser)
    if (model.status !== 'DRAFT') {
      throw new ErrorWrapper({ ...errorCodes.INVALID_STORY_STATUS })
    }
    await StoryDAO.baseUpdate(model.id, { 'status': 'DELETED' })

    return this.result({ message: `${req.params.id} was removed` })
  }
}

module.exports = RemoveStoryHandler
