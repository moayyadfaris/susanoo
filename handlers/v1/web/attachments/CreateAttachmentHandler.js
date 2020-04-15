const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const AttachmentDAO = require(__folders.dao + '/AttachmentDAO')
const AttachmentModel = require(__folders.models + '/AttachmentModel')

class CreateAttachmentHandler extends BaseHandler {
  static get accessTag () {
    return 'web#attachments:create'
  }

  static get validationRules () {
    return {
      file: {
        key: new RequestRule(AttachmentModel.schema.path, { required: true }),
        mimetype: new RequestRule(AttachmentModel.schema.mimeType, { required: true }),
        size: new RequestRule(AttachmentModel.schema.size, { required: true })
      }
    }
  }

  static async run (req) {
    const { currentUser } = req
    const data = await AttachmentDAO.baseCreate({ 'userId': currentUser.id, 'path': req.file.key, 'mimeType': req.file.mimetype, 'size': req.file.size, 'originalName': req.file.originalname })
    return this.result({ 'data': data })
  }
}

module.exports = CreateAttachmentHandler
