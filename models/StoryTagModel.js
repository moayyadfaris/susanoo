const joi = require('joi')
const { BaseModel, Rule } = require('backend-core')

const StoryModel = require('./StoryModel')
const TagModel = require('./TagModel')

const schema = {
  storyId: StoryModel.schema.id,
  tagId: TagModel.schema.id,
  tags: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.array().items(joi.number()))
      } catch (e) { return e.message }
      return true
    },
    description: 'array of integer positive'
  })
}

class StoryTagModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = StoryTagModel
