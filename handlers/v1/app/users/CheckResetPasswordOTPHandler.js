const { errorCodes, ErrorWrapper, RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const { otpHelper, makeResetPasswordTokenHelper } = require(__folders.helpers).authHelpers
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const config = require(__folders.config)
/**
 * 1) verify resetPasswordToken
 * 2) compare existing resetPasswordToken from DB and resetPasswordToken from request
 * 3) make hash from new password
 * 4) update user entity in DB with new hash, reset resetPasswordToken and refreshTokensMap
 */
class CheckResetPasswordOTPHandler extends BaseHandler {
  static get accessTag () {
    return 'users:check-reset-password-otp'
  }

  static get validationRules () {
    return {
      body: {
        email_or_mobile_number: new RequestRule(UserModel.schema.emailOrMobileNumber, { required: true }),
        code: new RequestRule(UserModel.schema.resetPasswordCode, { required: true })
      }
    }
  }

  static async run (ctx) {
    const user = await UserDAO.getByEmailOrMobileNumber(ctx.body.email_or_mobile_number)
    let options = {
      digits: config.otp.digits
    }
    const isValid = await otpHelper.verify(ctx.body.code, user.email, options)

    if (!isValid) {
      throw new ErrorWrapper({ ...errorCodes.WRONG_RESET_PASSWORD_OTP })
    }

    const resetPasswordToken = await makeResetPasswordTokenHelper(user)

    await UserDAO.baseUpdate(user.id, { resetPasswordToken, resetPasswordOTP: '' })

    return this.result({
      data: {
        setPasswordToken: resetPasswordToken
      },
      message: 'Check reset OTP process was successfully applied'
    })
  }
}

module.exports = CheckResetPasswordOTPHandler
