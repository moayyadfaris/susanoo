const { BaseDAO } = require('backend-core')

/**
 * Minimal EditorDAO to satisfy StoryDAO relation mapping.
 * The actual schema can be expanded when editor specific logic is implemented.
 */
class EditorDAO extends BaseDAO {
  static get tableName () {
    return 'editors'
  }
}

module.exports = EditorDAO
