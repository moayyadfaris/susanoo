const BaseAction = require(__folders.actions + '/BaseAction')
const CountryDAO = require(__folders.dao + '/CountryDAO')

class ListCountriesAction extends BaseAction {
  static get accessTag () {
    return 'web#countries:list'
  }

  static get validationRules () {
    return {
      query: {
        ...this.baseQueryParams
      }
    }
  }

  static async run (req) {
    const { query } = req

    // Todo skip query limit
    if (query.limit === 10) {
      query.limit = 1000
    }

    const data = await CountryDAO.baseGetList({ ...query })

    return this.result({
      data: data.results,
      headers: { 'X-Total-Count': data.total }
    })
  }
}

module.exports = ListCountriesAction
