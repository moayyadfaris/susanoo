const { BaseConfig } = require('backend-core')
const logger = require('../util/logger')

class BasicAuthConfig extends BaseConfig {
  constructor () {
    super()

    this.username = this.set('BASIC_AUTH_USER', this.joi.string().min(3).max(100).required())
    this.password = this.set('BASIC_AUTH_PASSWORD', this.joi.string().min(5).max(100).required())
  }

  async init () {
    logger.debug(`${this.constructor.name}: Initialization finish...`)
  }
}

module.exports = new BasicAuthConfig()
