const BaseHandler = require('handlers/BaseHandler')
const StoryModel = require('models/StoryModel')
const { RequestRule, Rule } = require('backend-core')
const joi = require('joi')
const { getStoryService } = require('services')

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

    // Prepare query for service layer
    const serviceQuery = { ...query }
    // Enforce current user scope
    serviceQuery.userId = currentUser.id
    // Map special IN_PROGRESS pseudo-status to concrete statuses
    if (serviceQuery.status === 'IN_PROGRESS') {
      serviceQuery.status = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'FOR_REVIEW_SE']
    }

    const storyService = getStoryService()
    const serviceResult = await storyService.listStories(serviceQuery, { currentUser })

    return this.result({
      data: serviceResult.data,
      headers: serviceResult.headers,
      // Preserve pagination details inside meta for clients that expect it
      meta: { ...(serviceResult.meta || {}), pagination: serviceResult.pagination }
    })
  }
}

module.exports = ListUserStoriesHandler
