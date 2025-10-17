const BaseService = require('../BaseService')
const RuntimeSettingDAO = require('../../database/dao/RuntimeSettingDAO')
const { runtimeSettings } = require('config')

class RuntimeSettingsService extends BaseService {
  constructor(options = {}) {
    super(options)
    this.dao = RuntimeSettingDAO
    this.initialized = false
    this.serviceOptions = options
  }

  initialize() {
    if (this.initialized) return

    this.dao.initialize({
      cache: runtimeSettings.cacheOptions,
      encryption: runtimeSettings.encryptionOptions,
      defaultEnvironment: runtimeSettings.defaultEnvironment,
      defaultPlatform: runtimeSettings.defaultPlatform,
      cacheTTLSeconds: runtimeSettings.cacheTTLSeconds,
      ...(this.serviceOptions.daoOptions || {})
    })

    this.initialized = true
  }

  async getCurrentSettings(options = {}) {
    this.initialize()
    return this.dao.getActiveSettings(options)
  }

  async listSettings(options = {}) {
    this.initialize()
    return this.dao.listSettings(options)
  }

  async upsertSetting(payload, context = {}) {
    this.initialize()
    return this.dao.upsertSetting(payload, context)
  }

  async invalidateCache(setting) {
    this.initialize()
    return this.dao.invalidateCacheFor(setting)
  }

  async getHealthStatus() {
    return {
      overall: 'healthy',
      cacheEnabled: Boolean(runtimeSettings.cacheOptions?.redis),
      encryptionEnabled: runtimeSettings.encryptionOptions?.enabled === true
    }
  }
}

module.exports = RuntimeSettingsService
