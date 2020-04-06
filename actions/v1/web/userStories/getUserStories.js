const BaseAction = require(__folders.actions + '/BaseAction')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const UserModel = require(__folders.models + '/UserModel')
const { RequestRule, Rule } = require('backend-core')
const joi = require('@hapi/joi')

class getUserStories extends BaseAction {
  static get accessTag () {
    return 'web#users:list-stories'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(UserModel.schema.id, { required: true })
      },
      query: {
        ...this.baseQueryParams,
        orderBy: new RequestRule(new Rule({
          validator: v => {
            const result = joi.object({
              field: joi.string().valid('id', 'createdAt', 'toTime'),
              direction: joi.string().valid('asc', 'desc')
            }).validate(v)
            return result.error && result.error.message || true
          },
          description: 'Object; { field: username, direction: asc || desc }'
        })),
        term: new RequestRule(new Rule({
          validator: term => (typeof term === 'string'),
          description: 'string;'
        }))
      }
    }
  }

  static async run (req) {
    const { query } = req
    query.filter['status'] = 'PUBLISHED'
    query.filter['stories.userId'] = req.params.id

    const data = await StoryDAO.getListWeb({ ...query })

    return this.result({
      data: data.results,
      headers: { 'X-Total-Count': data.total }
    })
  }
}

module.exports = getUserStories
