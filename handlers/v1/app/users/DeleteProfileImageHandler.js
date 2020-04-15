const BaseHandler = require(__folders.handlers + '/BaseHandler')
const UserDAO = require(__folders.dao + '/UserDAO')

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
