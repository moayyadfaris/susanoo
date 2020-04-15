const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const SessionDAO = require(__folders.dao + '/SessionDAO')
const AuthModel = require(__folders.models + '/AuthModel')
const UserDAO = require(__folders.dao + '/UserDAO')
/**
 * remove current session
 */
class LogoutHandler extends BaseHandler {
  static get accessTag () {
    return 'auth:logout'
  }

  static get validationRules () {
    return {
      body: {
        refreshToken: new RequestRule(AuthModel.schema.refreshToken, { required: true })
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    await UserDAO.baseUpdate(currentUser.id)
    await SessionDAO.baseRemoveWhere({ refreshToken: ctx.body.refreshToken })

    return this.result({ message: 'User is logged out from current session.' })
  }
}

module.exports = LogoutHandler
