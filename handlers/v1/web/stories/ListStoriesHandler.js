const BaseHandler = require(__folders.handlers + '/BaseHandler')
const StoryDAO = require(__folders.dao + '/StoryDAO')
const StoryModel = require(__folders.models + '/StoryModel')
const { RequestRule, Rule } = require('backend-core')
const joi = require('@hapi/joi')
const storyType = require(__folders.config).storyType
const roles = require(__folders.config).roles

class ListStoriesHandler extends BaseHandler {
  static get accessTag () {
    return 'web#stories:list'
  }

  static get validationRules () {
    return {
      query: {
        ...this.baseQueryParams,
        orderBy: new RequestRule(new Rule({
          validator: v => {
            const result = joi.object({
              field: joi.string().valid('id', 'createdAt', 'updatedAt', 'toTime'),
              direction: joi.string().valid('asc', 'desc')
            }).validate(v)
            return result.error && result.error.message || true
          },
          description: 'Object; { fields: createdAt,UpdatedAt, direction: asc || desc }'
        })),
        status: new RequestRule(StoryModel.schema.status, { required: true }),
        countryId: new RequestRule(StoryModel.schema.countryId),
        type: new RequestRule(StoryModel.schema.type),
        term: new RequestRule(new Rule({
          validator: term => (typeof term === 'string'),
          description: 'string;'
        }))
      }
    }
  }

  static async run (req) {
    const { currentUser, query } = req
    query.filterIn = {}

    if (query.countryId) {
      query.filter['countryId'] = query.countryId
    }

    if (query.type) {
      query.filter['type'] = query.type
    }
    if (currentUser.role === roles.seniorEditor) {
      if (query.status === 'SUBMITTED') {
        query.filterIn['type'] = [ storyType.story, storyType.tipOff ]
        query.filterIn['status'] = ['SUBMITTED', 'EXPIRED']
        query.filter['isInEditMode'] = true
      } else if (query.status === 'DRAFT') {
        query.filter['type'] = storyType.story
        query.filter['status'] = 'DRAFT'
      } else if (query.status === 'PENDING') {
        query.filter['type'] = storyType.story
        query.filter['status'] = 'PENDING'
      } else if (query.status === 'ARCHIVED') {
        query.filterIn['type'] = [storyType.story, storyType.tipOff, storyType.report]
        query.filter['status'] = 'ARCHIVED'
      } else {
        query.filterIn['type'] = [storyType.report, storyType.tipOff]
        if (query.status === 'IN_PROGRESS') {
          query.filterIn['status'] = ['ASSIGNED', 'IN_PROGRESS', 'FOR_REVIEW_SE']
          query.filter['isInEditMode'] = true
        } else {
          query.filter['status'] = query.status
        }
      }
    } else if (currentUser.role === roles.editor) {
      query.editorId = currentUser.id
      query.filterIn['type'] = [storyType.report, storyType.tipOff]
      if (query.status === 'ASSIGNED') {
        query.filter['isInEditMode'] = true
        query.filterIn['status'] = ['ASSIGNED']
      } else if (query.status === 'IN_PROGRESS') {
        query.filterIn['status'] = ['IN_PROGRESS', 'FOR_REVIEW_SE']
      } else if (query.status === 'APPROVED') {
        query.filterIn['status'] = ['APPROVED']
      } else if (query.status === 'ARCHIVED') {
        query.filter['status'] = 'ARCHIVED'
      }
    }

    const data = await StoryDAO.getListWeb({ ...query })
    return this.result({
      data: data.results,
      headers: { 'X-Total-Count': data.total }
    })
  }
}

module.exports = ListStoriesHandler
