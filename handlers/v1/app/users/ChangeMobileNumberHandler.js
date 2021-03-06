const { errorCodes, ErrorWrapper, RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const { notificationClient } = require(__folders.handlers + '/RootProvider')
const { makeConfirmOTPHelper } = require(__folders.helpers).authHelpers
const { notificationType } = require(__folders.config)
class ChangeMobileNumberHandler extends BaseHandler {
  static get accessTag () {
    return 'users:change-mobile-number'
  }

  static get validationRules () {
    return {
      body: {
        newMobileNumber: new RequestRule(UserModel.schema.mobileNumber, { required: true }),
        newMobileCountryId: new RequestRule(UserModel.schema.mobileCountryId, { required: true })
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const { newMobileNumber, newMobileCountryId } = ctx.body

    const isExist = await UserDAO.isMobileNumberExist(newMobileNumber)
    if (isExist) throw new ErrorWrapper({ ...errorCodes.EMAIL_PHONE_ALREADY_TAKEN })

    let user = await UserDAO.baseUpdate(currentUser.id, { newMobileNumber, newMobileCountryId })
    const verifyCode = await makeConfirmOTPHelper(user.email)
    notificationClient.enqueue({ type: notificationType.changeMobileNumber, to: user.newMobileNumber, code: verifyCode, name: user.name })
    return this.result({ message: `User requested to change mobile number to ${newMobileNumber}!` })
  }
}

module.exports = ChangeMobileNumberHandler
