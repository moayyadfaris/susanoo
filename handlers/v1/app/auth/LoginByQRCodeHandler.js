const { RequestRule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const AuthModel = require('models/AuthModel')
const { makeAccessTokenHelper, makeLoginByQRTokenHelper, jwtHelper } = require('helpers').authHelpers
const config = require('config')
const addSession = require('handlers/v1/common/addSession')
const SessionEntity = require('handlers/v1/common/SessionEntity')
const { redisClient } = require('handlers/RootProvider')
class LoginByQRCodeHandler extends BaseHandler {
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

module.exports = LoginByQRCodeHandler
