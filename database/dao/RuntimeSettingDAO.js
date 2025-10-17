const AuditableDAO = require('../../core/lib/AuditableDAO')
const CryptoService = require('../../core/lib/CryptoService')
const CacheManager = require('../../core/lib/CacheManager')
const RuntimeSettingModel = require('../../models/RuntimeSettingModel')
const { Logger } = require('../../core/lib/Logger')

let redisClient = null
try {
  redisClient = require('../../handlers/RootProvider').redisClient
} catch (error) {
  // Root provider not available during early boot or test runs
  redisClient = null
}

const logger = new Logger({
  appName: 'SusanooAPI-RuntimeSettingDAO',
  raw: process.env.NODE_ENV !== 'development'
})

/**
 * RuntimeSettingDAO - Enterprise data access for runtime configuration
 *
 * Responsibilities:
 * - Manage dynamic application settings served to clients at runtime
 * - Enforce platform/version gating and rollout strategies
 * - Provide caching for high-throughput read endpoints
 * - Keep audit trail, version history, and GDPR compliance capabilities
 */
class RuntimeSettingDAO extends AuditableDAO {
  static get tableName() {
    return 'runtime_settings'
  }

  static get jsonAttributes() {
    return ['value', 'rolloutStrategy', 'metadata']
  }

  static get idColumn() {
    return 'id'
  }

  static get modelClass() {
    return RuntimeSettingModel
  }

  /**
   * Initialize supporting services (encryption, caching)
   * Should be idempotent.
   */
  static initialize(options = {}) {
    if (!this.cacheService) {
      const cacheOptions = {
        memory: {
          stdTTL: 120,
          checkperiod: 60,
          useClones: false,
          ...(options.cache?.memory || {})
        },
        redis: {
          keyPrefix: options.cache?.redis?.keyPrefix || 'susanoo:runtime-settings:',
          ...(options.cache?.redis || {})
        },
        monitoring: {
          enabled: true,
          logLevel: options.cache?.monitoring?.logLevel || 'info'
        }
      }

      this.cacheService = new CacheManager(cacheOptions)
      if (redisClient) {
        this.cacheService.initialize(redisClient)
      } else {
        logger.warn('RuntimeSettingDAO initialized without Redis client; cache limited to memory')
      }
    }

    if (!this.encryption && options.encryption?.enabled) {
      this.encryption = new CryptoService(options.encryption)
    }

    this.defaultEnvironment = options.defaultEnvironment || process.env.NODE_ENV || 'development'
    this.defaultPlatform = options.defaultPlatform || 'all'
    this.cacheTTLSeconds = options.cacheTTLSeconds || 180
  }

  /**
   * Normalize version string to an array [major, minor, patch]
   */
  static parseVersion(version) {
    if (!version) return [0, 0, 0]
    return version
      .toString()
      .split('.')
      .slice(0, 3)
      .map(segment => {
        const parsed = parseInt(segment, 10)
        return Number.isNaN(parsed) ? 0 : parsed
      })
  }

  /**
   * Convert semantic version to sortable numeric code (major*1e6 + minor*1e3 + patch)
   */
  static toVersionCode(version) {
    const [major, minor, patch] = this.parseVersion(version)
    return major * 1_000_000 + minor * 1_000 + patch
  }

  /**
   * Build deterministic cache key for lookup parameters
   */
  static buildCacheKey({ environment, namespace, platform, versionCode, channel }) {
    const parts = {
      env: environment || this.defaultEnvironment || 'development',
      namespace: namespace || 'all',
      platform: platform || this.defaultPlatform || 'all',
      version: versionCode || 0,
      channel: channel || 'global'
    }
    return Object.values(parts).join(':')
  }

  /**
   * Retrieve active settings for a request context
   */
  static async getActiveSettings(params = {}) {
    const environment = params.environment || this.defaultEnvironment || 'development'
    const platform = (params.platform || this.defaultPlatform || 'all').toLowerCase()
    const namespace = params.namespace
    const channel = params.channel
    const now = params.now || new Date()
    const versionCode = params.appVersionCode || this.toVersionCode(params.appVersion)
    const includeDraft = params.includeDraft === true
    const skipCache = params.skipCache === true

    const cacheKey = this.buildCacheKey({ environment, namespace, platform, versionCode, channel })
    if (!skipCache && this.cacheService) {
      const cached = await this.cacheService.get(cacheKey, { namespace: 'runtime_settings' })
      if (cached) {
        logger.debug('Runtime settings cache hit', { cacheKey })
        return cached
      }
    }

    const query = this.query()
      .where(builder => {
        builder.whereNull('environment').orWhere('environment', environment)
      })
      .where(builder => {
        builder.whereNull('platform').orWhere('platform', 'all').orWhereRaw('LOWER(platform) = ?', [platform])
      })
      .where(builder => {
        builder.whereNull('effectiveAt').orWhere('effectiveAt', '<=', now.toISOString())
      })
      .where(builder => {
        builder.whereNull('expiresAt').orWhere('expiresAt', '>', now.toISOString())
      })
      .where(builder => {
        builder.whereNull('minVersionCode').orWhere('minVersionCode', '<=', versionCode)
      })
      .where(builder => {
        builder.whereNull('maxVersionCode').orWhere('maxVersionCode', '>=', versionCode)
      })

    if (namespace) {
      query.where('namespace', namespace)
    }

    if (channel) {
      query.where(builder => {
        builder.whereNull('channel').orWhere('channel', channel)
      })
    }

    if (!includeDraft) {
      query.where('status', 'published')
    }

    const settings = await query.orderBy('priority', 'desc').orderBy('updatedAt', 'desc')
    const hydratedSettings = settings.map((setting) => this._hydrateSetting(setting))
    const filtered = this._applyRolloutFilters(hydratedSettings, params.rolloutSeed)
    const grouped = this._groupSettings(filtered)

    if (this.cacheService && !skipCache) {
      await this.cacheService.set(cacheKey, grouped, this.cacheTTLSeconds, { namespace: 'runtime_settings' })
    }

    return grouped
  }

  /**
   * Upsert a runtime setting
   */
  static async upsertSetting(payload, context = {}) {
    const normalized = await this._preparePayload(payload, context)

    const existing = await this.queryWithDeleted()
      .where('namespace', normalized.namespace)
      .where('key', normalized.key)
      .where(builder => {
        builder.whereNull('environment').orWhere('environment', normalized.environment || null)
      })
      .where(builder => {
        builder.whereNull('platform').orWhere('platform', normalized.platform || null)
      })
      .where(builder => {
        builder.whereNull('channel').orWhere('channel', normalized.channel || null)
      })
      .first()

    let record
    if (existing) {
      record = await this.query()
        .context({ user: context.user || null })
        .patchAndFetchById(existing.id, normalized)
    } else {
      record = await this.query()
        .context({ user: context.user || null })
        .insert(normalized)
    }

    await this.invalidateCacheFor(record)
    return this._hydrateSetting(record)
  }

  /**
   * List settings with filtering and pagination
   */
  static async listSettings(options = {}) {
    const page = Number(options.page || 0)
    const limit = Number(options.limit || 25)

    const query = this.queryWithDeleted()

    if (options.namespace) {
      query.where('namespace', options.namespace)
    }

    if (options.status) {
      query.where('status', options.status)
    }

    if (options.environment) {
      query.where(builder => {
        builder.whereNull('environment').orWhere('environment', options.environment)
      })
    }

    if (options.platform) {
      const platform = options.platform.toLowerCase()
      query.where(builder => {
        builder.whereNull('platform').orWhere('platform', 'all').orWhereRaw('LOWER(platform) = ?', [platform])
      })
    }

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`
      query.where(builder => {
        builder.whereRaw('LOWER(namespace) LIKE ?', [term])
          .orWhereRaw('LOWER("key") LIKE ?', [term])
          .orWhereRaw('LOWER(status) LIKE ?', [term])
      })
    }

    query.orderBy('updatedAt', 'desc')

    const results = await query.page(page, limit)
    results.results = (results.results || []).map((row) => this._hydrateSetting(row))
    return results
  }

  /**
   * Invalidate cache entries touching a setting
   */
  static async invalidateCacheFor(setting) {
    if (!this.cacheService || !setting) return
    try {
      await this.cacheService.invalidatePattern('runtime_settings:*', 'runtime_settings')
    } catch (error) {
      logger.warn('Failed to invalidate runtime settings cache', { error: error.message })
    }
  }

  /**
   * Prepare payload for persistence (encryption, version codes, checksum)
   */
  static async _preparePayload(payload, context) {
    const { namespace, key, value, platform, environment, channel } = payload

    const sanitizedValue = value || {}
    let storedValue = sanitizedValue

    if (this.encryption && (payload.encrypt === true || payload.sensitive === true)) {
      storedValue = {
        encrypted: true,
        data: this.encryption.encrypt(JSON.stringify(sanitizedValue))
      }
    }

    const normalized = {
      namespace,
      key,
      value: storedValue,
      platform: platform ? platform.toLowerCase() : null,
      environment: environment || this.defaultEnvironment || 'development',
      channel: channel || null,
      status: payload.status || 'draft',
      rolloutStrategy: payload.rolloutStrategy || null,
      priority: payload.priority || 0,
      effectiveAt: payload.effectiveAt || new Date().toISOString(),
      expiresAt: payload.expiresAt || null,
      metadata: payload.metadata || null
    }

    normalized.minVersion = payload.minVersion || null
    normalized.maxVersion = payload.maxVersion || null
    normalized.minVersionCode = normalized.minVersion ? this.toVersionCode(normalized.minVersion) : null
    normalized.maxVersionCode = normalized.maxVersion ? this.toVersionCode(normalized.maxVersion) : null
    normalized.checksum = this._checksumValue(sanitizedValue)

    if (storedValue?.encrypted && normalized.metadata) {
      normalized.metadata.contains_encrypted_value = true
    }

    if (context.user?.id) {
      normalized.updatedBy = context.user.id
      if (!payload.id) {
        normalized.createdBy = context.user.id
      }
    }

    return normalized
  }

  static _groupSettings(settings) {
    const grouped = {}
    for (const setting of settings) {
      if (!grouped[setting.namespace]) {
        grouped[setting.namespace] = {}
      }
      grouped[setting.namespace][setting.key] = setting.value
    }
    return grouped
  }

  static _hydrateSetting(setting) {
    if (!setting) return setting
    const clone = { ...setting }
    clone.value = this._decodeValue(setting.value)
    return clone
  }

  static _decodeValue(value) {
    if (!value) return value
    if (value.encrypted && value.data && this.encryption) {
      try {
        const decrypted = this.encryption.decrypt(value.data)
        return JSON.parse(decrypted)
      } catch (error) {
        logger.error('Failed to decrypt runtime setting value', { error: error.message })
        return null
      }
    }
    return value
  }

  static _applyRolloutFilters(settings, rolloutSeed) {
    if (!settings || !settings.length) return settings
    if (!rolloutSeed) return settings

    return settings.filter(setting => {
      if (!setting.rolloutStrategy) return true
      const strategy = setting.rolloutStrategy
      if (strategy.mode === 'percentage') {
        const percentage = Number(strategy.percentage || 0)
        if (percentage >= 100) return true
        if (percentage <= 0) return false
        const hash = this._deterministicHash(`${rolloutSeed}:${setting.id}`)
        const bucket = hash % 100
        return bucket < percentage
      }

      if (strategy.mode === 'cohort' && Array.isArray(strategy.cohorts)) {
        const cohort = rolloutSeed.toString()
        return strategy.cohorts.includes(cohort)
      }

      if (strategy.mode === 'toggle') {
        return Boolean(strategy.enabled)
      }

      return true
    })
  }

  static _deterministicHash(value) {
    let hash = 0
    const str = value.toString()
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash)
  }

  static _checksumValue(value) {
    const json = JSON.stringify(value || {})
    const { createHash } = require('crypto')
    return createHash('sha1').update(json).digest('hex')
  }
}

module.exports = RuntimeSettingDAO
