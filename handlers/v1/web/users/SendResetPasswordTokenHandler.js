const { RequestRule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const UserModel = require('models/UserModel')
const { makeResetPasswordTokenHelper } = require('helpers').authHelpers
const { notificationType } = require('config')
const { notificationClient } = require('handlers/RootProvider')
/**
 * 1) get email from body request
 * 2) find user in DB by email
 * 3) generate and store resetPasswordToken to DB
 * 4) send reset email
 */
class SendResetPasswordTokenHandler extends BaseHandler {
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

module.exports = SendResetPasswordTokenHandler
