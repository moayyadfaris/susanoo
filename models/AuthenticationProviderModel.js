const isUUID = require('validator/lib/isUUID')
const { BaseModel, Rule } = require('backend-core')

const schema = {
  id: new Rule({
    validator: v => isUUID(v),
    description: 'UUID;'
  }),
  providerType: new Rule({
    validator: v => (typeof v === 'string'),
    description: 'string; facebook,twitter,google;'
  }),
  providerUserId: new Rule({
    validator: v => (typeof v === 'string'),
    description: 'string;'
  }),
  userId: new Rule({
    validator: v => isUUID(v),
    description: 'UUID;'
  })
}

class AuthenticationProviderModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = AuthenticationProviderModel
