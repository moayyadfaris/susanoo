const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')

class UploadProfileImageAction extends BaseAction {
  static get accessTag () {
    return 'users:delete-profile-image'
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const data = await UserDAO.baseUpdate(currentUser.id, { 'profileImageId': null })

    return this.result({ data })
  }
}

module.exports = UploadProfileImageAction
