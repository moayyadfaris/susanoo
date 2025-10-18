const { RequestRule, errorCodes, ErrorWrapper } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserModel = require('models/UserModel')
const logger = require('util/logger')
const { getUserService } = require('../../../../services')

class ConfirmRegistrationHandler extends BaseHandler {
  static get accessTag () {
    return 'users:confirm-registration'
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
        layer: 'ConfirmRegistrationHandler.run'
      })
    }

    const logContext = {
      handler: 'ConfirmRegistrationHandler',
      requestId: ctx.requestId,
      ip: ctx.ip
    }

    try {
      const result = await userService.confirmRegistration(ctx.body.emailConfirmToken, {
        requestId: ctx.requestId,
        ip: ctx.ip
      })

      logger.info('User registration confirmed via service layer', {
        ...logContext,
        userId: result?.data?.userId
      })

      return this.result(result)
    } catch (error) {
      logger.error('User registration confirmation failed', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'User registration confirmation failed',
        layer: 'ConfirmRegistrationHandler.run',
        meta: {
          originalError: error.message
        }
      })
    }
  }
}

module.exports = ConfirmRegistrationHandler
