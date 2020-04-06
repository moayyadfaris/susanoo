const { RequestRule } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const SessionDAO = require(__folders.dao + '/SessionDAO')
const AuthModel = require(__folders.models + '/AuthModel')
const UserDAO = require(__folders.dao + '/UserDAO')
/**
 * remove current session
 */
class LogoutAction extends BaseAction {
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
    await UserDAO.baseUpdate(currentUser.id, { notificationToken: null })
    await SessionDAO.baseRemoveWhere({ refreshToken: ctx.body.refreshToken })

    return this.result({ message: 'User is logged out from current session.' })
  }
}

module.exports = LogoutAction
