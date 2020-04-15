const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const { notificationClient } = require(__folders.handlers + '/RootProvider')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const { makeConfirmOTPHelper } = require(__folders.helpers).authHelpers
const { ErrorWrapper, errorCodes } = require('backend-core')
const { jwtHelper } = require(__folders.helpers).authHelpers
const config = require(__folders.config)
const { notificationType } = require(__folders.config)
/**
 * 1) get email/mobile number from body request
 * 2) find user in DB by email
 * 3) generate and store verification to DB
 */
class SendVerifyOTPHandler extends BaseHandler {
  static get accessTag () {
    return 'users:send-verify-otp'
  }

  static get validationRules () {
    return {
      body: {
        mobileNumber: new RequestRule(UserModel.schema.mobileNumber, { required: true }),
        updateToken: new RequestRule(UserModel.schema.updateToken, { required: true })
      }
    }
  }

  static async run (ctx) {
    const tokenData = await jwtHelper.verify(ctx.body.updateToken, config.token.updateToken.secret)
    const tokenUserId = tokenData.sub
    const user = await UserDAO.baseGetById(tokenUserId)
    if (user.updateToken !== ctx.body.updateToken) {
      throw new ErrorWrapper({ ...errorCodes.WRONG_UPDATE_TOKEN })
    }
    const verifyCode = await makeConfirmOTPHelper(user.email)
    let updateDate = { verifyCode }
    if (user.mobileNumber !== ctx.body.mobileNumber) {
      updateDate.mobileNumber = ctx.body.mobileNumber
    }
    await UserDAO.baseUpdate(user.id, updateDate)
    // Enqueue job for notification
    notificationClient.enqueue({ type: notificationType.createUser, to: ctx.body.mobileNumber, code: verifyCode, name: user.name, email: user.email })

    return this.result({ message: 'Verify code delivered' })
  }
}

module.exports = SendVerifyOTPHandler
