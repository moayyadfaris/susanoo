const { RequestRule } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const { makeResetPasswordTokenHelper } = require(__folders.auth + '/')
const { notificationType } = require(__folders.config)
const { notificationClient } = require(__folders.actions + '/RootProvider')
/**
 * 1) get email from body request
 * 2) find user in DB by email
 * 3) generate and store resetPasswordToken to DB
 * 4) send reset email
 */
class SendResetPasswordTokenAction extends BaseAction {
  static get accessTag () {
    return 'web#users:send-reset-password-token'
  }

  static get validationRules () {
    return {
      body: {
        email: new RequestRule(UserModel.schema.email, { required: true })
      }
    }
  }

  static async run (ctx) {
    let user = await UserDAO.getByEmail(ctx.body.email)
    const resetPasswordToken = await makeResetPasswordTokenHelper(user)
    await UserDAO.baseUpdate(user.id, { resetPasswordToken })
    notificationClient.enqueue({ type: notificationType.resetPasswordEmailAdmin, to: user.email, token: resetPasswordToken, name: user.name })
    return this.result({
      data: {
        resetPasswordToken: resetPasswordToken
      }
    })
  }
}

module.exports = SendResetPasswordTokenAction
