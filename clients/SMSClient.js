/**
 * https://www.twilio.com/docs/sms/tutorials/how-to-send-sms-messages-node-js
 */

const $ = Symbol('private scope')
const twilio = require('twilio')
const { errorCodes, ErrorWrapper, assert, AbstractLogger } = require('backend-core')

class SMSClient {
  constructor (options = {}) {
    assert.string(options.accountSid, { notEmpty: true })
    assert.string(options.authToken, { notEmpty: true })
    assert.string(options.from)
    assert.instanceOf(options.logger, AbstractLogger)

    this[$] = {
      client: twilio(
        options.accountSid,
        options.authToken
      ),
      from: options.from,
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
    assert.string(message.to, { notEmpty: true })
    assert.string(message.text, { notEmpty: true })

    // Todo: creatre mobile number validation
    // const isValidToEmail = emailRegEx.test(message.to)
    // if (!isValidToEmail) {
    //   throw new Error('Wrong "to" option. Should be valid email address.')
    // }
    const data = {
      body: message.text || 'Testing some Mailgun awesomness!',
      from: message.from || this[$].from,
      to: '+' + message.to
    }
    return new Promise((resolve, reject) => {
      this[$].client.messages.create(data, (error, response) => {
        if (error) {
          reject(new ErrorWrapper({ ...errorCodes.PROVIDER_ERROR, message: error.message, status: error.status }))
        }
        return resolve(response)
      })
    })
  }
}

module.exports = SMSClient
