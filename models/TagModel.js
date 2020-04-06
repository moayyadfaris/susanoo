const joi = require('@hapi/joi')
const { BaseModel, Rule } = require('backend-core')
const UserModel = require('../models/UserModel')
/**
 * @swagger
 * definitions:
 *   Tag:
 *     allOf:
 *       - required:
 *         - id
 *       - properties:
 *          id:
 *            type: integer
 *            format: int64
 *          name:
 *            type: string
 */
const schema = {
  id: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.number().integer().positive())
      } catch (e) { return e.message }
      return true
    },
    description: 'number integer positive'
  }),
  name: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().min(3).max(80))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; min 3; max 80;'
  }),
  createdBy: UserModel.schema.id,
  tags: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.array().items(joi.integer()))
      } catch (e) { return e.message }
      return true
    },
    description: 'Array on integers'
  }),
  tagNames: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.array().items(joi.string()))
      } catch (e) { return e.message }
      return true
    },
    description: 'Array on strings'
  })
}

class TagModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = TagModel
