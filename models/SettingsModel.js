const joi = require('joi')
const { BaseModel, Rule } = require('backend-core')

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
  key: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().min(1))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; min 1;'
  }),
  value: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().min(1))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; min 1;'
  })
}

class SettingsModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = SettingsModel
