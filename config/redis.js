const { BaseConfig } = require('backend-core')
const logger = require('../util/logger')
class RedisConfig extends BaseConfig {
  constructor () {
    super()

    this.host = this.set('REDIS_HOST', this.joi.string().required())
    this.port = parseInt(this.set('REDIS_PORT', this.joi.number().required()))
  }
  async init () {
    logger.debug(`${this.constructor.name}: Initialization finish...`)
  }
}

module.exports = new RedisConfig()
