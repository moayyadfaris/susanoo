const { RequestRule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserModel = require('models/UserModel')
const { getUserService } = require('../../../../services')
const logger = require('../../../../util/logger')

class ConfirmEmailByCodeHandler extends BaseHandler {
  static get accessTag() {
    return 'web#users:confirm-email'
  }

  static get validationRules() {
    return {
      body: {
        verifyCode: new RequestRule(UserModel.schema.verifyCode, { required: true }),
        email: new RequestRule(UserModel.schema.email, { required: true })
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
      const { verifyCode, email } = ctx.body
      const result = await userService.confirmEmail(verifyCode, {
        requestId: ctx.requestId,
        ip: ctx.ip,
        expectedEmail: email
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

module.exports = ConfirmEmailByCodeHandler
