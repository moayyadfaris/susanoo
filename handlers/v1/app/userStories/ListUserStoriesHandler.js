const BaseHandler = require(__folders.handlers + '/BaseHandler')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const StoryModel = require(__folders.models + '/StoryModel')
const { RequestRule, Rule } = require('backend-core')
const joi = require('@hapi/joi')

class ListUserStoriesHandler extends BaseHandler {
  static get accessTag () {
    return 'user:stories:list'
  }

  static get validationRules () {
    return {
      query: {
        ...this.baseQueryParams,
        orderBy: new RequestRule(new Rule({
          validator: v => {
            const result = joi.object({
              field: joi.string().valid('id', 'createdAt'),
              direction: joi.string().valid('asc', 'desc')
            }).validate(v)
            return result.error && result.error.message || true
          },
          description: 'Object; { field: username, direction: asc || desc }'
        })),
        status: new RequestRule(StoryModel.schema.status),
        term: new RequestRule(new Rule({
          validator: term => (typeof term === 'string'),
          description: 'string;'
        }))
      }
    }
  }

  static async run (req) {
    const { query, currentUser } = req

    query.filter = { 'userId': currentUser.id }
    if (query.status === 'IN_PROGRESS') {
      query.filterIn = { key: 'status', value: ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'FOR_REVIEW_SE'] }
    } else {
      query.filter['status'] = query.status
    }

    const data = await StoryDAO.getList({ ...query })
    return this.result({
      data: data.results,
      headers: { 'X-Total-Count': data.total }
    })
  }
}

module.exports = ListUserStoriesHandler
