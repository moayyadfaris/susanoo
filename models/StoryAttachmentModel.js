const joi = require('@hapi/joi')
const { BaseModel, Rule } = require('backend-core')

const StoryModel = require('./StoryModel')
const AttachmentModel = require('./AttachmentModel')

const schema = {
  userId: StoryModel.schema.id,
  interestId: AttachmentModel.schema.id,
  attachmentsId: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.array().items(joi.number()))
      } catch (e) { return e.message }
      return true
    },
    description: 'array of integer positive'
  })
}

class StoryAttachmentModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = StoryAttachmentModel
