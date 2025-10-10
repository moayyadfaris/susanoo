const { BaseConfig } = require('../core/lib/BaseConfig')
const logger = require('../util/logger')
class SlackConfig extends BaseConfig {
  constructor () {
    super()
    this.url = this.set('SLACK_URL', this.joi.string().min(5).max(300).required())
    this.icon = this.set('SLACK_ICON', this.joi.string().min(5).max(300).required())
  }
  async init () {
    logger.debug(`${this.constructor.name}: Initialization finish...`)
  }
}

module.exports = new SlackConfig()
