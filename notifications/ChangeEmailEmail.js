const { assert } = require('backend-core')

const UserModel = require('../models/UserModel')
const { app } = require(__folders.config)
// const { expiresIn } = require(__folders.config).token.resetPassword

class ChangeEmailEmail {
  constructor ({ to, code } = {}) {
    assert.object(arguments[0], { required: true })
    assert.validate(to, UserModel.schema.email, { required: true })
    assert.validate(code, UserModel.schema.code, { required: true })

    this.to = to
    this.subject = `[${app.name}] Change Email!`
    this.text = `Welcome to ${app.name}! code: ${code}. Please use the code to verify change email.
Cheers,
The ${app.name} Team`
  }
}

module.exports = ChangeEmailEmail
