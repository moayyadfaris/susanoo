const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserModel = require('models/UserModel')
const { getUserService } = require('../../../../services')
const logger = require('util/logger')

class GetUserByIdHandler extends BaseHandler {
  static get accessTag() {
    return 'users:get-by-id'
  }

  static get validationRules() {
    return {
      params: {
        id: new RequestRule(UserModel.schema.id, { required: true })
      },
      query: {
        fields: new RequestRule(new Rule({
          validator: v => typeof v === 'string',
          description: 'string; comma-separated list of fields to include'
        }), { required: false }),
        include: new RequestRule(new Rule({
          validator: v => typeof v === 'string',
          description: 'string; comma-separated list of relations to include'
        }), { required: false }),
        format: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && ['full', 'summary', 'public'].includes(v),
          description: 'string; response format: full, summary, or public'
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
          layer: 'GetUserByIdHandler.run'
        })
      }

      const result = await userService.getUserById({
        userId: ctx.params.id,
        query: ctx.query,
        currentUser: ctx.currentUser,
        requestId: ctx.requestId,
        ip: ctx.ip,
        headers: ctx.headers
      })

      return this.result(result)
    } catch (error) {
      logger.error('User retrieval failed', {
        userId: ctx.params.id,
        requestedBy: ctx.currentUser?.id,
        requestId: ctx.requestId,
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'User retrieval failed',
        layer: 'GetUserByIdHandler.run',
        meta: {
          originalError: error.message,
          userId: ctx.params.id,
          requestId: ctx.requestId
        }
      })
    }
  }
}

module.exports = GetUserByIdHandler
