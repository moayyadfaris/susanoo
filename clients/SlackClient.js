/**
 * https://www.twilio.com/docs/sms/tutorials/how-to-send-sms-messages-node-js
 */

const $ = Symbol('private scope')
const request = require('request')
const { assert, AbstractLogger } = require('backend-core')

class SlackClient {
  constructor (options = {}) {
    assert.string(options.url, { notEmpty: true })
    assert.string(options.icon, { notEmpty: true })
    assert.instanceOf(options.logger, AbstractLogger)

    this[$] = {
      client: request,
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
  send (message) {
    assert.object(message, { required: true })
    assert.string(message.from)
    // assert.string(message.to, { notEmpty: true })
    assert.string(message.text, { notEmpty: true })

    const options = {
      method: 'POST',
      url: this[$].url,
      body: {
        icon_url: this[$].icon,
        text: message.subject + ' ' + message.text
      },
      json: true
    }
    return new Promise((resolve, reject) => {
      this[$].client(options, function (error, response, body) {
        if (error) throw new Error(error)
        return resolve(response)
      })
    })
  }
}

module.exports = SlackClient
