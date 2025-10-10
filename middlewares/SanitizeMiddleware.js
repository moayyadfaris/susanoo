const { BaseMiddleware } = require('backend-core')
const logger = require('../util/logger')

class SanitizeMiddleware extends BaseMiddleware {
  async init () {
    logger.debug(`${this.constructor.name} initialized...`)
  }

  handler () {
    return (req, res, next) => {
      next()
    }
  }
}

module.exports = { SanitizeMiddleware }
