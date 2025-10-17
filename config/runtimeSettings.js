const { BaseConfig } = require('../core/lib/BaseConfig')

class RuntimeSettingsConfig extends BaseConfig {
  constructor() {
    super()
    this.defaultEnvironment = this.set('RUNTIME_SETTINGS_DEFAULT_ENV', this.joi.string().required(), 'production')
    this.defaultPlatform = this.set('RUNTIME_SETTINGS_DEFAULT_PLATFORM', this.joi.string().required(), 'all')
    this.cacheTTLSeconds = parseInt(this.set('RUNTIME_SETTINGS_CACHE_TTL', this.joi.number().integer().positive(), '180'), 10)
    this.cachePrefix = this.set('RUNTIME_SETTINGS_CACHE_PREFIX', this.joi.string().required(), 'susanoo:runtime-settings:')
    this.enableEncryption = this.set('RUNTIME_SETTINGS_ENCRYPTION_ENABLED', this.joi.boolean().required(), false) === 'true'
  }

  async init() {
    this.logger = require('../util/logger')
    this.logger.debug(`${this.constructor.name}: Initialization finish...`)
  }

  get encryptionOptions() {
    if (!this.enableEncryption) {
      return { enabled: false }
    }

    return {
      enabled: true,
      encryptionKey: this.set('RUNTIME_SETTINGS_ENCRYPTION_KEY', this.joi.string().min(32).required()),
      algorithm: this.set('RUNTIME_SETTINGS_ENCRYPTION_ALGO', this.joi.string().required(), 'aes-256-gcm')
    }
  }

  get cacheOptions() {
    return {
      redis: {
        keyPrefix: this.cachePrefix
      }
    }
  }
}

module.exports = new RuntimeSettingsConfig()
