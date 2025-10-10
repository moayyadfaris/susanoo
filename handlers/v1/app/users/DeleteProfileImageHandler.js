const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')

class UploadProfileImageHandler extends BaseHandler {
  static get accessTag () {
    return 'users:delete-profile-image'
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const data = await UserDAO.baseUpdate(currentUser.id, { 'profileImageId': null })

    return this.result({ data })
  }
}

module.exports = UploadProfileImageHandler
