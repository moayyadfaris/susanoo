const { assert } = require('backend-core')
const StoryDAO = require('database/dao/StoryDAO')
const StoryAttachmentModel = require('models/StoryAttachmentModel')
class StoryAttachmentDAO extends StoryDAO {
  static get tableName () {
    return 'story_attachments'
  }
  /**
   * ------------------------------
   * @METHODS
   * ------------------------------
   */
  static async prepareAttachmentInsertion (files) {
    assert.validate(files, StoryAttachmentModel.schema.attachmentsId, { required: true })

    let attachmentQuery = []
    for (var i = 0; i < files.length; i++) {
      attachmentQuery.push({
        '#dbRef': files[i]
      })
    }
    return attachmentQuery
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

module.exports = StoryAttachmentDAO
