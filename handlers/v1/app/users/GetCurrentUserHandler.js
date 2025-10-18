const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const { getUserService } = require('../../../../services')

class GetCurrentUserHandler extends BaseHandler {
  static get accessTag() {
    return 'users:get-current-user'
  }

  static get validationRules() {
    return {
      query: {
        include: new RequestRule(new Rule({
          validator: v => typeof v === 'string',
          description: 'string; comma-separated list of relations to include'
        }), { required: false }),
        format: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && ['full', 'summary', 'minimal'].includes(v),
          description: 'string; response format: full, summary, or minimal'
        }), { required: false }),
        refresh: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; force refresh of cached data'
        }), { required: false })
      }
    }
  }

  static async run(ctx) {
    try {
      const userService = getUserService()
      if (!userService) {
        throw new ErrorWrapper({
          ...errorCodes.INTERNAL_SERVER_ERROR,
          message: 'User service not available',
          layer: 'GetCurrentUserHandler.run'
        })
      }

      const result = await userService.getCurrentUser({
        currentUser: ctx.currentUser,
        query: ctx.query,
        requestId: ctx.requestId,
        ip: ctx.ip,
        headers: ctx.headers
      })

      return this.result(result)
    } catch (error) {
      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Current user retrieval failed',
        layer: 'GetCurrentUserHandler.run',
        meta: {
          originalError: error.message,
          userId: ctx.currentUser?.id,
          requestId: ctx.requestId
        }
      })
    }
  }
}

module.exports = GetCurrentUserHandler
