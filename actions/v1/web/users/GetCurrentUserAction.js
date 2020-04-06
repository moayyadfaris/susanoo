const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')

class GetCurrentUserAction extends BaseAction {
  static get accessTag () {
    return 'web#users:get-current-user'
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const data = await UserDAO.getUserById(currentUser.id, 'profileImage')
    if (data.profileImage) {
      data['profileImage'] = data.profileImage.fullPath()
    }
    return this.result({ data })
  }
}

module.exports = GetCurrentUserAction
