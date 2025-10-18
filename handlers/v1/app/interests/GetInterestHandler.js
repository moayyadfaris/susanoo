const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const { getInterestService } = require('services')

/**
 * Usage: GET /api/v1/interests/{id}
 */
class GetInterestHandler extends BaseHandler {
  static get accessTag() {
    return 'interests:view'
  }

  static get validationRules() {
    return {
      params: {
        id: new RequestRule(new Rule({
          validator: value => Number.isInteger(Number(value)) && Number(value) > 0,
          description: 'positive integer'
        }), { required: true })
      }
    }
  }

  static async run(req) {
    const { id } = req.params
    if (!id) {
      throw new ErrorWrapper({ ...errorCodes.VALIDATION_FAILED, message: 'Interest id is required' })
    }

    const interestService = getInterestService()
    const interest = await interestService.getInterestById(id)

    return this.success(interest, 'Interest retrieved successfully')
  }
}

module.exports = GetInterestHandler
