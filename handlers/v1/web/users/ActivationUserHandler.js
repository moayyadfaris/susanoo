const { RequestRule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const UserModel = require('models/UserModel')

class ActivationUserHandler extends BaseHandler {
  static get accessTag () {
    return 'web#users:activation'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(UserModel.schema.id)
      },
      body: {
        isActive: new RequestRule(UserModel.schema.isActive, { required: true })
      }
    }
  }

  static async run (ctx) {
    const { isActive } = ctx.body
    const data = await UserDAO.baseUpdate(ctx.params.id, { isActive })
    return this.result({ data })
  }
}

module.exports = ActivationUserHandler
