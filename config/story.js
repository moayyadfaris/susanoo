const { BaseConfig } = require('backend-core')
const logger = require('../util/logger')
class StoryConfig extends BaseConfig {
  constructor () {
    super()
    this.storyExpirationTimespan = this.set('STORY_EXPIRATION_TIMESPAN_DAYS', this.joi.number().required())
    this.storyExpirationCrontab = this.set('STORY_EXPIRATION_CRON_TAB', this.joi.string().required())
    this.storyArchivingCrontab = this.set('STORY_ARCHIVING_CRON_TAB', this.joi.string().required())
  }
  async init () {
    logger.debug(`${this.constructor.name}: Initialization finish...`)
  }
}

module.exports = new StoryConfig()
