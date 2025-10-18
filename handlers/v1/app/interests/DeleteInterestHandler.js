const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const { getInterestService } = require('services')

/**
 * Usage: DELETE /api/v1/interests/{id}
 */
class DeleteInterestHandler extends BaseHandler {
  static get accessTag() {
    return 'interests:delete'
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
    const context = {
      userId: req.currentUser?.id || req.user?.id || null
    }

    const result = await interestService.deleteInterest(id, context)
    return this.success(result, 'Interest deleted successfully')
  }
}

module.exports = DeleteInterestHandler
