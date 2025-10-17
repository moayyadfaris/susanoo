const { BaseConfig } = require('../core/lib/BaseConfig')
const logger = require('../util/logger')

class UserConfig extends BaseConfig {
  constructor () {
    super()
    this.defaultImage = this.set('DEFAULT_IMAGE_URL', this.joi.string().required())
  }
  async init () {
    logger.debug(`${this.constructor.name}: Initialization finish...`)
  }
}

module.exports = new UserConfig()
