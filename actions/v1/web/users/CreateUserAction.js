const { RequestRule } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const { makePasswordHashHelper } = require(__folders.auth + '/')
class CreateUserAction extends BaseAction {
  static get accessTag () {
    return 'web#users:create'
  }

  static get validationRules () {
    return {
      body: {
        name: new RequestRule(UserModel.schema.name, { required: true }),
        email: new RequestRule(UserModel.schema.email, { required: true }),
        password: new RequestRule(UserModel.schema.passwordHash, { required: true }),
        profileImageId: new RequestRule(UserModel.schema.profileImageId)
      }
    }
  }

  static async run (ctx) {
    const hash = await makePasswordHashHelper(ctx.body.password)
    let user = await UserDAO.create({
      ...ctx.body,
      passwordHash: hash
    })
    return this.result({ data: user })
  }
}

module.exports = CreateUserAction
