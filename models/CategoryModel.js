const joi = require('joi')
const { BaseModel, Rule } = require('backend-core')

const schema = {
  id: new Rule({
    validator: (value) => {
      try {
        joi.assert(value, joi.string().guid({ version: ['uuidv4'] }))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'uuid v4'
  }),
  name: new Rule({
    validator: (value) => {
      try {
        joi.assert(value, joi.string().trim().min(2).max(120))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'string; min 2; max 120'
  }),
  slug: new Rule({
    validator: (value) => {
      try {
        joi.assert(value, joi.string().trim().min(2).max(140).regex(/^[a-z0-9-]+$/))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'string; kebab-case slug; min 2; max 140'
  }),
  description: new Rule({
    validator: (value) => {
      if (value === undefined || value === null) return true
      try {
        joi.assert(value, joi.string().max(500))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'string; max 500'
  }),
  isActive: new Rule({
    validator: (value) => value === undefined || typeof value === 'boolean',
    description: 'boolean'
  }),
  metadata: new Rule({
    validator: (value) => value === undefined || (typeof value === 'object' && value !== null && !Array.isArray(value)),
    description: 'object'
  })
}

class CategoryModel extends BaseModel {
  static get schema() {
    return schema
  }
}

module.exports = CategoryModel
