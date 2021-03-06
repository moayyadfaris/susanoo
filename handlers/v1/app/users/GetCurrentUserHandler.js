const BaseHandler = require(__folders.handlers + '/BaseHandler')
const UserDAO = require(__folders.dao + '/UserDAO')
const CountryDAO = require(__folders.dao + '/CountryDAO')
class GetCurrentUserHandler extends BaseHandler {
  static get accessTag () {
    return 'users:get-current-user'
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const data = await UserDAO.getUserById(currentUser.id)

    let country = await CountryDAO.getCountryById(data.countryId)
    data.mobileNumber = {
      msisdn: data.mobileNumber,
      // countryCode: county.phonecode,
      // iso: county.iso,
      countryId: data.mobileCountryId
    }
    data.country = country
    delete data.countryId
    delete data.deviceId
    return this.result({ data })
  }
}

module.exports = GetCurrentUserHandler
