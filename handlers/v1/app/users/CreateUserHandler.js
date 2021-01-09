const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const { notificationClient } = require(__folders.handlers + '/RootProvider')
const UserDAO = require(__folders.dao + '/UserDAO')
const CountryDAO = require(__folders.dao + '/CountryDAO')
const UserModel = require(__folders.models + '/UserModel')
const { makePasswordHashHelper, makeConfirmOTPHelper, makeUpdateTokenHelper } = require(__folders.helpers).authHelpers
const logger = require(__folders.util + '/logger')
const { notificationType } = require(__folders.config)

class CreateUserHandler extends BaseHandler {
  static get accessTag () {
    return 'users:create'
  }

  static get validationRules () {
    return {
      body: {
        name: new RequestRule(UserModel.schema.name, { required: true }),
        email: new RequestRule(UserModel.schema.email, { required: true }),
        countryId: new RequestRule(UserModel.schema.countryId, { required: true }),
        password: new RequestRule(UserModel.schema.passwordHash, { required: true }),
        mobileNumber: new RequestRule(UserModel.schema.mobileNumber, { required: true })
      }
    }
  }

  static async run (ctx) {
    const hash = await makePasswordHashHelper(ctx.body.password)
    delete ctx.body.password
    let user = await UserDAO.create({
      ...ctx.body,
      passwordHash: hash,
      preferredLanguage: ctx.headers['Language']
    })

    try {
      // Send OTP password
      // Todo: push it to queue
      const verifyCode = await makeConfirmOTPHelper(user.email)
      const updateToken = await makeUpdateTokenHelper(user)
      user = await UserDAO.baseUpdate(user.id, { verifyCode, updateToken })
      notificationClient.enqueue({ type: notificationType.createUser, to: user.mobileNumber, code: verifyCode, name: user.name, email: user.email, lang: user.preferredLanguage })
    } catch (error) {
      if (error.statusCode) { // log mailGun errors
        logger.error(error.message, error, { ctx: this.name })
      } else {
        throw error
      }
    }
    const country = await CountryDAO.getCountryById(user.countryId)
    user.mobileNumber = {
      msisdn: user.mobileNumber,
      // countryCode: county.phonecode,
      // iso: county.iso,
      countryId: user.countryId
    }
    user.country = country
    delete user.countryId
    return this.result({ data: user })
  }
}

module.exports = CreateUserHandler
