const { RequestRule, Rule } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const { otpHelper } = require(__folders.auth + '/')
const { errorCodes, ErrorWrapper } = require('backend-core')
const config = require(__folders.config)

class ConfirmOTPAction extends BaseAction {
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

module.exports = ConfirmOTPAction
