const { RequestRule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const SessionDAO = require('database/dao/SessionDAO')
const AuthModel = require('models/AuthModel')

/**
 * remove current session
 */
class LogoutHandler extends BaseHandler {
  static get accessTag () {
    return 'web#auth:logout'
  }

  static get validationRules () {
    return {
      body: {
        refreshToken: new RequestRule(AuthModel.schema.refreshToken, { required: true })
      }
    }
  }

  static async run (ctx) {
    await SessionDAO.baseRemoveWhere({ refreshToken: ctx.body.refreshToken })

    return this.result({ message: 'User is logged out from current session.' })
  }
}

module.exports = LogoutHandler
