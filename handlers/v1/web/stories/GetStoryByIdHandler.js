const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const StoryModel = require(__folders.models + '/StoryModel')

class GetStoryByIdHandler extends BaseHandler {
  static get accessTag () {
    return 'web#stories:get-by-id'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(StoryModel.schema.id, { required: true })
      }
    }
  }

  static async run (req) {
    let relations = '[attachments,owner]'
    // TODO check if the editor is assigned to this story
    const model = await StoryDAO.getStoryDetails(req.params.id, relations)
    return this.result({ data: model })
  }
}

module.exports = GetStoryByIdHandler
