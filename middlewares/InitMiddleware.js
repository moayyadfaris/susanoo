const config = require(__folders.config)
const { BaseMiddleware } = require('backend-core')
const logger = require('../util/logger')

class InitMiddleware extends BaseMiddleware {
  async init () {
    logger.debug(`${this.constructor.name} initialized...`)
  }

  handler () {
    return (req, res, next) => {
      res.header('Server', config.app.name)
      next()
    }
  }
}

module.exports = { InitMiddleware }
