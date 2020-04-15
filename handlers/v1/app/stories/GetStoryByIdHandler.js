const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const StoryModel = require(__folders.models + '/StoryModel')
const { ownerPolicy } = require(__folders.policy)
const storyType = require(__folders.config).storyType

class GetStoryByIdHandler extends BaseHandler {
  static get accessTag () {
    return 'stories:get-by-id'
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
    let relations = '[tags,attachments]'
    const model = await StoryDAO.getStoryDetails(req.params.id, relations)
    if (model.type !== storyType.story) {
      await ownerPolicy(model, currentUser)
    }
    return this.result({ data: model })
  }
}

module.exports = GetStoryByIdHandler
