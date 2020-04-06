const { RequestRule } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const AuthModel = require(__folders.models + '/AuthModel')
const { otpHelper } = require(__folders.auth + '/')
const { errorCodes, ErrorWrapper } = require('backend-core')
const addSession = require(__folders.actionsV1 + '/common/addSession')
const SessionEntity = require(__folders.actionsV1 + '/common/SessionEntity')
const { makeAccessTokenHelper } = require(__folders.auth)
const config = require(__folders.config)
class ConfirmRegistrationOTPAction extends BaseAction {
  static get accessTag () {
    return 'users:confirm-otp'
  }

  static get validationRules () {
    return {
      body: {
        code: new RequestRule(UserModel.schema.confirmRegisterCode, { required: true }),
        email: new RequestRule(UserModel.schema.email, { required: true }),
        fingerprint: new RequestRule(AuthModel.schema.fingerprint, { required: true })
      }
    }
  }

  static async run (ctx) {
    let options = {
      digits: config.otp.digits
    }
    const isValid = await otpHelper.verify(ctx.body.code, ctx.body.email, options)
    // const userId = tokenData.sub

    const user = await UserDAO.getByEmail(ctx.body.email)
    if (user.isVerified) {
      throw new ErrorWrapper({ ...errorCodes.EMAIL_ALREADY_CONFIRMED })
    }
    if (!isValid) {
      throw new ErrorWrapper({ ...errorCodes.WRONG_OTP_CONFIRM_TOKEN })
    }
    // const newEmail = user.newEmail
    // if (user.emailConfirmToken !== ctx.body.emailConfirmToken) {
    //   throw new ErrorWrapper({ ...errorCodes.WRONG_EMAIL_CONFIRM_TOKEN })
    // }
    await UserDAO.baseUpdate(user.id, {
      isVerified: true,
      verifyCode: null,
      updateToken: null
    })

    const newSession = new SessionEntity({
      userId: user.id,
      ip: ctx.ip,
      ua: ctx.headers['User-Agent'],
      fingerprint: ctx.body.fingerprint
    })

    await addSession(newSession)

    return this.result({
      data: {
        userId: user.id,
        accessToken: await makeAccessTokenHelper(user),
        refreshToken: newSession.refreshToken,
        confirmed: true
      }
    })
  }
}

module.exports = ConfirmRegistrationOTPAction
