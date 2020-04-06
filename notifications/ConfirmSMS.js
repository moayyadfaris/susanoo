const { assert } = require('backend-core')

const UserModel = require('../models/UserModel')

class ConfrimSMS {
  constructor ({ to, code } = {}) {
    assert.object(arguments[0], { required: true })
    // assert.validate(to, UserModel.schema.mobileNumber, { required: true })
    assert.validate(code, UserModel.schema.code, { required: true })

    this.to = to
    this.subject = 'Welcome to Khabbir!'
    this.text = `Please use the following code to verify your account: ${code}
Team Khabbir`
  }
}

module.exports = ConfrimSMS
