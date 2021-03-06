const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const { emailClient } = require(__folders.handlers + '/RootProvider')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const { makeResetPasswordTokenHelper } = require(__folders.helpers).authHelpers
const ResetPasswordEmail = require(__folders.notifications + '/ResetPasswordEmail')

/**
 * 1) get email from body request
 * 2) find user in DB by email
 * 3) generate and store resetPasswordToken to DB
 * 4) send reset email
 */
class SendResetPasswordEmailHandler extends BaseHandler {
  static get accessTag () {
    return 'users:send-reset-password-email'
  }

  static get validationRules () {
    return {
      body: {
        email: new RequestRule(UserModel.schema.email, { required: true })
      }
    }
  }

  static async run (ctx) {
    const user = await UserDAO.getByEmail(ctx.body.email)
    const resetPasswordToken = await makeResetPasswordTokenHelper(user)
    await UserDAO.baseUpdate(user.id, { resetPasswordToken })

    await emailClient.send(new ResetPasswordEmail({ to: user.email, resetPasswordToken }))

    return this.result({ message: 'Reset password email delivered' })
  }
}

module.exports = SendResetPasswordEmailHandler
