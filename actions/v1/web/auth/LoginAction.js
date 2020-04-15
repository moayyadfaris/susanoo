const { RequestRule, ErrorWrapper, errorCodes } = require('backend-core')
const addSession = require(__folders.actionsV1 + '/common/addSession')
const SessionEntity = require(__folders.actionsV1 + '/common/SessionEntity')
const BaseAction = require(__folders.actions + '/BaseAction')
const UserDAO = require(__folders.dao + '/UserDAO')
const AuthModel = require(__folders.models + '/AuthModel')
const { checkPasswordHelper, makeAccessTokenHelper } = require(__folders.helpers).authHelpers
const { dashboardUserPolicy } = require(__folders.policy)

class LoginAction extends BaseAction {
  static get accessTag () {
    return 'web#auth:login'
  }

  static get validationRules () {
    return {
      body: {
        password: new RequestRule(AuthModel.schema.password, { required: true }),
        email: new RequestRule(AuthModel.schema.email, { required: true }),
        fingerprint: new RequestRule(AuthModel.schema.fingerprint, { required: true })
      }
    }
  }

  static async run (ctx) {
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
        refreshToken: newSession.refreshToken
      }
    })
  }
}

module.exports = LoginAction
