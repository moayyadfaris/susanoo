const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')

class UpdateUserHandler extends BaseHandler {
  static get accessTag () {
    return 'web#users:update'
  }

  static get validationRules () {
    return {
      body: {
        name: new RequestRule(UserModel.schema.name)
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const data = await UserDAO.baseUpdate(currentUser.id, ctx.body)
    return this.result({ data })
  }
}

module.exports = UpdateUserHandler
