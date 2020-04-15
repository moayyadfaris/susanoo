const { errorCodes, ErrorWrapper, RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const { jwtHelper } = require(__folders.helpers).authHelpers
const config = require(__folders.config)
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')

/**
 * 1) verify resetPasswordToken
 * 2) compare existing resetPasswordToken from DB and resetPasswordToken from request
 * 3) make hash from new password
 * 4) update user entity in DB with new hash, reset resetPasswordToken and refreshTokensMap
 */
class ConfirmResetPasswordTokenHandler extends BaseHandler {
  static get accessTag () {
    return 'web#users:confirm-reset-password'
  }

  static get validationRules () {
    return {
      body: {
        resetPasswordToken: new RequestRule(UserModel.schema.resetPasswordToken, { required: true })
      }
    }
  }

  static async run (ctx) {
    const tokenData = await jwtHelper.verify(ctx.body.resetPasswordToken, config.token.resetPassword.secret)
    const tokenUserId = tokenData.sub
    const user = await UserDAO.baseGetById(tokenUserId)

    if (user.resetPasswordToken !== ctx.body.resetPasswordToken) {
      throw new ErrorWrapper({ ...errorCodes.WRONG_RESET_PASSWORD_TOKEN })
    }
    return this.result({ message: 'Reset password valid' })
  }
}

module.exports = ConfirmResetPasswordTokenHandler
