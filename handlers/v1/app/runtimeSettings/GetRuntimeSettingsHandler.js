const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule } = require('backend-core')
const { getRuntimeSettingsService } = require('services')

class GetRuntimeSettingsHandler extends BaseHandler {
  static get accessTag() {
    return 'runtime-settings:get'
  }

  static get validationRules() {
    return {
      query: {
        appVersion: new RequestRule(new Rule({
          validator: (value, ctx) => {
            if (!value && !ctx.version) {
              return 'appVersion or version query parameter is required'
            }
            if (value) {
              if (!/^\d+(\.\d+){0,2}$/.test(value)) {
                return 'Version must follow semantic versioning (major.minor.patch)'
              }
            }
            return true
          },
          description: 'semantic version string'
        })),
        version: new RequestRule(new Rule({
          validator: (value, ctx) => {
            if (!value && !ctx.appVersion) {
              return 'appVersion or version query parameter is required'
            }
            if (value && !/^\d+(\.\d+){0,2}$/.test(value)) {
              return 'Version must follow semantic versioning (major.minor.patch)'
            }
            return true
          },
          description: 'semantic version string'
        })),
        platform: new RequestRule(new Rule({
          validator: (value) => {
            if (!value) return true
            return ['ios', 'android', 'web', 'desktop', 'all'].includes(value.toLowerCase()) ||
              'platform must be one of ios, android, web, desktop, all'
          },
          description: 'string; ios|android|web|desktop|all'
        })),
        namespace: new RequestRule(new Rule({
          validator: (value) => !value || typeof value === 'string',
          description: 'string'
        })),
        channel: new RequestRule(new Rule({
          validator: (value) => !value || typeof value === 'string',
          description: 'string'
        })),
        environment: new RequestRule(new Rule({
          validator: (value) => !value || typeof value === 'string',
          description: 'string'
        })),
        includeDraft: new RequestRule(new Rule({
          validator: (value) => value === undefined || value === 'true' || value === 'false',
          description: 'boolean'
        })),
        skipCache: new RequestRule(new Rule({
          validator: (value) => value === undefined || value === 'true' || value === 'false',
          description: 'boolean'
        }))
      }
    }
  }

  static async run(req) {
    const runtimeSettingsService = getRuntimeSettingsService()

    const query = req.query || {}
    const appVersion = query.appVersion || query.version
    const platform = query.platform || req.headers['x-runtime-platform'] || undefined
    const environment = query.environment || req.headers['x-runtime-environment'] || runtimeSettings.defaultEnvironment
    const rolloutSeed = req.headers['x-runtime-rollout-seed'] || req.currentUser?.id || req.user?.id || req.ip

    const payload = {
      appVersion,
      platform,
      environment,
      namespace: query.namespace,
      channel: query.channel,
      includeDraft: query.includeDraft === 'true',
      skipCache: query.skipCache === 'true',
      rolloutSeed
    }

    if (query.appVersionCode) {
      const parsedCode = parseInt(query.appVersionCode, 10)
      if (!Number.isNaN(parsedCode)) {
        payload.appVersionCode = parsedCode
      }
    }

    const settings = await runtimeSettingsService.getCurrentSettings(payload)

    return this.result({
      data: {
        fetchedAt: new Date().toISOString(),
        environment: payload.environment,
        platform: platform || 'all',
        namespace: query.namespace || null,
        settings
      }
    })
  }
}

module.exports = GetRuntimeSettingsHandler
