const { BaseConfig } = require('backend-core')
const logger = require('../util/logger')

class OTPConfig extends BaseConfig {
  constructor () {
    super()

    this.digits = parseInt(this.set('OTP_DIGITS', this.joi.number().required()))
    this.window = parseInt(this.set('OTP_WINDOW', this.joi.number().required()))
  }

  async init () {
    logger.debug(`${this.constructor.name}: Initialization finish...`)
  }
}

module.exports = new OTPConfig()
