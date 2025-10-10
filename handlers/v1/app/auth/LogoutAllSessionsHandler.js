const BaseHandler = require('handlers/BaseHandler')
const SessionDAO = require('database/dao/SessionDAO')

class LogoutAllSessionsHandler extends BaseHandler { // TODO logout from all sessions except current
  static get accessTag () {
    return 'auth:logout-all-sessions'
  }

  static async run (ctx) {
    const { currentUser } = ctx
    await SessionDAO.baseRemoveWhere({ userId: currentUser.id })

    return this.result({ message: 'User is logged out from all sessions.' })
  }
}

module.exports = LogoutAllSessionsHandler
