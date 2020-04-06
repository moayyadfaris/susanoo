const { RequestRule } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const CountryDAO = require(__folders.dao + '/CountryDAO')
class UpdateUserAction extends BaseAction {
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

module.exports = UpdateUserAction
