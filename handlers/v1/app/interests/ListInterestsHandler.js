const BaseHandler = require('handlers/BaseHandler')
const InterestDAO = require('database/dao/InterestDAO')
const { redisClient } = require('handlers/RootProvider')
class ListInterestsHandler extends BaseHandler {
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

module.exports = ListInterestsHandler
