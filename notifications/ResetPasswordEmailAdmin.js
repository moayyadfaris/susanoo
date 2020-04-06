const { assert } = require('backend-core')

const UserModel = require('../models/UserModel')
const { app } = require(__folders.config)
const fs = require('fs')
const path = require('path')

class ResetPasswordEmailAdmin {
  constructor ({ to, name, token } = {}) {
    assert.object(arguments[0], { required: true })
    assert.validate(to, UserModel.schema.email, { required: true })
    assert.validate(name, UserModel.schema.name, { required: true })
    assert.validate(token, UserModel.schema.resetPasswordToken, { required: true })

    this.to = to
    this.subject = 'Reset Your Susanoo Password'
    var emailPath = path.join(__dirname, 'templates/reset-password-mail-shot-admin.email')
    var email = fs.readFileSync(emailPath).toString()
    email = email
      .replace('{app.name}', app.name)
      .replace('{user.name}', name)
      .replace('{logo_path}', app.url + '/white_logo.png')
      .replace('{reset_path}', app.resetPasswordUrl + '?token=' + token)
    this.text = email
  }
}

module.exports = ResetPasswordEmailAdmin
