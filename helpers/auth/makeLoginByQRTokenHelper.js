const { assert } = require('backend-core')
const jwtHelper = require('./jwtHelper')
const SECRET = require('config').token.loginByQRToken.secret
const expiresIn = require('config').token.loginByQRToken.expiresIn
const type = require('config').token.loginByQRToken.type
const iss = require('config').token.jwtIss

/**
 * @return {Promise} string
 */
module.exports = socketId => {
  assert.string(socketId, { required: true })

  let config = {
    payload: {
      tokenType: type,
      socketId: socketId,
      iss
    },

    options: {
      algorithm: 'HS512',
      subject: socketId,
      expiresIn
    }
  }

  return jwtHelper.sign(config.payload, SECRET, config.options)
}
