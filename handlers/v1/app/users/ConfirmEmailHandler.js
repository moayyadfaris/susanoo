const { RequestRule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserModel = require('models/UserModel')
const { errorCodes, ErrorWrapper } = require('backend-core')
const logger = require('util/logger')
const { getUserService } = require('../../../../services')

class ConfirmEmailHandler extends BaseHandler {
  static get accessTag () {
    return 'users:confirm-email'
  }

  static get validationRules () {
    return {
      body: {
        emailConfirmToken: new RequestRule(UserModel.schema.emailConfirmToken, { required: true })
      }
    }
  }

  static async run (ctx) {
    const userService = getUserService()

    if (!userService) {
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'User service not available',
        layer: 'ConfirmEmailHandler.run'
      })
    }

    const logContext = {
      handler: 'ConfirmEmailHandler',
      requestId: ctx.requestId,
      ip: ctx.ip
    }

    try {
      const result = await userService.confirmEmail(ctx.body.emailConfirmToken, {
        requestId: ctx.requestId,
        ip: ctx.ip
      })

      logger.info('User email confirmed via service layer', {
        ...logContext,
        userId: result?.data?.userId,
        email: result?.data?.email
      })

      return this.result(result)
    } catch (error) {
      logger.error('User email confirmation failed via service layer', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'User email confirmation failed',
        layer: 'ConfirmEmailHandler.run',
        meta: {
          originalError: error.message
        }
      })
    }
  }
}

module.exports = ConfirmEmailHandler
