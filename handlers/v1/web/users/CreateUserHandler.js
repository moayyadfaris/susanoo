const { RequestRule, errorCodes, ErrorWrapper } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserModel = require('models/UserModel')
const { getUserService } = require('../../../../services')
const logger = require('../../../../util/logger')
class CreateUserHandler extends BaseHandler {
  static get accessTag () {
    return 'web#users:create'
  }

  static get validationRules () {
    return {
      body: {
        name: new RequestRule(UserModel.schema.name, { required: true }),
        email: new RequestRule(UserModel.schema.email, { required: true }),
        password: new RequestRule(UserModel.schema.passwordHash, { required: true }),
        mobileNumber: new RequestRule(UserModel.schema.mobileNumber, { required: true }),
        countryId: new RequestRule(UserModel.schema.countryId)
      }
    }
  }

  static async run (ctx) {
    const userService = getUserService()

    if (!userService) {
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'User service not available',
        layer: 'WebCreateUserHandler.run'
      })
    }

    const logContext = {
      handler: 'WebCreateUserHandler',
      requestId: ctx.requestId,
      ip: ctx.ip,
      email: ctx.body.email
    }

    try {
      const result = await userService.registerUser(ctx.body, {
        requestId: ctx.requestId,
        ip: ctx.ip,
        headers: ctx.headers
      })

      logger.info('Web user registration initiated', {
        ...logContext,
        userId: result?.data?.id
      })

      return this.result({
        message: 'Account created. Please check your email to confirm your address.',
        data: {
          userId: result?.data?.id,
          email: ctx.body.email
        }
      })
    } catch (error) {
      logger.error('Web user registration failed', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'User registration failed',
        layer: 'WebCreateUserHandler.run',
        meta: {
          originalError: error.message
        }
      })
    }
  }
}

module.exports = CreateUserHandler
