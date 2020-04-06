const { assert } = require('backend-core')
const jwtHelper = require('./jwtHelper')

const SECRET = require(__folders.config).token.emailConfirm.secret
const expiresIn = require(__folders.config).token.emailConfirm.expiresIn
const type = require(__folders.config).token.emailConfirm.type
const iss = require(__folders.config).token.jwtIss

/**
 * @return {Promise} string
 */
module.exports = userEntity => {
  assert.object(userEntity, { required: true })

  let config = {
    payload: {
      tokenType: type,
      email: userEntity.email,
      newEmail: userEntity.newEmail,
      iss
    },

    options: {
      algorithm: 'HS512',
      subject: userEntity.id,
      expiresIn
    }
  }

  return jwtHelper.sign(config.payload, SECRET, config.options)
}
