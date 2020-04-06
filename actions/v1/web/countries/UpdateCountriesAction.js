const BaseAction = require(__folders.actions + '/BaseAction')
const CountryDAO = require(__folders.dao + '/CountryDAO')
const CountryModel = require(__folders.models + '/CountryModel')
const { RequestRule, Rule } = require('backend-core')

class ListCountriesAction extends BaseAction {
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

module.exports = ListCountriesAction
