const { BaseConfig } = require('../core/lib/BaseConfig')
const logger = require('../util/logger')

class EmailConfig extends BaseConfig {
  constructor () {
    super()

    this.from = this.set('EMAIL_FROM', this.joi.string().min(10).max(100).required())

    // Mailgun config
    this.mailgunApiKey = this.set('MAILGUN_API_KEY', v => v.includes('key-'))
    this.mailgunDomain = this.set('MAILGUN_DOMAIN', this.joi.string().min(5).max(100).required())
    this.mailgunHost = this.set('MAILGUN_HOST', this.joi.string().min(5).max(100).required(), 'api.mailgun.net') // or 'api.eu.mailgun.net'

    // SMTP config
    this.username = this.set('SMTP_USERNAME', this.joi.string().min(5).max(100).required())
    this.password = this.set('SMTP_PASSWORD', this.joi.string().min(5).max(100).required())
    this.host = this.set('SMTP_HOST', this.joi.string().min(5).max(100).required())
    this.port = this.set('SMTP_PORT', this.joi.number(), 465)
  }

  async init () {
    logger.debug(`${this.constructor.name}: Initialization finish...`)
  }
}

module.exports = new EmailConfig()
