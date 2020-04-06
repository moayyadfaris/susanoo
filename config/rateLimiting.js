const { BaseConfig } = require('backend-core')
const { ErrorWrapper, errorCodes } = require('backend-core')// const { errorCodes } = require('backend-core')
const logger = require('../util/logger')
class RateLimitingConfig extends BaseConfig {
  constructor () {
    super()

    this.defaultConfig = {
      windowMs: +this.set('RATE_LIMIT_WINDOWS_MS', this.joi.number().required()),
      max: this.set('RATE_LIMIT_MAX_TRIES', this.joi.number().required()),
      handler: function (req, res, next) {
        return next(new ErrorWrapper({ ...errorCodes.TOO_MANY_REQUESTS }))
      }
    }
  }
  async init () {
    logger.debug(`${this.constructor.name}: Initialization finish...`)
  }
}

module.exports = new RateLimitingConfig()
