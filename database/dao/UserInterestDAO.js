const { assert } = require('backend-core')

const UserDAO = require('database/dao/UserDAO')
const UserModel = require('models/UserModel')
const InterestModel = require('models/InterestModel')

class UserInterestDAO extends UserDAO {
  /**
   * ------------------------------
   * @METHODS
   * ------------------------------
   */
  static async getUserInterests (id) {
    assert.validate(id, UserModel.schema.id, { required: true })
    const data = await this.query()
      .eager('interests')
      .where({ id }).first()
    if (!data) throw this.errorEmptyResponse()

    return data.interests
  }

  static async patchInsert (id, interests) {
    assert.validate(id, UserModel.schema.id, { required: true })
    assert.validate(interests, InterestModel.schema.intrests, { required: true })

    let interestsQuery = []
    for (var i = 0; i < interests.length; i++) {
      interestsQuery.push({
        '#dbRef': interests[i]
      })
    }
    const data = await this.query()
      .upsertGraph({
        id: id,
        interests: interestsQuery
      }, { unrelate: true, allowRefs: true })
    if (!data) throw this.errorEmptyResponse()
    return data.interests
  }

  /**
   * ------------------------------
   * @HOOKS
   * ------------------------------
   */
  $formatJson (json) {
    json = super.$formatJson(json)
    // delete sensitive data from all queries
    delete json.createdAt
    delete json.updatedAt

    return json
  }
}

module.exports = UserInterestDAO
