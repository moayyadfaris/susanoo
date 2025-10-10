
const { BaseMiddleware } = require('backend-core')
const logger = require('../util/logger')
const { basicAuth, basicAuthRoutes } = require('../config')
const { stripTrailingSlash } = require('helpers').commonHelpers

class BasicAuthMiddleware extends BaseMiddleware {
  async init () {
    logger.debug(`${this.constructor.name} initialized...`)
  }

  handler () {
    return (req, res, next) => {
      const url = stripTrailingSlash(req.originalUrl)
      if (basicAuthRoutes.filter(s => s === url).length > 0) {
        var header = req.headers['authorization'] || '' // get the header
        var token = header.split(/\s+/).pop() || '' // and the encoded auth token
        var auth = Buffer.from(token, 'base64').toString() // convert from base64
        var parts = auth.split(/:/) // split on colon
        var username = parts[0]
        var password = parts[1]
        if (username !== basicAuth.username || password !== basicAuth.password) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Node"')
          return res.status(401).send('Not Authorized')
        }
      }

      next()
    }
  }
}

module.exports = { BasicAuthMiddleware }
