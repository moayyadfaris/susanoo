const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const SessionDAO = require(__folders.dao + '/SessionDAO')
const { checkPasswordHelper, makePasswordHashHelper } = require(__folders.helpers).authHelpers

class ChangePasswordHandler extends BaseHandler {
  static get accessTag () {
    return 'web#users:change-password'
  }

  static get validationRules () {
    return {
      body: {
        oldPassword: new RequestRule(UserModel.schema.passwordHash, { required: true }),
        newPassword: new RequestRule(UserModel.schema.passwordHash, { required: true })
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const userModel = await UserDAO.baseGetById(currentUser.id)
    await checkPasswordHelper(ctx.body.oldPassword, userModel.passwordHash)
    const newHash = await makePasswordHashHelper(ctx.body.newPassword)

    await Promise.all([
      SessionDAO.baseRemoveWhere({ userId: currentUser.id }), // Changing password will remove all logged in sessions.
      UserDAO.baseUpdate(currentUser.id, { passwordHash: newHash })
    ])

    return this.result({ message: 'Password changed' })
  }
}

module.exports = ChangePasswordHandler
