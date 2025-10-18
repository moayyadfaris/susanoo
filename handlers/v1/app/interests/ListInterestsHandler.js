const BaseHandler = require('handlers/BaseHandler')
const { redisClient } = require('handlers/RootProvider')
const { getInterestService } = require('services')

/**
 * Usage: GET /api/v1/interests?search=travel&limit=50&page=0
 */
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
    const interestService = getInterestService()
    const listResult = await interestService.listInterests(req.query || {})

    const response = this.result({
      data: listResult.results,
      headers: { 'X-Total-Count': listResult.total },
      meta: {
        pagination: {
          page: listResult.page,
          limit: listResult.limit,
          total: listResult.total,
          pages: Math.ceil(listResult.total / (listResult.limit || 1))
        }
      }
    })

    redisClient.setKey(req.originalUrl, response)
    return response
  }
}

module.exports = ListInterestsHandler
