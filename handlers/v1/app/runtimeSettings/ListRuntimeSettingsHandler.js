const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule } = require('backend-core')
const { getRuntimeSettingsService } = require('services')

class ListRuntimeSettingsHandler extends BaseHandler {
  static get accessTag() {
    return 'runtime-settings:list'
  }

  static get validationRules() {
    return {
      query: {
        page: new RequestRule(new Rule({
          validator: (value) => value === undefined || !Number.isNaN(parseInt(value, 10)),
          description: 'number'
        })),
        limit: new RequestRule(new Rule({
          validator: (value) => value === undefined || !Number.isNaN(parseInt(value, 10)),
          description: 'number'
        })),
        namespace: new RequestRule(new Rule({
          validator: (value) => !value || typeof value === 'string',
          description: 'string'
        })),
        status: new RequestRule(new Rule({
          validator: (value) => !value || ['draft', 'published', 'retired'].includes(value),
          description: 'string'
        })),
        environment: new RequestRule(new Rule({
          validator: (value) => !value || typeof value === 'string',
          description: 'string'
        })),
        platform: new RequestRule(new Rule({
          validator: (value) => !value || ['ios', 'android', 'web', 'desktop', 'all'].includes(value.toLowerCase()),
          description: 'string'
        })),
        search: new RequestRule(new Rule({
          validator: (value) => !value || typeof value === 'string',
          description: 'string'
        }))
      }
    }
  }

  static async run(req) {
    const runtimeSettingsService = getRuntimeSettingsService()

    const page = parseInt(req.query.page || '0', 10)
    const limit = Math.min(parseInt(req.query.limit || '25', 10), 100)

    const results = await runtimeSettingsService.listSettings({
      page,
      limit,
      namespace: req.query.namespace,
      status: req.query.status,
      environment: req.query.environment,
      platform: req.query.platform,
      search: req.query.search
    })

    return this.result({
      data: results.results,
      meta: {
        page,
        limit,
        total: results.total,
        pages: Math.ceil(results.total / limit)
      }
    })
  }
}

module.exports = ListRuntimeSettingsHandler
