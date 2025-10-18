const { errorCodes, ErrorWrapper, RequestRule, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const { getUserService } = require('../../../../services')
const validator = require('validator')

class CheckAvailabilityHandler extends BaseHandler {
  static get accessTag() {
    return 'users:check-availability'
  }

  static get validationRules() {
    return {
      body: {
        email: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && validator.isEmail(v) && v.length <= 100,
          description: 'string; valid email address; max 100 chars'
        }), { required: false }),

        phone: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length >= 7 && v.length <= 20,
          description: 'string; phone number; min 7 max 20 chars'
        }), { required: false }),

        email_or_mobile_number: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length >= 3 && v.length <= 100,
          description: 'string; email or mobile number; max 100 chars; LEGACY FORMAT'
        }), { required: false }),

        includeDetails: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; include detailed availability information'
        }), { required: false }),

        suggestions: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; generate alternative suggestions for unavailable fields'
        }), { required: false }),

        batch: new RequestRule(new Rule({
          validator: v => Array.isArray(v) && v.length <= 10,
          description: 'array; batch check multiple values; max 10 items'
        }), { required: false }),

        countryCode: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length === 2,
          description: 'string; ISO 2-letter country code for phone validation'
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
          layer: 'CheckAvailabilityHandler.run'
        })
      }

      const result = await userService.checkAvailability({
        body: ctx.body,
        ip: ctx.ip,
        headers: ctx.headers,
        requestId: ctx.requestId
      })

      return this.result(result)
    } catch (error) {
      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Availability check failed',
        layer: 'CheckAvailabilityHandler.run',
        meta: {
          originalError: error.message,
          requestId: ctx.requestId
        }
      })
    }
  }
}

module.exports = CheckAvailabilityHandler
