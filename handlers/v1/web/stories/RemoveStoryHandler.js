const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const StoryModel = require(__folders.models + '/StoryModel')
const { ErrorWrapper, errorCodes } = require('backend-core')
const storyType = require(__folders.config).storyType

class RemoveStoryHandler extends BaseHandler {
  static get accessTag () {
    return 'web#stories:delete'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true })
      }
    }
  }

  static async run (req) {
    const model = await StoryDAO.baseGetById(req.params.id)
    if (model.type !== storyType.story || model.status === 'DELETED') {
      throw new ErrorWrapper({ ...errorCodes.UNPROCESSABLE_ENTITY })
    }
    await StoryDAO.baseUpdate(model.id, { 'status': 'DELETED' })
    return this.result({ message: `${req.params.id} was removed` })
  }
}

module.exports = RemoveStoryHandler
