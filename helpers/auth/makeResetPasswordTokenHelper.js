const jwtHelper = require('./jwtHelper')
const { assert } = require('backend-core')

const SECRET = require(__folders.config).token.resetPassword.secret
const expiresIn = require(__folders.config).token.resetPassword.expiresIn
const type = require(__folders.config).token.resetPassword.type
const iss = require(__folders.config).token.jwtIss
const UserModel = require(__folders.models + '/UserModel')

/**
 * @return {Promise} string
 */
module.exports = userEntity => {
  assert.object(userEntity, { required: true })
  assert.validate(userEntity.id, UserModel.schema.id, { required: true })
  assert.validate(userEntity.email, UserModel.schema.email, { required: true })

  let config = {
    payload: {
      tokenType: type,
      email: userEntity.email,
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
