const { BaseConfig } = require('backend-core')
const logger = require('../util/logger')
class SMSConfig extends BaseConfig {
  constructor () {
    super()
    this.twilioAuthToken = this.set('TWILIO_AUTH_TOKEN', this.joi.string().min(5).max(100).required())
    this.twilioAccountSid = this.set('TWILIO_ACCOUNT_SID', this.joi.string().min(5).max(100).required())
    this.from = this.set('PHONE_FROM', this.joi.string().min(7).max(100).required())
  }
  async init () {
    logger.debug(`${this.constructor.name}: Initialization finish...`)
  }
}

module.exports = new SMSConfig()
