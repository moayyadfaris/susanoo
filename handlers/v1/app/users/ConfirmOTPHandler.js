const { RequestRule, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const UserModel = require('models/UserModel')
const { otpHelper } = require('helpers').authHelpers
const { errorCodes, ErrorWrapper } = require('backend-core')
const config = require('config')

class ConfirmOTPHandler extends BaseHandler {
  static get accessTag () {
    return 'users:current-confirm-otp'
  }

  static get validationRules () {
    return {
      body: {
        code: new RequestRule(UserModel.schema.confirmRegisterCode, { required: true }),
        type: new RequestRule(new Rule({
          validator: v => (typeof v === 'string') && ['EMAIL', 'MOBILE_NUMBER'].includes(v),
          description: 'string; EMAIL, MOBILE_NUMBER'
        }), { required: true })
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    let options = {
      digits: config.otp.digits
    }
    const user = await UserDAO.baseGetById(currentUser.id)
    const isValid = await otpHelper.verify(ctx.body.code, user.email, options)

    if (!isValid) {
      throw new ErrorWrapper({ ...errorCodes.WRONG_OTP_CONFIRM_TOKEN })
    }

    if (ctx.body.type === 'EMAIL') {
      await UserDAO.baseUpdate(user.id, {
        newEmail: null,
        email: user.newEmail
      })
    }

    if (ctx.body.type === 'MOBILE_NUMBER') {
      await UserDAO.baseUpdate(user.id, {
        mobileNumber: user.newMobileNumber,
        mobileCountryId: user.newMobileCountryId,
        newMobileNumber: null,
        newMobileCountryId: null
      })
    }

    return this.result({
      message: 'OTP confirmed!'
    })
  }
}

module.exports = ConfirmOTPHandler
