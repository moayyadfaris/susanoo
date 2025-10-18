const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const InterestModel = require('models/InterestModel')
const { getInterestService } = require('services')

/**
 * Usage: PATCH /api/v1/interests/{id} { "name": "Travel & Adventure" }
 */
class UpdateInterestHandler extends BaseHandler {
  static get accessTag() {
    return 'interests:update'
  }

  static get validationRules() {
    return {
      params: {
        id: new RequestRule(new Rule({
          validator: value => Number.isInteger(Number(value)) && Number(value) > 0,
          description: 'positive integer'
        }), { required: true })
      },
      body: {
        name: new RequestRule(InterestModel.schema.name),
        metadata: new RequestRule(InterestModel.schema.metadata)
      }
    }
  }

  static async run(req) {
    const { id } = req.params
    if (!id) {
      throw new ErrorWrapper({ ...errorCodes.VALIDATION_FAILED, message: 'Interest id is required' })
    }

    let payload = req.body
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch (error) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION_FAILED,
          message: 'Invalid JSON payload',
          meta: { originalError: error.message }
        })
      }
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION_FAILED,
        message: 'Request body must be a JSON object'
      })
    }

    const interestService = getInterestService()
    const context = {
      userId: req.currentUser?.id || req.user?.id || null
    }

    const record = await interestService.updateInterest(id, payload, context)
    return this.updated(record, 'Interest updated successfully')
  }
}

module.exports = UpdateInterestHandler
