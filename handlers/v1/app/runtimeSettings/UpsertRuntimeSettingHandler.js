const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const RuntimeSettingModel = require('models/RuntimeSettingModel')
const { getRuntimeSettingsService } = require('services')

class UpsertRuntimeSettingHandler extends BaseHandler {
  static get accessTag() {
    return 'runtime-settings:write'
  }

  static get validationRules() {
    return {
      body: {
        namespace: new RequestRule(RuntimeSettingModel.schema.namespace),
        key: new RequestRule(RuntimeSettingModel.schema.key),
        value: new RequestRule(RuntimeSettingModel.schema.value),
        platform: new RequestRule(RuntimeSettingModel.schema.platform),
        environment: new RequestRule(RuntimeSettingModel.schema.environment),
        channel: new RequestRule(RuntimeSettingModel.schema.channel),
        minVersion: new RequestRule(RuntimeSettingModel.schema.minVersion),
        maxVersion: new RequestRule(RuntimeSettingModel.schema.maxVersion),
        status: new RequestRule(RuntimeSettingModel.schema.status),
        rolloutStrategy: new RequestRule(RuntimeSettingModel.schema.rolloutStrategy),
        priority: new RequestRule(new Rule({
          validator: (value) => value === undefined || !Number.isNaN(parseInt(value, 10)),
          description: 'number'
        })),
        effectiveAt: new RequestRule(new Rule({
          validator: (value) => !value || !Number.isNaN(Date.parse(value)),
          description: 'ISO timestamp'
        })),
        expiresAt: new RequestRule(new Rule({
          validator: (value) => !value || !Number.isNaN(Date.parse(value)),
          description: 'ISO timestamp'
        }))
      }
    }
  }

  static async run(req) {
    const runtimeSettingsService = getRuntimeSettingsService()

    const resourceId = req.params?.id || req.body.id
    const encryptFlag = req.body.encrypt === true || req.body.encrypt === 'true'

    let valuePayload = req.body.value
    if (typeof valuePayload === 'string') {
      try {
        valuePayload = JSON.parse(valuePayload)
      } catch (error) {
        throw new ErrorWrapper({ ...errorCodes.VALIDATION_FAILED, message: 'value must be valid JSON' })
      }
    }

    const payload = {
      id: resourceId,
      namespace: req.body.namespace,
      key: req.body.key,
      value: valuePayload,
      platform: req.body.platform,
      environment: req.body.environment,
      channel: req.body.channel,
      minVersion: req.body.minVersion,
      maxVersion: req.body.maxVersion,
      status: req.body.status || 'draft',
      rolloutStrategy: req.body.rolloutStrategy,
      priority: req.body.priority !== undefined ? Number(req.body.priority) : 0,
      effectiveAt: req.body.effectiveAt,
      expiresAt: req.body.expiresAt,
      metadata: req.body.metadata || null,
      encrypt: encryptFlag,
      sensitive: req.body.sensitive === true || req.body.sensitive === 'true'
    }

    if (!payload.value || typeof payload.value !== 'object' || Array.isArray(payload.value) || Object.keys(payload.value).length === 0) {
      throw new ErrorWrapper({ ...errorCodes.VALIDATION_FAILED, message: 'value must be a non-empty object' })
    }

    const context = {
      user: req.currentUser || req.user || null
    }

    const record = await runtimeSettingsService.upsertSetting(payload, context)

    return this.result({
      data: record
    })
  }
}

module.exports = UpsertRuntimeSettingHandler
