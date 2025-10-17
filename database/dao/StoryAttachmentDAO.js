const { BaseDAO, assert } = require('backend-core')
const StoryAttachmentModel = require('models/StoryAttachmentModel')

class StoryAttachmentDAO extends BaseDAO {
  static get tableName() {
    return 'story_attachments'
  }

  static async prepareAttachmentInsertion(attachmentIds) {
    assert.validate(attachmentIds, StoryAttachmentModel.schema.attachmentIds, { required: true })
    return attachmentIds.map(id => ({ '#dbRef': Number(id) }))
  }

  static async removeAttachment(storyId, attachmentId, trx = null) {
    return this.query(trx)
      .delete()
      .where({ storyId: Number(storyId), attachmentId: Number(attachmentId) })
  }
}

module.exports = StoryAttachmentDAO
