const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')

class CancelEmailChangingHandler extends BaseHandler {
  static get accessTag () {
    return 'users:cancel-email-changing'
  }

  static async run (ctx) {
    const { currentUser } = ctx
    await UserDAO.baseUpdate(currentUser.id, {
      newEmail: null,
      emailConfirmToken: null
    })

    return this.result({ message: 'Email changing canceled!' })
  }
}

module.exports = CancelEmailChangingHandler
