const { BaseConfig } = require('../core/lib/BaseConfig')
const logger = require('../util/logger')

class UserConfig extends BaseConfig {
  constructor () {
    super()
    this.cutOffAmount = this.set('CUT_OFF_AMOUNT', this.joi.number().required())
    this.deafultImage = this.set('DEFAULT_IMAGE_URL', this.joi.string().required())
    this.releaseMobileNumberTimeMS = this.set('RELEASE_MOBILE_NUMBER_TIME_MS', this.joi.number().required())
  }
  async init () {
    logger.debug(`${this.constructor.name}: Initialization finish...`)
  }
}

module.exports = new UserConfig()
