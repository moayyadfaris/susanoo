const { BaseDAO, assert } = require('backend-core')
const AuthenticationProviderModel = require('../models/AuthenticationProviderModel')

class AuthenticationProviderDAO extends BaseDAO {
  static get tableName () {
    return 'authentication_provider'
  }

  static get relationMappings () {
    return {
      users: {
        relation: BaseDAO.HasOneRelation,
        modelClass: `${__dirname}/UserDAO`,
        join: {
          from: 'users.authentication_provider',
          to: 'users.id'
        }
      }
    }
  }

  /**
   * ------------------------------
   * @HOOKS
   * ------------------------------
   */
  $formatJson (json) {
    json = super.$formatJson(json)
    return json
  }

  /**
   * ------------------------------
   * @METHODS
   * ------------------------------
   */
  static create (data) {
    assert.object(data, { required: true })
    return this.query().insert(data)
  };

  static async getProviderAndId (providerType, providerUserId) {
    assert.validate(providerType, AuthenticationProviderModel.schema.providerType, { required: true })
    assert.validate(providerUserId, AuthenticationProviderModel.schema.providerUserId, { required: true })
    const data = await this.query().where({ providerType }).where({ providerUserId }).first()
    return data
  }
}

module.exports = AuthenticationProviderDAO
