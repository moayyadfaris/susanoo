const BaseHandler = require('handlers/BaseHandler')
const CountryDAO = require('database/dao/CountryDAO')
const CountryModel = require('models/CountryModel')
const { RequestRule, Rule } = require('backend-core')

class ListCountriesHandler extends BaseHandler {
  static get accessTag () {
    return 'web#countries:update'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(CountryModel.schema.id, { required: true })
      },
      body: {
        isActive: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean;'
        })),
        isSanctioned: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean;'
        }))
      }
    }
  }

  static async run (req) {
    const data = await CountryDAO.baseUpdate(+req.params.id, { ...req.body })
    return this.result({
      data: data
    })
  }
}

module.exports = ListCountriesHandler
