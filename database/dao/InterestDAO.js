const { BaseDAO } = require('backend-core')

class InterestDAO extends BaseDAO {
  static get tableName () {
    return 'interests'
  }

  static get relationMappings () {
    return {
      users: {
        relation: BaseDAO.ManyToManyRelation,
        modelClass: `${__dirname}/UserDAO`,
        join: {
          from: 'interests.id',
          through: {
            // user_interests is the join table.
            from: 'user_interests.interestId',
            to: 'user_interests.userId'
          },
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
    // delete sensitive data from all queries
    delete json.createdAt
    delete json.updatedAt

    return json
  }
}

module.exports = InterestDAO
