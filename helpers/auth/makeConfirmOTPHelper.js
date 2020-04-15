const { assert } = require('backend-core')
const otpHelper = require('./otpHelper')
const digits = require(__folders.config).otp.digits
const window = require(__folders.config).otp.window

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
      window: window
    }
  }

  return otpHelper.sign(config.payload, config.options)
}
