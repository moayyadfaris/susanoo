const { RequestRule } = require('backend-core')
const BaseAction = require(__folders.actions + '/BaseAction')
const AuthModel = require(__folders.models + '/AuthModel')
const { makeAccessTokenHelper, makeLoginByQRTokenHelper, jwtHelper } = require(__folders.auth + '/')
const config = require(__folders.config)
const addSession = require(__folders.actionsV1 + '/common/addSession')
const SessionEntity = require(__folders.actionsV1 + '/common/SessionEntity')
const { redisClient } = require(__folders.actions + '/RootProvider')
class LoginByQRCodeAction extends BaseAction {
  static get accessTag () {
    return 'auth:login-qr-code'
  }

  static get validationRules () {
    return {
      body: {
        token: new RequestRule(AuthModel.schema.loginByQRToken, { required: true }),
        fingerprint: new RequestRule(AuthModel.schema.fingerprint, { required: true })
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx
    try {
      const tokenData = await jwtHelper.verify(ctx.body.token, config.token.loginByQRToken.secret)
      const newSession = new SessionEntity({
        userId: currentUser.id,
        ip: ctx.ip,
        ua: ctx.headers['User-Agent'],
        fingerprint: ctx.body.fingerprint
      })

      await addSession(newSession)
      const data = {
        eventType: 'ACCESS_TOKEN_GENERATED',
        userId: currentUser.id,
        accessToken: await makeAccessTokenHelper(currentUser),
        refreshToken: newSession.refreshToken,
        tokenData: tokenData
      }
      redisClient.publish('LOGIN_BY_QR_CHANNEL', data)
      return this.result({ message: 'QR code has been scanned!' })
    } catch (e) {
      const tokenData = await jwtHelper.decode(ctx.body.token)
      const token = await makeLoginByQRTokenHelper(tokenData.socketId)
      const result = {
        eventType: 'LOGIN_TOKEN_EXPIRED',
        'token': token,
        'code': e.code,
        'status': e.status,
        'tokenData': tokenData
      }
      redisClient.publish('LOGIN_BY_QR_CHANNEL', result)
      throw e
    }
  }
}

module.exports = LoginByQRCodeAction
