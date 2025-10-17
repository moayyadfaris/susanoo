const crypto = require('crypto')
const { RequestRule, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')

class PostCallbackHandler extends BaseHandler {
  static get accessTag() {
    return 'root:callback'
  }

  static get validationRules() {
    return {
      body: {
        source: new RequestRule(new Rule({
          validator: (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 100,
          description: 'string; identifies the callback source'
        }), { required: true }),
        eventType: new RequestRule(new Rule({
          validator: (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 100,
          description: 'string; event type name'
        }), { required: true }),
        payload: new RequestRule(new Rule({
          validator: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
          description: 'object; event payload'
        }), { required: true }),
        metadata: new RequestRule(new Rule({
          validator: (value) => value === undefined || (typeof value === 'object' && value !== null && !Array.isArray(value)),
          description: 'object; optional event metadata'
        }))
      }
    }
  }

  static async run(ctx) {
    const eventId = ctx.body.eventId || ctx.body.id || crypto.randomUUID()

    const acknowledgement = {
      eventId,
      receivedAt: new Date().toISOString(),
      requestId: ctx.requestId
    }

    this.logger.info('Inbound callback accepted', {
      eventId,
      source: ctx.body.source,
      eventType: ctx.body.eventType,
      requestId: ctx.requestId
    })

    return this.success(acknowledgement, 'Callback accepted for processing', { status: 202 })
  }
}

module.exports = PostCallbackHandler
