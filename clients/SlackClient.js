const $ = Symbol('private scope')
const axios = require('axios')
const { assert, AbstractLogger } = require('backend-core')

class SlackClient {
  constructor (options = {}) {
    assert.string(options.url, { notEmpty: true })
    assert.string(options.icon, { notEmpty: true })
    assert.instanceOf(options.logger, AbstractLogger)

    this[$] = {
      client: axios,
      url: options.url,
      icon: options.icon,
      logger: options.logger
    }

    this[$].logger.debug(`${this.constructor.name} constructed...`)
  }

  /**
   * Example:
   * from: '+16204494112'
   * to: '+972795974021'
   * text: 'Testing some Twilio awesomness!'
   */
  async send (message) {
    assert.object(message, { required: true })
    assert.string(message.from)
    // assert.string(message.to, { notEmpty: true })
    assert.string(message.text, { notEmpty: true })

    const options = {
      method: 'POST',
      url: this[$].url,
      data: {
        icon_url: this[$].icon,
        text: message.subject + ' ' + message.text
      }
    }

    try {
      const response = await this[$].client(options)
      return response
    } catch (error) {
      this[$].logger.error(`Error sending message: ${error.message}`)
      throw new Error(error)
    }
  }
}

module.exports = SlackClient
