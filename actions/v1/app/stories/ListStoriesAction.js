const BaseAction = require(__folders.actions + '/BaseAction')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const UserDAO = require(__folders.dao + '/UserDAO')
const StoryModel = require(__folders.models + '/StoryModel')
const { RequestRule, Rule } = require('backend-core')
const joi = require('@hapi/joi')
const { redisClient } = require(__folders.actions + '/RootProvider')

class ListStoriesAction extends BaseAction {
  static get accessTag () {
    return 'stories:list'
  }

  static get validationRules () {
    return {
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
        status: new RequestRule(StoryModel.schema.status, { required: false }),
        term: new RequestRule(new Rule({
          validator: term => (typeof term === 'string'),
          description: 'string;'
        })),
        type: new RequestRule(new Rule({
          validator: term => (typeof term === 'string' && term === 'ASSIGMENT'),
          description: 'string;ASSIGMENT'
        }))
      }
    }
  }

  static async run (req) {
    const { query, currentUser } = req
    const user = await UserDAO.baseGetById(currentUser.id)
    if (query.type) {
      query.filter['stories.type'] = query.type
    }

    if (query.status) {
      query.filter['stories.status'] = query.status
    }
    const data = await StoryDAO.getStoriesRequestsList({ ...query }, user, '[tags,owner,attachments]')
    const result = this.result({
      data: data.results,
      headers: { 'X-Total-Count': data.total }
    })
    redisClient.setKey(req.originalUrl, result)
    return result
  }
}

module.exports = ListStoriesAction
