const ms = require('ms')
const { RequestRule, ErrorWrapper, errorCodes } = require('backend-core')
const addSession = require(__folders.actionsV1 + '/common/addSession')
const SessionEntity = require(__folders.actionsV1 + '/common/SessionEntity')
const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')
const CountryDAO = require(__folders.dao + '/CountryDAO')
const AuthModel = require(__folders.models + '/AuthModel')
const { checkPasswordHelper, makeAccessTokenHelper, makeUpdateTokenHelper } = require(__folders.helpers).authHelpers
const config = require(__folders.config)

class LoginAction extends BaseAction {
  static get accessTag () {
    return 'auth:login'
  }

  static get validationRules () {
    return {
      body: {
        password: new RequestRule(AuthModel.schema.password, { required: true }),
        email_or_mobile_number: new RequestRule(AuthModel.schema.emailOrMobileNumber, { required: true }),
        fingerprint: new RequestRule(AuthModel.schema.fingerprint, { required: true })
      }
    }
  }

  static async run (ctx) {
    const refTokenExpiresInMilliseconds = new Date().getTime() + ms(config.token.refresh.expiresIn)
    // const refTokenExpiresInSeconds = parseInt(refTokenExpiresInMilliseconds / 1000)

    let user = await UserDAO.getByEmailOrMobileNumber(ctx.body.email_or_mobile_number)
    try {
      await checkPasswordHelper(ctx.body.password, user.passwordHash)
    } catch (e) {
      // throw new ErrorWrapper({ ...errorCodes.INVALID_CREDENTIALS })
      if ([errorCodes.NOT_FOUND.code, errorCodes.INVALID_PASSWORD.code].includes(e.code)) {
        throw new ErrorWrapper({ ...errorCodes.INVALID_CREDENTIALS })
      }
      throw e
    }

    if (!user.isVerified) {
      // throw new ErrorWrapper({ ...errorCodes.NOT_VERIFIED })
      const updateToken = await makeUpdateTokenHelper(user)
      user = await UserDAO.baseUpdate(user.id, { updateToken })
      const county = await CountryDAO.getCountryById(user.mobileCountryId)
      return this.result({
        data: {
          mobileNumber: {
            msisdn: user.mobileNumber,
            countryCode: county.phonecode,
            iso: county.iso,
            countryId: user.mobileCountryId
          },
          userId: user.id,
          email: user.email,
          updateToken: updateToken
        }
      })
    }
    const newSession = new SessionEntity({
      userId: user.id,
      ip: ctx.ip,
      ua: ctx.headers['User-Agent'],
      fingerprint: ctx.body.fingerprint,
      expiresIn: refTokenExpiresInMilliseconds
    })

    const sessionData = await addSession(newSession)
    user.sessionId = sessionData.id

    return this.result({
      data: {
        userId: user.id,
        accessToken: await makeAccessTokenHelper(user),
        refreshToken: newSession.refreshToken
      }
    })
  }
}

module.exports = LoginAction
