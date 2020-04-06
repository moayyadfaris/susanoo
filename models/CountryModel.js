const joi = require('@hapi/joi')
const { BaseModel, Rule } = require('backend-core')
const isInt = require('validator/lib/isInt')

/**
 * @swagger
 * definitions:
 *   Country:
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
  niceName: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().min(3).max(80))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; min 3; max 80;'
  }),
  iso: new Rule({
    validator: v => typeof v === 'string' && v.length === 2,
    description: 'string; equals 2;'
  }),
  iso3: new Rule({
    validator: v => typeof v === 'string' && v.length === 3,
    description: 'string; equals 3;'
  }),
  numcode: new Rule({
    validator: v => isInt(v),
    description: 'integer;'
  }),
  phonecode: new Rule({
    validator: v => isInt(v),
    description: 'integer;'
  })
}

class CountryModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = CountryModel
