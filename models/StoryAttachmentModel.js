const joi = require('joi')
const { BaseModel, Rule } = require('backend-core')

const schema = {
  storyId: new Rule({
    validator: (value) => {
      try {
        joi.assert(value, joi.number().integer().positive())
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'Positive integer representing the story identifier'
  }),
  attachmentId: new Rule({
    validator: (value) => {
      try {
        joi.assert(value, joi.number().integer().positive())
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'Positive integer representing the attachment identifier'
  }),
  attachmentIds: new Rule({
    validator: (value) => {
      try {
        joi.assert(value, joi.array().items(joi.number().integer().positive()).min(1))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'Array of positive attachment identifiers'
  })
}

class StoryAttachmentModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = StoryAttachmentModel
