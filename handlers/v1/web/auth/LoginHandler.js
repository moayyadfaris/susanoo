const ms = require('ms')
const { RequestRule, ErrorWrapper, errorCodes, CookieEntity } = require('backend-core')
const addSession = require('handlers/v1/common/addSession')
const SessionEntity = require('handlers/v1/common/SessionEntity')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const AuthModel = require('models/AuthModel')
const { checkPasswordHelper, makeAccessTokenHelper } = require('helpers').authHelpers
const { dashboardUserPolicy } = require('acl/policies')
const config = require('config')
/**
 * Enhanced Web LoginHandler - Email-only Authentication for Web Interface
 * 
 * Features:
 * - Email-only authentication (no mobile number support)
 * - Cookie-based session management for web interface
 * - Enhanced security validation
 * - Dashboard user policy enforcement
 * 
 * @extends BaseHandler
 * @version 2.0.0 - Email-only authentication
 */
class LoginHandler extends BaseHandler {
  static get accessTag () {
    return 'web#auth:login'
  }

  static get validationRules () {
    return {
      body: {
        email: new RequestRule(AuthModel.schema.email, { required: true }),
        password: new RequestRule(AuthModel.schema.password, { required: true }),
        fingerprint: new RequestRule(AuthModel.schema.fingerprint, { required: true })
      }
    }
  }

  static async run (ctx) {
    const refTokenExpiresInMilliseconds = new Date().getTime() + ms(config.token.refresh.expiresIn)
    const refTokenExpiresInSeconds = parseInt(refTokenExpiresInMilliseconds / 1000)

    let user = await UserDAO.getByEmail(ctx.body.email)
    await dashboardUserPolicy(user)
    try {
      await checkPasswordHelper(ctx.body.password, user.passwordHash)
    } catch (e) {
      throw new ErrorWrapper({ ...errorCodes.INVALID_CREDENTIALS })
    }

    const newSession = new SessionEntity({
      userId: user.id,
      ip: ctx.ip,
      ua: ctx.headers['User-Agent'],
      fingerprint: ctx.body.fingerprint
    })

    await addSession(newSession)

    return this.result({
      data: {
        accessToken: await makeAccessTokenHelper(user),
        // return refresh token also in request body, just for debug
        refreshToken: newSession.refreshToken
      },
      cookies: [
        new CookieEntity({
          name: 'refreshToken',
          value: newSession.refreshToken,
          domain: 'localhost',
          path: '/',
          maxAge: refTokenExpiresInSeconds,
          secure: false // temp: should be deleted
        })
      ]
    })
  }
}

module.exports = LoginHandler
