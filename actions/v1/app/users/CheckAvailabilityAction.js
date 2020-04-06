const { errorCodes, ErrorWrapper, RequestRule } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')

class CheckAvailabilityAction extends BaseAction {
  static get accessTag () {
    return 'users:check-phone-email'
  }

  static get validationRules () {
    return {
      body: {
        email_or_mobile_number: new RequestRule(UserModel.schema.emailOrMobileNumber, { required: true })
      }
    }
  }

  static async run (ctx) {
    const emailOrMobileNumber = ctx.body.email_or_mobile_number

    const isExist = await UserDAO.getByEmailOrMobileNumber(emailOrMobileNumber, false)
    if (isExist) throw new ErrorWrapper({ ...errorCodes.EMAIL_PHONE_ALREADY_TAKEN })

    return this.result({ message: 'Email or phone number is available' })
  }
}

module.exports = CheckAvailabilityAction
