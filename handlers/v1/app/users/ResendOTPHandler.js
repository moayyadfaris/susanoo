const { RequestRule, Rule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const { notificationClient } = require(__folders.handlers + '/RootProvider')
const UserDAO = require(__folders.dao + '/UserDAO')
const { makeConfirmOTPHelper } = require(__folders.helpers).authHelpers
const { notificationType } = require(__folders.config)
class ResendOTPHandler extends BaseHandler {
  static get accessTag () {
    return 'users:resend-otp'
  }

  static get validationRules () {
    return {
      body: {
        type: new RequestRule(new Rule({
          validator: v => (typeof v === 'string') && ['EMAIL', 'MOBILE_NUMBER'].includes(v),
          description: 'string; EMAIL, MOBILE_NUMBER'
        }), { required: true })
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const user = await UserDAO.baseGetById(currentUser.id)
    const verifyCode = await makeConfirmOTPHelper(user.email)

    if (ctx.body.type === 'EMAIL') {
      notificationClient.enqueue({ type: notificationType.changeEmail, to: user.newEmail, code: verifyCode, name: user.name })
    } else {
      notificationClient.enqueue({ type: notificationType.changeMobileNumber, to: user.newMobileNumber, code: verifyCode, name: user.name })
    }
    return this.result({ message: 'OTP code sent' })
  }
}

module.exports = ResendOTPHandler
