const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const UserDAO = require(__folders.dao + '/UserDAO')
const AttachmentModel = require(__folders.models + '/AttachmentModel')
const AttachmentDAO = require(__folders.dao + '/AttachmentDAO')

class UpdateUserHandler extends BaseHandler {
  static get accessTag () {
    return 'web#users:upload-profile-image'
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
    const data = await AttachmentDAO.baseCreate({ 'userId': currentUser.id, 'path': req.file.key, 'mimeType': req.file.mimetype, 'size': req.file.size })
    await UserDAO.baseUpdate(currentUser.id, { profileImageId: data.id })
    return this.result({ 'data': data })
  }
}

module.exports = UpdateUserHandler
