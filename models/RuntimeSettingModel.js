const joi = require('joi')
const { BaseModel, Rule } = require('backend-core')

const versionSchema = joi.string().regex(/^\d+(\.\d+){0,2}$/)

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
  namespace: new Rule({
    validator: (value) => {
      try {
        joi.assert(value, joi.string().trim().min(1).max(100))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'string; min 1; max 100'
  }),
  key: new Rule({
    validator: (value) => {
      try {
        joi.assert(value, joi.string().trim().min(1).max(150))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'string; min 1; max 150'
  }),
  value: new Rule({
    validator: (value) => {
      try {
        joi.assert(value, joi.object())
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'object'
  }),
  platform: new Rule({
    validator: (value) => {
      if (value === null || value === undefined) return true
      try {
        joi.assert(value, joi.string().valid('ios', 'android', 'web', 'desktop', 'all'))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'string; one of ios, android, web, desktop, all'
  }),
  environment: new Rule({
    validator: (value) => {
      if (value === null || value === undefined) return true
      try {
        joi.assert(value, joi.string().trim().min(2).max(50))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'string; min 2; max 50'
  }),
  channel: new Rule({
    validator: (value) => {
      if (!value) return true
      try {
        joi.assert(value, joi.string().trim().max(100))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'string; max 100'
  }),
  minVersion: new Rule({
    validator: (value) => {
      if (!value) return true
      try {
        joi.assert(value, versionSchema)
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'string matching semver (major.minor.patch)'
  }),
  maxVersion: new Rule({
    validator: (value) => {
      if (!value) return true
      try {
        joi.assert(value, versionSchema)
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'string matching semver (major.minor.patch)'
  }),
  status: new Rule({
    validator: (value) => {
      try {
        joi.assert(value, joi.string().valid('draft', 'published', 'retired'))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'string; one of draft, published, retired'
  }),
  rolloutStrategy: new Rule({
    validator: (value) => {
      if (!value) return true
      try {
        joi.assert(value, joi.object({
          mode: joi.string().valid('percentage', 'cohort', 'toggle').required(),
          percentage: joi.number().min(0).max(100),
          cohorts: joi.array().items(joi.string()),
          seedProperty: joi.string()
        }).unknown(true))
      } catch (error) {
        return error.message
      }
      return true
    },
    description: 'object; rollout definition'
  })
}

class RuntimeSettingModel extends BaseModel {
  static get schema() {
    return schema
  }
}

module.exports = RuntimeSettingModel
