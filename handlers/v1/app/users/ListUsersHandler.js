const { RequestRule } = require('backend-core')
const joi = require('@hapi/joi')

const BaseHandler = require(__folders.handlers + '/BaseHandler')
const UserDAO = require(__folders.dao + '/UserDAO')
const { Rule } = require('backend-core')

/**
 * @description return users list
 */
class ListUsersHandler extends BaseHandler {
  static get accessTag () {
    return 'users:list'
  }

  static get validationRules () {
    return {
      query: {
        ...this.baseQueryParams,
        orderByField: new RequestRule(new Rule({
          validator: v => {
            const result = joi.string().valid('createdAt', 'id').validate(v)
            return result.error && result.error.message || true
          },
          description: 'Object; { field: name, direction: asc || desc }'
        })),
        orderByDirection: new RequestRule(new Rule({
          validator: v => {
            const result = joi.string().valid('asc', 'desc').validate(v)
            return result.error && result.error.message || true
          },
          description: 'Object; { field: name, direction: asc || desc }'
        })),
        filter: new RequestRule(new Rule({
          validator: v => {
            const result = joi.object({
              name: joi.string().min(2)
            }, e => e ? e.message : true)
            return result.error && result.error.message || true
          },
          description: 'String; min 2 chars;'
        }))
      }
    }
  }

  static async run (req) {
    const { query } = req
    const data = await UserDAO.baseGetList({ ...query })

    return this.result({
      data: data.results,
      headers: {
        'X-Total-Count': data.total
      }
    })
  }
}

module.exports = ListUsersHandler
