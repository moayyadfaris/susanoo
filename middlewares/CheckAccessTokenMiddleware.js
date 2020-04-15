const { errorCodes, ErrorWrapper, BaseMiddleware } = require('backend-core')
const { jwtHelper } = require(__folders.helpers).authHelpers
const SECRET = require(__folders.config).token.access.secret
const roles = require(__folders.config).roles
const logger = require('../util/logger')

class CheckAccessTokenMiddleware extends BaseMiddleware {
  async init () {
    logger.debug(`${this.constructor.name} initialized...`)
  }

  handler () {
    return (req, res, next) => {
      const authorization = req.headers['authorization'] || req.headers['Authorization']
      const bearer = authorization && authorization.startsWith('Bearer ') ? authorization : null
      const token = bearer ? bearer.split('Bearer ')[1] : null

      // set default meta data
      req.currentUser = Object.freeze({
        id: null,
        name: null,
        role: roles.anonymous,
        email: null,
        expiresIn: null,
        language: null,
        sessionId: null
      })

      if (token) {
        return jwtHelper.verify(token, SECRET)
          .then(tokenData => {
            // set actual current user
            req.currentUser = Object.freeze({
              id: tokenData.sub,
              role: tokenData.userRole,
              email: tokenData.email,
              expiresIn: Number(tokenData.exp),
              language: tokenData.language,
              sessionId: tokenData.sessionId
            })

            next()
          }).catch(error => {
            if (error.code === errorCodes.TOKEN_EXPIRED.code) {
              /**
               * pass request if token is not valid
               * in this case security service will consider that request as TOKEN_EXPIRED_ERROR
               */
              next(new ErrorWrapper({ ...errorCodes.ACCESS_TOKEN_EXPIRED }))
            } else {
              next(error)
            }
          })
      }
      next()
    }
  }
}

module.exports = { CheckAccessTokenMiddleware }
