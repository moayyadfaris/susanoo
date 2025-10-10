const { totp } = require('otplib')

const { errorCodes, ErrorWrapper, assert } = require('backend-core')

/**
 * @return {Promise} true/Error
 */
module.exports.verify = (code, emailOrMobileNumber, options) => {
  assert.string(code, { notEmpty: true })
  assert.string(emailOrMobileNumber, { notEmpty: true })
  assert.object(options, { notEmpty: true })

  try {
    totp.options = options
    return totp.check(code, emailOrMobileNumber)
  } catch (err) {
    // Error possibly thrown by the thirty-two package
    // 'Invalid input - it is not base32 encoded string'
    // return reject(new ErrorWrapper({ ...errorCodes.TOKEN_EXPIRED }))
    // return reject(new ErrorWrapper({ ...errorCodes.TOKEN_VERIFY, message: error.message }))
    console.error(err)
    return false
  }
}

/**
 * @return {Promise} string (code)
 */
module.exports.sign = (playload, options) => {
  assert.object(playload, { required: true })
  assert.object(options, { notEmpty: true })

  try {
    // settings
    totp.options = options
    return totp.generate(playload.emailOrMobileNumber)
  } catch (error) {
    // Error possibly thrown by the thirty-two package
    // 'Invalid input - it is not base32 encoded string'
    return new ErrorWrapper({ ...errorCodes.TOKEN_NOT_SIGNED, message: error.message })
  }
}
