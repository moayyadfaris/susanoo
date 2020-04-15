const { RequestRule } = require('backend-core')
const joi = require('@hapi/joi')
const roles = require(__folders.config).roles
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
const { Rule } = require('backend-core')
/**
 * @description return users list
 */
class ListUsersHandler extends BaseHandler {
  static get accessTag () {
    return 'web#users:list'
  }

  static get validationRules () {
    return {
      query: {
        ...this.baseQueryParams,
        orderBy: new RequestRule(new Rule({
          validator: v => {
            const result = joi.object({
              field: joi.string().valid('id', 'createdAt', 'numberOfStories'),
              direction: joi.string().valid('asc', 'desc')
            }).validate(v)
            return result.error && result.error.message || true
          },
          description: 'Object; { field: id, createdAt,numberOfStories : asc || desc }'
        })),
        role: new RequestRule(UserModel.schema.role, { required: true }),
        term: new RequestRule(new Rule({
          validator: term => (typeof term === 'string'),
          description: 'string;'
        })),
        interests: new RequestRule(new Rule({
          validator: term => (typeof term === 'string'),
          description: 'string;'
        })),
        countryId: new RequestRule(new Rule({
          validator: countryId => (typeof countryId === 'string'),
          description: 'string;'
        }))
      }
    }
  }

  static async run (req) {
    const { query } = req
    query.filter['role'] = query.role

    if (query.role !== roles.editor) {
      query.filter['isVerified'] = 1
    }

    if (query.countryId) {
      query.filter['countryId'] = query.countryId
    }

    if (query.interests) {
      query.interests = req.query.interests.split(',')
    }

    const data = await UserDAO.getUsers({ ...query }, '[profileImage]')
    return this.result({
      data: data.results,
      headers: {
        'X-Total-Count': data.total
      }
    })
  }
}

module.exports = ListUsersHandler
