const { assert } = require('backend-core')

const UserModel = require('../models/UserModel')

class ResetPasswordSMS {
  constructor ({ to, code, name } = {}) {
    assert.object(arguments[0], { required: true })
    // assert.validate(to, UserModel.schema.mobileNumber, { required: true })
    assert.validate(code, UserModel.schema.code, { required: true })

    this.to = to
    this.subject = 'Reset your password!'
    this.text = `Please use the following code to reset your Susanoo password: ${code}
   Team Susanoo`
  }
}

module.exports = ResetPasswordSMS
