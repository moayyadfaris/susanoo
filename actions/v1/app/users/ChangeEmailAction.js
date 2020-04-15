const { errorCodes, ErrorWrapper, RequestRule } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const { notificationClient } = require(__folders.actions + '/RootProvider')
const { makeConfirmOTPHelper } = require(__folders.helpers).authHelpers
const { notificationType } = require(__folders.config)
class ChangeEmailAction extends BaseAction {
  static get accessTag () {
    return 'users:change-email'
  }

  static get validationRules () {
    return {
      body: {
        newEmail: new RequestRule(UserModel.schema.email, { required: true })
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const { newEmail } = ctx.body

    const isExist = await UserDAO.isEmailExist(newEmail)
    if (isExist) throw new ErrorWrapper({ ...errorCodes.EMAIL_ALREADY_TAKEN })

    let user = await UserDAO.baseUpdate(currentUser.id, { newEmail })
    const verifyCode = await makeConfirmOTPHelper(user.email)
    notificationClient.enqueue({ type: notificationType.changeEmail, to: user.newEmail, code: verifyCode, name: user.name })
    return this.result({ message: `User requested change email to ${newEmail}!` })
  }
}

module.exports = ChangeEmailAction
