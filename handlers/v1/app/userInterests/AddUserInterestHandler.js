const BaseHandler = require('handlers/BaseHandler')
const { RequestRule } = require('backend-core')
const UserInterestModel = require('models/UserInterestModel')
const { getUserInterestService } = require('services')

class AddUserInterestHandler extends BaseHandler {
  static get accessTag () {
    return 'user:interests:add'
  }

  static get validationRules () {
    return {
      body: {
        interests: new RequestRule(UserInterestModel.schema.interests, { required: true })
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const service = getUserInterestService()
    const outcome = await service.setUserInterests(ctx.body.interests, { currentUser })
    return this.result({ message: 'Interests updated successfully', data: outcome })
  }
}

module.exports = AddUserInterestHandler
