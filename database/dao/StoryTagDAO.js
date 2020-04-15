const StoryDAO = require('./StoryDAO')

class StoryTagDAO extends StoryDAO {
  /**
   * ------------------------------
   * @METHODS
   * ------------------------------
   */

  static async patchInsert (id, interests) {
    // todo
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

module.exports = StoryTagDAO
