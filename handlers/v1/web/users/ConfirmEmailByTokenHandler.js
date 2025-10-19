const { RequestRule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserModel = require('models/UserModel')
const { getUserService } = require('../../../../services')
const logger = require('../../../../util/logger')

class ConfirmEmailByTokenHandler extends BaseHandler {
  static get accessTag() {
    return 'web#users:confirm-email-by-token'
  }

  static get validationRules() {
    return {
      body: {
        emailConfirmToken: new RequestRule(UserModel.schema.emailConfirmToken, { required: true })
      }
    }
  }

  static async run(ctx) {
    const userService = getUserService()

    if (!userService) {
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'User service not available',
        layer: 'WebConfirmEmailHandler.run'
      })
    }

    const logContext = {
      handler: 'WebConfirmEmailHandler',
      requestId: ctx.requestId,
      ip: ctx.ip,
      email: ctx.body.email
    }

    try {
      const { emailConfirmToken } = ctx.body
      const result = await userService.confirmEmail(emailConfirmToken, {
        requestId: ctx.requestId,
        ip: ctx.ip
      })

      logger.info('Web user email confirmed', {
        ...logContext,
        userId: result?.data?.userId,
        confirmedEmail: result?.data?.email
      })

      return this.result({
        message: 'Email confirmed successfully.',
        data: result.data
      })
    } catch (error) {
      logger.error('Web user email confirmation failed', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Email confirmation failed',
        layer: 'WebConfirmEmailHandler.run',
        meta: {
          originalError: error.message
        }
      })
    }
  }
}

module.exports = ConfirmEmailByTokenHandler
