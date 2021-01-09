const joi = require('joi')
const { BaseModel, Rule } = require('backend-core')

const UserModel = require('./UserModel')
const InterestModel = require('./InterestModel')

const schema = {
  userId: UserModel.schema.id,
  interestId: InterestModel.schema.id,
  interests: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.array().items(joi.number()))
      } catch (e) { return e.message }
      return true
    },
    description: 'array of integer positive'
  })
}

class UserInterestModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = UserInterestModel
