const BaseAction = require(__folders.actions + '/BaseAction')
const CountryDAO = require(__folders.dao + '/CountryDAO')
const { redisClient } = require(__folders.actions + '/RootProvider')
class ListCountriesAction extends BaseAction {
  static get accessTag () {
    return 'countries:list'
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
    query.orderBy.field = 'name'
    query.orderBy.direction = 'asc'
    query.filter['isActive'] = true
    const data = await CountryDAO.baseGetList({ ...query })

    const result = this.result({
      data: data.results,
      headers: { 'X-Total-Count': data.total }
    })
    redisClient.setKey(req.originalUrl, result)
    return result
  }
}

module.exports = ListCountriesAction
