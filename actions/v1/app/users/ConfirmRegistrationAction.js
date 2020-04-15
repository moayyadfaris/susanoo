const { RequestRule, errorCodes, ErrorWrapper } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const UserModel = require(__folders.models + '/UserModel')
const UserDAO = require(__folders.dao + '/UserDAO')
const { jwtHelper } = require(__folders.helpers).authHelpers
const config = require(__folders.config)
const logger = require(__folders.util + '/logger')

class ConfirmRegistrationAction extends BaseAction {
  static get accessTag () {
    return 'users:confirm-registration'
  }

  static get validationRules () {
    return {
      body: {
        emailConfirmToken: new RequestRule(UserModel.schema.emailConfirmToken, { required: true })
      }
    }
  }

  static async run (ctx) {
    const tokenData = await jwtHelper.verify(ctx.body.emailConfirmToken, config.token.emailConfirm.secret)
    const { sub: userId } = tokenData

    const user = await UserDAO.baseGetById(userId)
    if (user.emailConfirmToken !== ctx.body.emailConfirmToken) {
      throw new ErrorWrapper({ ...errorCodes.WRONG_EMAIL_CONFIRM_TOKEN })
    }

    await UserDAO.baseUpdate(userId, { isConfirmedRegistration: true, emailConfirmToken: null })
    logger.info('User registration is confirmed', { userId, ctx: this.name })

    return this.result({ message: `User ${userId} registration is confirmed` })
  }
}

module.exports = ConfirmRegistrationAction
