const BaseHandler = require('handlers/BaseHandler')
const { RequestRule } = require('backend-core')
const UserInterestDAO = require('database/dao/UserInterestDAO')
const UserInterestModel = require('models/UserInterestModel')

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

    await UserInterestDAO.patchInsert(currentUser.id, ctx.body.interests)

    return this.result({ message: 'Interests added successfully' })
  }
}

module.exports = AddUserInterestHandler
