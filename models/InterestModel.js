const joi = require('@hapi/joi')
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
  title: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().min(3).max(80))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; min 3; max 80;'
  }),
  intrests: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.array().items(joi.number()))
      } catch (e) { return e.message }
      return true
    },
    description: 'Array on integers'
  })
}

class InterestModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = InterestModel
