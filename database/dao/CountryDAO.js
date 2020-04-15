const { BaseDAO, assert } = require('backend-core')
const CountryModel = require('../../models/CountryModel')
const { redisClient } = require(__folders.handlers + '/RootProvider')
class CountryDAO extends BaseDAO {
  static get tableName () {
    return 'countries'
  }

  /**
   * ------------------------------
   * @HOOKS
   * ------------------------------
   */
  $formatJson (json) {
    json = super.$formatJson(json)
    // delete sensitive and unwanted data from all queries
    delete json.createdAt
    delete json.updatedAt

    return json
  }

  /**
   * ------------------------------
   * @METHODS
   * ------------------------------
   */
  static async getCountryById (id) {
    assert.validate(id, CountryModel.schema.id, { required: true })
    const data = await this.query().where({ id }).first()
    if (!data) throw this.errorEmptyResponse()
    return data
  }

  $afterUpdate (opt, queryContext) {
    redisClient.removePatternKey('*countries*')
    return super.$afterUpdate(opt, queryContext)
  }
}

module.exports = CountryDAO
