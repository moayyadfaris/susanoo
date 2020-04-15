const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const { notificationClient } = require(__folders.handlers + '/RootProvider')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const { makeResetPasswordOTPHelper } = require(__folders.helpers).authHelpers
const { ErrorWrapper, errorCodes } = require('backend-core')
const { notificationType } = require(__folders.config)
/**
 * 1) get email from body request
 * 2) find user in DB by email
 * 3) generate and store resetPasswordToken to DB
 * 4) send reset email
 */
class SendResetPasswordOTPHandler extends BaseHandler {
  static get accessTag () {
    return 'users:send-reset-password-otp'
  }

  static get validationRules () {
    return {
      body: {
        email_or_mobile_number: new RequestRule(UserModel.schema.emailOrMobileNumber, { required: true })
      }
    }
  }

  static async run (ctx) {
    let user = await UserDAO.getByEmailOrMobileNumber(ctx.body.email_or_mobile_number)
    // not verified
    if (!user.isVerified) {
      throw new ErrorWrapper({ ...errorCodes.NOT_VERIFIED_RESET_PASSWORD })
    }
    const resetPasswordCode = await makeResetPasswordOTPHelper(user.email)
    await UserDAO.baseUpdate(user.id, { resetPasswordCode })
    if (ctx.body.email_or_mobile_number.includes('@')) {
      // Enqueue email job for notification
      notificationClient.enqueue({ type: notificationType.resetPasswordEmail, to: user.email, code: resetPasswordCode, name: user.name, lang: user.preferredLanguage })
    } else {
      // Enqueue SMS job for notification
      notificationClient.enqueue({ type: notificationType.resetPasswordSMS, to: user.mobileNumber, code: resetPasswordCode, name: user.name })
    }

    return this.result({ message: 'Reset password otp delivered' })
  }
}

module.exports = SendResetPasswordOTPHandler
