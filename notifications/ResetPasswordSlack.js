const { assert } = require('backend-core')

const UserModel = require('../models/UserModel')
const { app } = require(__folders.config)

class SlackMessage {
  constructor ({ to, code, name } = {}) {
    assert.object(arguments[0], { required: true })
    // assert.validate(to, UserModel.schema.mobileNumber, { required: true })
    assert.validate(code, UserModel.schema.code, { required: true })

    this.to = to
    this.subject = `Reset Password! {{\`${to}\`}}`
    this.text = `\`\`\`Hello ${name}! code: ${code}. Please the code to verify reset password.
Cheers,
The ${app.name} Team\`\`\``
  }
}

module.exports = SlackMessage
