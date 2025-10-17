const BaseHandler = require('handlers/BaseHandler')
const { getUserInterestService } = require('services')

class ListUserInterestsHandler extends BaseHandler {
  static get accessTag () {
    return 'user:interests:list'
  }

  static get validationRules () {
    return {
      query: {
        ...this.baseQueryParams
      }
    }
  }

  static async run (ctx) {
    const { currentUser, query } = ctx
    const service = getUserInterestService()
    const result = await service.listInterestsWithSelection({ ...query, limit: 100 }, { currentUser })
    return this.result({ data: result.data, headers: result.headers, meta: { pagination: result.pagination } })
  }
}

module.exports = ListUserInterestsHandler
