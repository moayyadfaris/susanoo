const { assert } = require('backend-core')

const UserModel = require('../models/UserModel')
const { app } = require(__folders.config)
const fs = require('fs')
const path = require('path')

class welcomeEmail {
  constructor ({ to, code, name, lang } = {}) {
    assert.object(arguments[0], { required: true })
    assert.validate(to, UserModel.schema.email, { required: true })
    assert.validate(name, UserModel.schema.name, { required: true })
    assert.validate(code, UserModel.schema.code, { required: true })
    assert.validate(lang, UserModel.schema.preferredLanguage, { required: true })

    this.to = to
    if (lang === 'ar') {
      this.subject = '!مرحباً بك معنا'
    } else {
      this.subject = 'Welcome on board!'
    }
    var emailPath = path.join(__dirname, `templates/registration-mail-shot-${lang}.email`)
    var email = fs.readFileSync(emailPath).toString()
    email = email.replace('{code}', code)
      .replace('{app.name}', app.name)
      .replace('{user.name}', name)
      .replace('{logo_path}', app.url + '/white_logo.png')
    this.text = email
  }
}

module.exports = welcomeEmail
