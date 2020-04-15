const BaseHandler = require(__folders.handlers + '/BaseHandler')
const InterestDAO = require(__folders.dao + '/InterestDAO')
class ListInterestsHandler extends BaseHandler {
  static get accessTag () {
    return 'web#interests:list'
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

    const data = await InterestDAO.baseGetList({ ...query })

    return this.result({
      data: data.results,
      headers: { 'X-Total-Count': data.total }
    })
  }
}

module.exports = ListInterestsHandler
