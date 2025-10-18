const BaseHandler = require('handlers/BaseHandler')
const { RequestRule } = require('backend-core')
const InterestModel = require('models/InterestModel')
const { getInterestService } = require('services')

/**
 * Usage: POST /api/v1/interests { "name": "Travel", "metadata": { "icon": "✈️" } }
 */
class CreateInterestHandler extends BaseHandler {
  static get accessTag() {
    return 'interests:create'
  }

  static get validationRules() {
    return {
      body: {
        name: new RequestRule(InterestModel.schema.name, { required: true }),
        metadata: new RequestRule(InterestModel.schema.metadata)
      }
    }
  }

  static async run(req) {
    let payload = req.body

    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch (error) {
        return this.error('Invalid JSON payload', 400, null, {
          code: 'INVALID_PAYLOAD',
          meta: { originalError: error.message }
        })
      }
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return this.error('Request body must be a JSON object', 400, null, {
        code: 'INVALID_PAYLOAD'
      })
    }

    const interestService = getInterestService()
    const context = {
      userId: req.currentUser?.id || req.user?.id || null
    }

    const record = await interestService.createInterest(payload, context)
    return this.created(record, 'Interest created successfully')
  }
}

module.exports = CreateInterestHandler
