const { assert } = require('backend-core')

const UserModel = require('../models/UserModel')
const { app } = require(__folders.config)

class ConfrimSlack {
  constructor ({ to, code } = {}) {
    assert.object(arguments[0], { required: true })
    // assert.validate(to, UserModel.schema.mobileNumber, { required: true })
    assert.validate(code, UserModel.schema.code, { required: true })

    this.to = to
    this.subject = `Welcome on board! {{\`${to}\`}}`
    this.text = `\`\`\`Welcome to ${app.name}! code: ${code}. We just created new account for you.
Cheers,
The ${app.name} Team\`\`\``
  }
}

module.exports = ConfrimSlack
