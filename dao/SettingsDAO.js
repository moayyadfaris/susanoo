const { BaseDAO } = require('backend-core')

class SettingsDAO extends BaseDAO {
  static get tableName () {
    return 'settings'
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

  static async upsertKey (key, value) {
    let settings = await this.query().where({ key }).first()
    if (settings) {
      settings = await this.baseUpdate(settings.id, { value })
    } else {
      settings = await this.baseCreate({ key, value })
    }
    return settings
  }

  static async getByKey (key) {
    return await this.query().where({ key }).first()
  }
}

module.exports = SettingsDAO
