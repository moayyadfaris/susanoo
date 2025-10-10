const NodeCache = require('node-cache')
const { Logger } = require('./Logger')

// Create logger instance for enterprise cache
const logger = new Logger({
  appName: 'SusanooAPI-EnterpriseCache',
  raw: process.env.NODE_ENV !== 'development'
})

/**
 * CacheManager - Multi-level caching service with performance monitoring
 * 
 * Features:
 * - L1 (Memory) + L2 (Redis) caching architecture
 * - Automatic cache warming strategies
 * - Performance metrics and monitoring
 * - Pattern-based invalidation
 * - Namespace support for multi-tenancy
 * - Cache-aside and write-through patterns
 * - Configurable TTL and eviction policies
 * 
 * @version 1.0.0
 */
class CacheManager {
  constructor(config = {}) {
    this.config = {
      // Memory cache configuration (L1)
      memory: {
        enabled: config.memory?.enabled !== false,
        stdTTL: config.memory?.stdTTL || 300, // 5 minutes
        checkperiod: config.memory?.checkperiod || 60, // 1 minute
        useClones: config.memory?.useClones !== false,
        maxKeys: config.memory?.maxKeys || 1000,
        ...config.memory
      },
      
      // Redis cache configuration (L2)
      redis: {
        enabled: config.redis?.enabled !== false,
        stdTTL: config.redis?.stdTTL || 3600, // 1 hour
        keyPrefix: config.redis?.keyPrefix || 'susanoo:cache:',
        ...config.redis
      },
      
      // Performance monitoring
      monitoring: {
        enabled: config.monitoring?.enabled !== false,
        logLevel: config.monitoring?.logLevel || 'info',
        metricsInterval: config.monitoring?.metricsInterval || 60000, // 1 minute
        ...config.monitoring
      },
      
      // Cache warming configuration
      warming: {
        enabled: config.warming?.enabled !== false,
        strategies: config.warming?.strategies || ['popular', 'recent'],
        interval: config.warming?.interval || 300000, // 5 minutes
        ...config.warming
      }
    }
    
    // Initialize memory cache
    this.memoryCache = new NodeCache(this.config.memory)
    
    // Redis client will be injected
    this.redisClient = null
    
    // Performance metrics
    this.metrics = {
      hits: { memory: 0, redis: 0, total: 0 },
      misses: { memory: 0, redis: 0, total: 0 },
      sets: { memory: 0, redis: 0, total: 0 },
      deletes: { memory: 0, redis: 0, total: 0 },
      errors: { memory: 0, redis: 0, total: 0 },
      avgResponseTime: { memory: 0, redis: 0 },
      totalRequests: 0,
      lastResetTime: Date.now()
    }
    
    // Cache warming data
    this.warmingStrategies = new Map()
    this.warmingInterval = null
    
    this._setupEventListeners()
    this._startMetricsCollection()
  }

  /**
   * Initialize with Redis client
   */
  initialize(redisClient) {
    this.redisClient = redisClient
    
    if (this.config.warming.enabled) {
      this._startCacheWarming()
    }
    
    logger.info('Enterprise cache service initialized', {
      memoryEnabled: this.config.memory.enabled,
      redisEnabled: this.config.redis.enabled && !!this.redisClient,
      warmingEnabled: this.config.warming.enabled
    })
  }

  /**
   * Get value from cache (L1 -> L2 -> miss)
   */
  async get(key, options = {}) {
    const startTime = Date.now()
    const cacheKey = this._buildKey(key, options.namespace)
    
    try {
      this.metrics.totalRequests++
      
      // Try L1 cache (memory) first
      if (this.config.memory.enabled) {
        const memoryStart = Date.now()
        const memoryValue = this.memoryCache.get(cacheKey)
        
        this._updateResponseTime('memory', Date.now() - memoryStart)
        
        if (memoryValue !== undefined) {
          this.metrics.hits.memory++
          this.metrics.hits.total++
          
          logger.debug('Cache hit (memory)', { key: cacheKey })
          return this._deserialize(memoryValue)
        } else {
          this.metrics.misses.memory++
        }
      }
      
      // Try L2 cache (Redis)
      if (this.config.redis.enabled && this.redisClient) {
        const redisStart = Date.now()
        const redisValue = await this.redisClient.get(cacheKey)
        
        this._updateResponseTime('redis', Date.now() - redisStart)
        
        if (redisValue !== null) {
          this.metrics.hits.redis++
          this.metrics.hits.total++
          
          const deserializedValue = this._deserialize(redisValue)
          
          // Populate L1 cache
          if (this.config.memory.enabled) {
            this.memoryCache.set(cacheKey, redisValue, this.config.memory.stdTTL)
          }
          
          logger.debug('Cache hit (redis)', { key: cacheKey })
          return deserializedValue
        } else {
          this.metrics.misses.redis++
        }
      }
      
      // Cache miss
      this.metrics.misses.total++
      logger.debug('Cache miss', { key: cacheKey, duration: Date.now() - startTime })
      
      return null
      
    } catch (error) {
      this.metrics.errors.total++
      logger.error('Cache get error', { 
        key: cacheKey, 
        error: error.message,
        duration: Date.now() - startTime
      })
      return null
    }
  }

  /**
   * Set value in cache (both L1 and L2)
   */
  async set(key, value, ttl = null, options = {}) {
    const startTime = Date.now()
    const cacheKey = this._buildKey(key, options.namespace)
    const serializedValue = this._serialize(value)
    
    try {
      const promises = []
      
      // Set in L1 cache (memory)
      if (this.config.memory.enabled) {
        const memoryTTL = ttl || this.config.memory.stdTTL
        this.memoryCache.set(cacheKey, serializedValue, memoryTTL)
        this.metrics.sets.memory++
      }
      
      // Set in L2 cache (Redis)
      if (this.config.redis.enabled && this.redisClient) {
        const redisTTL = ttl || this.config.redis.stdTTL
        promises.push(
          this.redisClient.setex(cacheKey, redisTTL, serializedValue)
        )
        this.metrics.sets.redis++
      }
      
      if (promises.length > 0) {
        await Promise.allSettled(promises)
      }
      
      this.metrics.sets.total++
      
      logger.debug('Cache set', { 
        key: cacheKey, 
        ttl: ttl || 'default',
        duration: Date.now() - startTime
      })
      
      return true
      
    } catch (error) {
      this.metrics.errors.total++
      logger.error('Cache set error', { 
        key: cacheKey, 
        error: error.message,
        duration: Date.now() - startTime
      })
      return false
    }
  }

  /**
   * Delete value from cache (both L1 and L2)
   */
  async delete(key, options = {}) {
    const cacheKey = this._buildKey(key, options.namespace)
    
    try {
      const promises = []
      
      // Delete from L1 cache (memory)
      if (this.config.memory.enabled) {
        this.memoryCache.del(cacheKey)
        this.metrics.deletes.memory++
      }
      
      // Delete from L2 cache (Redis)
      if (this.config.redis.enabled && this.redisClient) {
        promises.push(this.redisClient.del(cacheKey))
        this.metrics.deletes.redis++
      }
      
      if (promises.length > 0) {
        await Promise.allSettled(promises)
      }
      
      this.metrics.deletes.total++
      
      logger.debug('Cache delete', { key: cacheKey })
      
      return true
      
    } catch (error) {
      this.metrics.errors.total++
      logger.error('Cache delete error', { 
        key: cacheKey, 
        error: error.message 
      })
      return false
    }
  }

  /**
   * Clear all cache (both L1 and L2)
   */
  async clear(namespace = null) {
    try {
      const promises = []
      
      // Clear L1 cache (memory)
      if (this.config.memory.enabled) {
        if (namespace) {
          // Clear specific namespace
          const pattern = this._buildKey('*', namespace)
          const keys = this.memoryCache.keys().filter(key => 
            key.startsWith(pattern.replace('*', ''))
          )
          this.memoryCache.del(keys)
        } else {
          this.memoryCache.flushAll()
        }
      }
      
      // Clear L2 cache (Redis)
      if (this.config.redis.enabled && this.redisClient) {
        if (namespace) {
          const pattern = this._buildKey('*', namespace)
          promises.push(this._clearRedisPattern(pattern))
        } else {
          const pattern = `${this.config.redis.keyPrefix}*`
          promises.push(this._clearRedisPattern(pattern))
        }
      }
      
      if (promises.length > 0) {
        await Promise.allSettled(promises)
      }
      
      logger.info('Cache cleared', { namespace: namespace || 'all' })
      
      return true
      
    } catch (error) {
      this.metrics.errors.total++
      logger.error('Cache clear error', { error: error.message })
      return false
    }
  }

  /**
   * Get or set pattern (cache-aside)
   */
  async getOrSet(key, fetchFunction, ttl = null, options = {}) {
    let value = await this.get(key, options)
    
    if (value === null) {
      try {
        value = await fetchFunction()
        if (value !== null && value !== undefined) {
          await this.set(key, value, ttl, options)
        }
      } catch (error) {
        logger.error('Cache fetch function error', { 
          key, 
          error: error.message 
        })
        throw error
      }
    }
    
    return value
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern, namespace = null) {
    const fullPattern = this._buildKey(pattern, namespace)
    
    try {
      // Invalidate L1 cache (memory)
      if (this.config.memory.enabled) {
        const keys = this.memoryCache.keys().filter(key => 
          this._matchPattern(key, fullPattern)
        )
        this.memoryCache.del(keys)
      }
      
      // Invalidate L2 cache (Redis)
      if (this.config.redis.enabled && this.redisClient) {
        await this._clearRedisPattern(fullPattern)
      }
      
      logger.info('Cache pattern invalidated', { pattern: fullPattern })
      
      return true
      
    } catch (error) {
      logger.error('Cache pattern invalidation error', { 
        pattern: fullPattern, 
        error: error.message 
      })
      return false
    }
  }

  /**
   * Register cache warming strategy
   */
  registerWarmingStrategy(name, strategy) {
    this.warmingStrategies.set(name, strategy)
    
    logger.info('Cache warming strategy registered', { name })
  }

  /**
   * Manually warm cache
   */
  async warmCache(strategyNames = null) {
    const strategies = strategyNames || Array.from(this.warmingStrategies.keys())
    
    for (const strategyName of strategies) {
      const strategy = this.warmingStrategies.get(strategyName)
      
      if (strategy && typeof strategy === 'function') {
        try {
          await strategy(this)
          logger.debug('Cache warming completed', { strategy: strategyName })
        } catch (error) {
          logger.error('Cache warming error', { 
            strategy: strategyName, 
            error: error.message 
          })
        }
      }
    }
  }

  /**
   * Get cache statistics
   */
  getMetrics() {
    const now = Date.now()
    const timeSinceReset = now - this.metrics.lastResetTime
    
    const hitRatio = this.metrics.totalRequests > 0 
      ? (this.metrics.hits.total / this.metrics.totalRequests * 100).toFixed(2)
      : '0.00'
    
    return {
      ...this.metrics,
      hitRatio: `${hitRatio}%`,
      timeSinceReset: timeSinceReset,
      requestsPerSecond: this.metrics.totalRequests / (timeSinceReset / 1000),
      memoryStats: this.config.memory.enabled ? this._getMemoryStats() : null,
      redisStats: this.config.redis.enabled ? this._getRedisStats() : null
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      hits: { memory: 0, redis: 0, total: 0 },
      misses: { memory: 0, redis: 0, total: 0 },
      sets: { memory: 0, redis: 0, total: 0 },
      deletes: { memory: 0, redis: 0, total: 0 },
      errors: { memory: 0, redis: 0, total: 0 },
      avgResponseTime: { memory: 0, redis: 0 },
      totalRequests: 0,
      lastResetTime: Date.now()
    }
    
    logger.info('Cache metrics reset')
  }

  /**
   * Build cache key with namespace
   */
  _buildKey(key, namespace = null) {
    const prefix = this.config.redis.keyPrefix
    const namespacePrefix = namespace ? `${namespace}:` : ''
    return `${prefix}${namespacePrefix}${key}`
  }

  /**
   * Serialize value for storage
   */
  _serialize(value) {
    try {
      return JSON.stringify({
        data: value,
        timestamp: Date.now(),
        version: '1.0'
      })
    } catch (error) {
      logger.error('Serialization error', { error: error.message })
      return null
    }
  }

  /**
   * Deserialize value from storage
   */
  _deserialize(value) {
    try {
      if (typeof value === 'string') {
        const parsed = JSON.parse(value)
        return parsed.data
      }
      return value
    } catch (error) {
      logger.error('Deserialization error', { error: error.message })
      return null
    }
  }

  /**
   * Match pattern with wildcards
   */
  _matchPattern(key, pattern) {
    const regex = new RegExp(
      pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
    )
    return regex.test(key)
  }

  /**
   * Clear Redis keys by pattern
   */
  async _clearRedisPattern(pattern) {
    if (!this.redisClient) return
    
    try {
      const keys = await this.redisClient.keys(pattern)
      if (keys.length > 0) {
        await this.redisClient.del(...keys)
      }
    } catch (error) {
      logger.error('Redis pattern clear error', { 
        pattern, 
        error: error.message 
      })
    }
  }

  /**
   * Update response time metrics
   */
  _updateResponseTime(type, responseTime) {
    const current = this.metrics.avgResponseTime[type] || 0
    this.metrics.avgResponseTime[type] = (current + responseTime) / 2
  }

  /**
   * Get memory cache statistics
   */
  _getMemoryStats() {
    return {
      keys: this.memoryCache.keys().length,
      hits: this.memoryCache.getStats().hits,
      misses: this.memoryCache.getStats().misses,
      maxKeys: this.config.memory.maxKeys
    }
  }

  /**
   * Get Redis cache statistics
   */
  _getRedisStats() {
    // This would need to be implemented based on Redis client
    return {
      connected: this.redisClient ? true : false
    }
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    this.memoryCache.on('expired', (key, value) => {
      logger.debug('Cache key expired', { key })
    })
    
    this.memoryCache.on('del', (key, value) => {
      logger.debug('Cache key deleted', { key })
    })
  }

  /**
   * Start metrics collection
   */
  _startMetricsCollection() {
    if (this.config.monitoring.enabled) {
      setInterval(() => {
        const metrics = this.getMetrics()
        
        if (this.config.monitoring.logLevel === 'debug') {
          logger.debug('Cache metrics', metrics)
        }
        
      }, this.config.monitoring.metricsInterval)
    }
  }

  /**
   * Start cache warming
   */
  _startCacheWarming() {
    if (this.config.warming.enabled) {
      this.warmingInterval = setInterval(async () => {
        await this.warmCache()
      }, this.config.warming.interval)
      
      logger.info('Cache warming started', {
        interval: this.config.warming.interval,
        strategies: Array.from(this.warmingStrategies.keys())
      })
    }
  }

  /**
   * Shutdown cache service
   */
  shutdown() {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval)
    }
    
    this.memoryCache.close()
    
    logger.info('Enterprise cache service shutdown')
  }
}

module.exports = CacheManager