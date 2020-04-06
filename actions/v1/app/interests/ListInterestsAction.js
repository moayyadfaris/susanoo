const BaseAction = require(__folders.actions + '/BaseAction')
const InterestDAO = require(__folders.dao + '/InterestDAO')
const { redisClient } = require(__folders.actions + '/RootProvider')
class ListInterestsAction extends BaseAction {
  static get accessTag () {
    return 'interests:list'
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

    const data = await InterestDAO.baseGetList({ ...query })

    const result = this.result({
      data: data.results,
      headers: { 'X-Total-Count': data.total }
    })

    redisClient.setKey(req.originalUrl, result)
    return result
  }
}

module.exports = ListInterestsAction
