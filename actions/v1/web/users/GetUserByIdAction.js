const { RequestRule } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')

/**
 * @description return user by id
 */
class GetUserByIdAction extends BaseAction {
  static get accessTag () {
    return 'web#users:get-by-id'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(UserModel.schema.id, { required: true })
      }
    }
  }

  static async run (ctx) {
    const model = await UserDAO.getUserById(ctx.params.id, '[profileImage,country]')
    return this.result({ data: model })
  }
}

module.exports = GetUserByIdAction
