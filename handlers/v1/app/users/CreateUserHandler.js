const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserModel = require('models/UserModel')
const { getUserService } = require('../../../../services')
const logger = require('../../../../util/logger')

/**
 * CreateUserHandler - Service-backed user registration endpoint
 *
 * Features:
 * - Delegates business logic to `UserService.registerUser` to keep the handler lean
 * - Validates all critical fields (name, email, password, country, mobile) plus optional metadata
 * - Supports referral code tracking, device fingerprinting, and marketing consent flags
 * - Emits structured logs for observability around request lifecycle and performance
 * - Surfaces service-layer `ErrorWrapper` responses directly while wrapping unexpected errors
 *
 * Usage:
 * ```http
 * POST /api/v1/app/users
 * {
 *   "name": "Jane Doe",
 *   "email": "jane@example.com",
 *   "password": "Sup3rSecur3!",
 *   "countryId": 184,
 *   "mobileNumber": "5551234567",
 *   "acceptTerms": true,
 *   "deviceInfo": { "userAgent": "MyApp/1.0", "platform": "ios" }
 * }
 * ```
 * Successful responses mirror the service output (user summary, verification state,
 * onboarding guidance, etc.) wrapped by the standard handler `result()` helper.
 */
class CreateUserHandler extends BaseHandler {
  static get accessTag() {
    return 'users:create'
  }

  static get validationRules() {
    return {
      body: {
        name: new RequestRule(UserModel.schema.name, { required: true }),
        email: new RequestRule(UserModel.schema.email, { required: true }),
        countryId: new RequestRule(UserModel.schema.countryId, { required: true }),
        password: new RequestRule(UserModel.schema.passwordHash, { required: true }),
        mobileNumber: new RequestRule(UserModel.schema.mobileNumber, { required: true }),
        bio: new RequestRule(UserModel.schema.bio, { required: false }),
        preferredLanguage: new RequestRule(UserModel.schema.preferredLanguage, { required: false }),
        profileImageId: new RequestRule(UserModel.schema.profileImageId, { required: false }),
        acceptTerms: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; accept terms and conditions'
        }), { required: false }),
        acceptPrivacy: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; accept privacy policy'
        }), { required: false }),
        acceptMarketing: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; consent to marketing emails'
        }), { required: false }),
        referralCode: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length >= 4 && v.length <= 20,
          description: 'string; referral code; 4-20 characters'
        }), { required: false }),
        deviceInfo: new RequestRule(new Rule({
          validator: v => {
            if (typeof v !== 'object' || v === null) return false
            return typeof v.userAgent === 'string' || typeof v.platform === 'string'
          },
          description: 'object; device information with userAgent or platform'
        }), { required: false })
      }
    }
  }

  static async run(ctx) {
    const userService = getUserService()

    if (!userService) {
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'User registration service not available',
        layer: 'CreateUserHandler.run'
      })
    }

    const startTime = Date.now()
    const body = ctx.body || {}
    const logContext = {
      handler: 'CreateUserHandler',
      requestId: ctx.requestId,
      email: body.email,
      ip: ctx.ip
    }

    try {
      const result = await userService.registerUser(body, {
        requestId: ctx.requestId,
        ip: ctx.ip,
        headers: ctx.headers,
        userAgent: ctx.headers?.['user-agent'] || ctx.headers?.['User-Agent'],
        deviceInfo: body.deviceInfo
      })

      logger.info('User registration completed via service layer', {
        ...logContext,
        processingTime: Date.now() - startTime
      })

      return this.result(result)
    } catch (error) {
      logger.error('User registration failed via service layer', {
        ...logContext,
        error: error.message,
        stack: error.stack,
        processingTime: Date.now() - startTime
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'User registration failed',
        layer: 'CreateUserHandler.run',
        meta: {
          originalError: error.message,
          email: body.email
        }
      })
    }
  }
}

module.exports = CreateUserHandler
