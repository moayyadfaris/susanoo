const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const Rule = require('../core/Rule')
const UserModel = require('../../models/UserModel')

class TemplateHandler extends BaseHandler {
  static get accessTag () {
    return 'template:template'
  }

  static get validationRules () {
    return {
      params: {},
      query: {
        ...this.baseQueryParams
      },
      body: {
        id: new RequestRule(UserModel.schema.id, { required: true }),
        name: new RequestRule(UserModel.schema.name),
        test: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length >= 8,
          description: 'string; min 8 chars;'
        }))
      }
    }
  }

  static run (ctx) {
    return this.result({})
  }
}

module.exports = TemplateHandler
