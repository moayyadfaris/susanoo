const { RequestRule } = require('backend-core')
const addSession = require('../../../../services/auth/session/SessionManagementService')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const AuthModel = require('models/AuthModel')
const SessionDAO = require('database/dao/SessionDAO')
const SessionEntity = require('../../../../services/auth/entities/SessionEntity')
const { makeAccessTokenHelper, verifySessionHelper } = require('helpers').authHelpers

class RefreshTokensHandler extends BaseHandler {
  static get accessTag () {
    return 'web#auth:refresh-tokens'
  }

  static get validationRules () {
    return {
      body: {
        refreshToken: new RequestRule(AuthModel.schema.refreshToken, { required: true }),
        fingerprint: new RequestRule(AuthModel.schema.fingerprint, { required: true }) // https://github.com/Valve/fingerprintjs2
      }
    }
  }

  static async run (ctx) {
    const reqRefreshToken = ctx.body.refreshToken
    const reqFingerprint = ctx.body.fingerprint

    const oldSession = await SessionDAO.getByRefreshToken(reqRefreshToken)
    await SessionDAO.baseRemoveWhere({ refreshToken: reqRefreshToken })
    await verifySessionHelper(new SessionEntity(oldSession), reqFingerprint)
    const user = await UserDAO.baseGetById(oldSession.userId)

    const newSession = new SessionEntity({
      userId: user.id,
      ip: ctx.ip,
      ua: ctx.headers['User-Agent'],
      fingerprint: reqFingerprint
    })

    await addSession(newSession)

    return this.result({
      data: {
        accessToken: await makeAccessTokenHelper(user),
        refreshToken: newSession.refreshToken
      }
    })
  }
}

module.exports = RefreshTokensHandler
