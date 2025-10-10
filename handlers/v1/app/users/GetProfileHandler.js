const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const s3Config = require('config').s3

class GetProfileHandler extends BaseHandler {
  static get accessTag () {
    return 'users:profile'
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const data = await UserDAO.getUserById(currentUser.id, '[profileImage]')

    if (data.profileImage) {
      data['profileImage'] = s3Config.baseUrl + data.profileImage.path
    } else {
      data['profileImage'] = null
    }

    delete data.email
    delete data.mobileNumber
    delete data.isVerified
    delete data.countryId

    return this.result({ data })
  }
}

module.exports = GetProfileHandler
