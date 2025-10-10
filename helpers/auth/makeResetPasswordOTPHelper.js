const { assert } = require('backend-core')
const otpHelper = require('./otpHelper')
const digits = require('config').otp.digits
const window = require('config').otp.window

/**
 * @return {Promise} string
 */
module.exports = emailOrMobileNumber => {
  assert.string(emailOrMobileNumber, { notEmpty: true })

  let config = {
    payload: {
      emailOrMobileNumber: emailOrMobileNumber
    },

    options: {
      digits: digits,
      step: window
    }
  }

  return otpHelper.sign(config.payload, config.options)
}
