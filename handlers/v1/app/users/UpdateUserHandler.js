const { RequestRule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const UserModel = require('models/UserModel')
const CountryDAO = require('database/dao/CountryDAO')
class UpdateUserHandler extends BaseHandler {
  static get accessTag () {
    return 'users:update'
  }

  static get validationRules () {
    return {
      body: {
        name: new RequestRule(UserModel.schema.name),
        countryId: new RequestRule(UserModel.schema.countryId),
        bio: new RequestRule(UserModel.schema.bio)
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    await UserDAO.baseUpdate(currentUser.id, ctx.body)
    const data = await UserDAO.getUserById(currentUser.id)
    let country = await CountryDAO.getCountryById(data.countryId)
    data.mobileNumberObj = {
      msisdn: data.mobileNumber
      // countryCode: county.phonecode,
      // iso: county.iso,
      // countryId: data.countryId
    }
    data.country = country
    return this.result({ data })
  }
}

module.exports = UpdateUserHandler
