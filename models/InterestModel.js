const joi = require('joi')
const { BaseModel, Rule } = require('backend-core')
/**
 * @swagger
 * definitions:
 *   Interest:
 *     allOf:
 *       - required:
 *         - id
 *       - properties:
 *          id:
 *            type: integer
 *            format: int64
 *          name:
 *            type: string
 *          selected:
 *            type: number
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
    validator: value => {
      if (value === undefined || value === null) return 'Name is required'
      try {
        joi.assert(value, joi.string().trim().min(3).max(200))
      } catch (error) { return error.message }
      return true
    },
    description: 'string; min 3; max 200; required'
  }),
  title: new Rule({
    validator: value => {
      if (value === undefined || value === null) return true
      try {
        joi.assert(value, joi.string().trim().min(3).max(80))
      } catch (error) { return error.message }
      return true
    },
    description: 'string; min 3; max 80; optional legacy alias'
  }),
  interests: new Rule({
    validator: value => {
      if (value === undefined || value === null) return true
      try {
        joi.assert(value, joi.array().items(joi.number()))
      } catch (error) { return error.message }
      return true
    },
    description: 'Array of integers'
  }),
  metadata: new Rule({
    validator: value => {
      if (value === undefined || value === null) return true
      if (typeof value === 'object' && !Array.isArray(value)) return true
      return 'Metadata must be an object'
    },
    description: 'object'
  })
}

schema.intrests = schema.interests

class InterestModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = InterestModel
