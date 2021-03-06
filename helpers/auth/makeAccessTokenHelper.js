const { assert } = require('backend-core')

const jwtHelper = require('./jwtHelper')

const SECRET = require(__folders.config).token.access.secret
const expiresIn = require(__folders.config).token.access.expiresIn
const type = require(__folders.config).token.access.type
const iss = require(__folders.config).token.jwtIss

/**
 * @return {Promise} string
 */
module.exports = userEntity => {
  assert.object(userEntity, { required: true })

  let config = {
    payload: {
      tokenType: type,
      userRole: userEntity.role,
      email: userEntity.email,
      language: userEntity.preferredLanguage,
      sessionId: userEntity.sessionId,
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
