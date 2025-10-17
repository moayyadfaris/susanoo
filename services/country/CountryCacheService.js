/**
 * CountryCacheService - Intelligent Caching Service
 * 
 * Advanced caching service for country data including:
 * - Multi-level caching strategies
 * - Cache warming and prefetching
 * - Intelligent cache invalidation
 * - Performance optimization
 * - Cache analytics and monitoring
 * - Distributed cache coordination
 * 
 * @version 1.0.0
 * @author Susanoo API Team
 */

const BaseService = require('../BaseService')
const { RedisClient } = require('../../clients')
const { ErrorWrapper } = require('backend-core')
const joi = require('joi')

/**
 * Enterprise caching service with intelligent strategies
 */
class CountryCacheService extends BaseService {
  constructor(options = {}) {
    super(options)
    
    // Register dependencies
    this.registerDependency('redisClient', options.redisClient || RedisClient)
    
    // Cache configuration
    this.config = {
      // TTL settings (in seconds)
      ttl: {
        country: 3600,      // 1 hour
        search: 1800,       // 30 minutes
        analytics: 7200,    // 2 hours
        list: 900,          // 15 minutes
        stats: 3600         // 1 hour
      },
      // Cache keys
      keyPrefix: 'country:',
      // Cache strategies
      strategies: {
        default: 'write-through',
        search: 'cache-aside',
        analytics: 'write-behind'
      },
      // Performance settings
      batchSize: 50,
      maxRetries: 3,
      ...options.config
    }
    
    // In-memory cache for frequently accessed data
    this.memoryCache = new Map()
    this.memoryCacheStats = {
      hits: 0,
      misses: 0,
      size: 0
    }
  }

  /**
   * Get country from cache with fallback strategy
   * @param {number} countryId - Country ID
   * @param {Function} fallbackFn - Function to call if cache miss
   * @param {Object} options - Cache options
   * @returns {Promise<Object>} Country data
   */
  async getCountry(countryId, fallbackFn, options = {}) {
    return this.executeOperation('getCountry', async (context) => {
      const cacheKey = this.generateCacheKey('country', countryId)
      const ttl = options.ttl || this.config.ttl.country
      
      // Try memory cache first
      const memoryResult = this.getFromMemoryCache(cacheKey)
      if (memoryResult && !options.skipMemoryCache) {
        this.memoryCacheStats.hits++
        this.emit('cache:memory_hit', { key: cacheKey, context })
        return memoryResult
      }
      
      this.memoryCacheStats.misses++
      
      // Try Redis cache
      const redisClient = this.getDependency('redisClient')
      let cachedData = await redisClient.get(cacheKey)
      
      if (cachedData) {
        cachedData = JSON.parse(cachedData)
        
        // Store in memory cache for faster access
        this.setMemoryCache(cacheKey, cachedData, ttl)
        
        this.emit('cache:redis_hit', { key: cacheKey, context })
        return cachedData
      }
      
      // Cache miss - use fallback
      this.emit('cache:miss', { key: cacheKey, context })
      
      if (!fallbackFn) {
        return null
      }
      
      const freshData = await fallbackFn()
      
      if (freshData) {
        // Store in both caches
        await this.setCountry(countryId, freshData, { ttl })
      }
      
      return freshData
    }, { countryId, options })
  }

  /**
   * Set country data in cache
   * @param {number} countryId - Country ID
   * @param {Object} data - Country data
   * @param {Object} options - Cache options
   * @returns {Promise<boolean>} Success status
   */
  async setCountry(countryId, data, options = {}) {
    return this.executeOperation('setCountry', async (context) => {
      const cacheKey = this.generateCacheKey('country', countryId)
      const ttl = options.ttl || this.config.ttl.country
      
      // Store in Redis
      const redisClient = this.getDependency('redisClient')
      await redisClient.setex(cacheKey, ttl, JSON.stringify(data))
      
      // Store in memory cache
      this.setMemoryCache(cacheKey, data, ttl)
      
      this.emit('cache:set', { key: cacheKey, ttl, context })
      
      return true
    }, { countryId, options })
  }

  /**
   * Cache search results with intelligent key generation
   * @param {Object} searchParams - Search parameters
   * @param {Array} results - Search results
   * @param {Object} options - Cache options
   * @returns {Promise<boolean>} Success status
   */
  async cacheSearchResults(searchParams, results, options = {}) {
    return this.executeOperation('cacheSearchResults', async (context) => {
      const searchKey = this.generateSearchCacheKey(searchParams)
      const ttl = options.ttl || this.config.ttl.search
      
      const cacheData = {
        results,
        searchParams,
        cachedAt: new Date(),
        ttl
      }
      
      const redisClient = this.getDependency('redisClient')
      await redisClient.setex(searchKey, ttl, JSON.stringify(cacheData))
      
      // Track search cache keys for invalidation
      await this.trackSearchCache(searchKey, searchParams)
      
      this.emit('cache:search_cached', { key: searchKey, resultsCount: results.length, context })
      
      return true
    }, { searchParams, options })
  }

  /**
   * Get cached search results
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object|null>} Cached search results
   */
  async getCachedSearchResults(searchParams) {
    return this.executeOperation('getCachedSearchResults', async (context) => {
      const searchKey = this.generateSearchCacheKey(searchParams)
      
      const redisClient = this.getDependency('redisClient')
      const cachedData = await redisClient.get(searchKey)
      
      if (cachedData) {
        const parsed = JSON.parse(cachedData)
        this.emit('cache:search_hit', { key: searchKey, context })
        return parsed.results
      }
      
      this.emit('cache:search_miss', { key: searchKey, context })
      return null
    }, { searchParams })
  }

  /**
   * Cache analytics data with extended TTL
   * @param {string} analyticsType - Type of analytics
   * @param {Object} data - Analytics data
   * @param {Object} options - Cache options
   * @returns {Promise<boolean>} Success status
   */
  async cacheAnalytics(analyticsType, data, options = {}) {
    return this.executeOperation('cacheAnalytics', async (context) => {
      const cacheKey = this.generateCacheKey('analytics', analyticsType)
      const ttl = options.ttl || this.config.ttl.analytics
      
      const cacheData = {
        data,
        type: analyticsType,
        generatedAt: new Date(),
        ttl
      }
      
      const redisClient = this.getDependency('redisClient')
      await redisClient.setex(cacheKey, ttl, JSON.stringify(cacheData))
      
      this.emit('cache:analytics_cached', { key: cacheKey, type: analyticsType, context })
      
      return true
    }, { analyticsType, options })
  }

  /**
   * Get cached analytics data
   * @param {string} analyticsType - Type of analytics
   * @returns {Promise<Object|null>} Cached analytics data
   */
  async getCachedAnalytics(analyticsType) {
    return this.executeOperation('getCachedAnalytics', async (context) => {
      const cacheKey = this.generateCacheKey('analytics', analyticsType)
      
      const redisClient = this.getDependency('redisClient')
      const cachedData = await redisClient.get(cacheKey)
      
      if (cachedData) {
        const parsed = JSON.parse(cachedData)
        this.emit('cache:analytics_hit', { key: cacheKey, type: analyticsType, context })
        return parsed.data
      }
      
      this.emit('cache:analytics_miss', { key: cacheKey, type: analyticsType, context })
      return null
    }, { analyticsType })
  }

  /**
   * Warm cache with frequently accessed countries
   * @param {Array} countryIds - Country IDs to warm
   * @param {Function} dataFetcher - Function to fetch data
   * @returns {Promise<Object>} Warming results
   */
  async warmCache(countryIds, dataFetcher) {
    return this.executeOperation('warmCache', async (context) => {
      const results = {
        successful: 0,
        failed: 0,
        errors: []
      }
      
      // Process in batches to avoid overwhelming the system
      const batchSize = this.config.batchSize
      
      for (let i = 0; i < countryIds.length; i += batchSize) {
        const batch = countryIds.slice(i, i + batchSize)
        
        await Promise.all(batch.map(async (countryId) => {
          try {
            const data = await dataFetcher(countryId)
            if (data) {
              await this.setCountry(countryId, data)
              results.successful++
            }
          } catch (error) {
            results.failed++
            results.errors.push({
              countryId,
              error: error.message
            })
          }
        }))
        
        // Small delay between batches
        if (i + batchSize < countryIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      
      this.emit('cache:warmed', { results, totalCountries: countryIds.length, context })
      
      return results
    }, { countryIds })
  }

  /**
   * Invalidate country cache
   * @param {number} countryId - Country ID to invalidate
   * @param {Object} options - Invalidation options
   * @returns {Promise<boolean>} Success status
   */
  async invalidateCountry(countryId, options = {}) {
    return this.executeOperation('invalidateCountry', async (context) => {
      const cacheKey = this.generateCacheKey('country', countryId)
      
      // Remove from Redis
      const redisClient = this.getDependency('redisClient')
      await redisClient.del(cacheKey)
      
      // Remove from memory cache
      this.memoryCache.delete(cacheKey)
      this.memoryCacheStats.size = this.memoryCache.size
      
      // Invalidate related caches if requested
      if (options.cascadeInvalidation) {
        await this.invalidateRelatedCaches(countryId)
      }
      
      this.emit('cache:invalidated', { key: cacheKey, countryId, context })
      
      return true
    }, { countryId, options })
  }

  /**
   * Invalidate search caches based on criteria
   * @param {Object} criteria - Invalidation criteria
   * @returns {Promise<number>} Number of invalidated keys
   */
  async invalidateSearchCaches(criteria = {}) {
    return this.executeOperation('invalidateSearchCaches', async (context) => {
      const redisClient = this.getDependency('redisClient')
      
      // Get all search cache keys
      const searchPattern = this.generateCacheKey('search', '*')
      const searchKeys = await redisClient.keys(searchPattern)
      
      let invalidatedCount = 0
      
      // Filter keys based on criteria
      for (const key of searchKeys) {
        const shouldInvalidate = await this.shouldInvalidateSearchCache(key, criteria)
        
        if (shouldInvalidate) {
          await redisClient.del(key)
          invalidatedCount++
        }
      }
      
      this.emit('cache:search_invalidated', { count: invalidatedCount, criteria, context })
      
      return invalidatedCount
    }, { criteria })
  }

  /**
   * Get cache statistics and performance metrics
   * @returns {Promise<Object>} Cache statistics
   */
  async getCacheStatistics() {
    return this.executeOperation('getCacheStatistics', async (context) => {
      const redisClient = this.getDependency('redisClient')
      
      // Get Redis info
      const redisInfo = await redisClient.info('memory')
      
      // Count cache keys by type
      const keyCounts = await this.countCacheKeysByType()
      
      // Memory cache stats
      const memoryStats = {
        ...this.memoryCacheStats,
        hitRate: this.memoryCacheStats.hits / (this.memoryCacheStats.hits + this.memoryCacheStats.misses) * 100 || 0
      }
      
      const statistics = {
        memory: memoryStats,
        redis: {
          info: redisInfo,
          keyCount: keyCounts
        },
        performance: {
          averageResponseTime: this.getAverageResponseTime(),
          cacheEfficiency: this.calculateCacheEfficiency()
        },
        metadata: {
          generatedAt: new Date(),
          uptime: this.getUptime()
        }
      }
      
      this.emit('cache:statistics_generated', { statistics, context })
      
      return statistics
    })
  }

  /**
   * Flush all country-related caches
   * @param {Object} options - Flush options
   * @returns {Promise<boolean>} Success status
   */
  async flushAllCaches(options = {}) {
    return this.executeOperation('flushAllCaches', async (context) => {
      const redisClient = this.getDependency('redisClient')
      
      if (options.confirmFlush !== true) {
        throw new ErrorWrapper({
          code: 'FLUSH_CONFIRMATION_REQUIRED',
          message: 'Must explicitly confirm cache flush operation',
          statusCode: 422
        })
      }
      
      // Get all country cache keys
      const pattern = this.generateCacheKey('*')
      const keys = await redisClient.keys(pattern)
      
      // Delete all keys
      if (keys.length > 0) {
        await redisClient.del(...keys)
      }
      
      // Clear memory cache
      this.memoryCache.clear()
      this.memoryCacheStats.size = 0
      
      this.emit('cache:flushed', { keyCount: keys.length, context })
      
      return true
    }, { options })
  }

  // ===============================
  // PRIVATE CACHE METHODS
  // ===============================

  /**
   * Generate cache key with prefix
   * @private
   */
  generateCacheKey(type, identifier = '') {
    return `${this.config.keyPrefix}${type}:${identifier}`
  }

  /**
   * Generate search cache key from parameters
   * @private
   */
  generateSearchCacheKey(searchParams) {
    // Create a deterministic key from search parameters
    const normalizedParams = this.normalizeSearchParams(searchParams)
    const paramString = JSON.stringify(normalizedParams)
    const hash = this.generateHash(paramString)
    return this.generateCacheKey('search', hash)
  }

  /**
   * Normalize search parameters for consistent caching
   * @private
   */
  normalizeSearchParams(params) {
    const normalized = { ...params }
    
    // Sort arrays and objects for consistency
    if (normalized.fields && Array.isArray(normalized.fields)) {
      normalized.fields.sort()
    }
    
    if (normalized.filter && typeof normalized.filter === 'object') {
      normalized.filter = this.sortObjectKeys(normalized.filter)
    }
    
    return normalized
  }

  /**
   * Generate hash from string
   * @private
   */
  generateHash(str) {
    let hash = 0
    if (str.length === 0) return hash.toString()
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36)
  }

  /**
   * Sort object keys recursively
   * @private
   */
  sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null) return obj
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item))
    }
    
    const sortedKeys = Object.keys(obj).sort()
    const sortedObj = {}
    
    sortedKeys.forEach(key => {
      sortedObj[key] = this.sortObjectKeys(obj[key])
    })
    
    return sortedObj
  }

  /**
   * Memory cache operations
   * @private
   */
  getFromMemoryCache(key) {
    const item = this.memoryCache.get(key)
    
    if (item && item.expiresAt > Date.now()) {
      return item.data
    } else if (item) {
      // Expired item
      this.memoryCache.delete(key)
      this.memoryCacheStats.size = this.memoryCache.size
    }
    
    return null
  }

  /**
   * Set memory cache with TTL
   * @private
   */
  setMemoryCache(key, data, ttlSeconds) {
    const expiresAt = Date.now() + (ttlSeconds * 1000)
    
    this.memoryCache.set(key, {
      data,
      expiresAt,
      createdAt: Date.now()
    })
    
    this.memoryCacheStats.size = this.memoryCache.size
    
    // Periodic cleanup of expired items
    this.scheduleMemoryCacheCleanup()
  }

  /**
   * Schedule memory cache cleanup
   * @private
   */
  scheduleMemoryCacheCleanup() {
    if (this.cleanupScheduled) return
    
    this.cleanupScheduled = true
    
    setTimeout(() => {
      this.cleanupMemoryCache()
      this.cleanupScheduled = false
    }, 60000) // Cleanup every minute
  }

  /**
   * Clean up expired memory cache items
   * @private
   */
  cleanupMemoryCache() {
    const now = Date.now()
    let cleanedCount = 0
    
    for (const [key, item] of this.memoryCache.entries()) {
      if (item.expiresAt <= now) {
        this.memoryCache.delete(key)
        cleanedCount++
      }
    }
    
    this.memoryCacheStats.size = this.memoryCache.size
    
    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired memory cache items`)
    }
  }

  /**
   * Track search cache for invalidation
   * @private
   */
  async trackSearchCache(searchKey, searchParams) {
    // This would track which search caches might be affected by data changes
    // Implementation depends on your specific invalidation strategy
  }

  /**
   * Determine if search cache should be invalidated
   * @private
   */
  async shouldInvalidateSearchCache(cacheKey, criteria) {
    // Implement logic to determine if a search cache should be invalidated
    // based on the criteria (e.g., country changes, regional updates, etc.)
    return true // Simplified - invalidate all for now
  }

  /**
   * Invalidate caches related to a country
   * @private
   */
  async invalidateRelatedCaches(countryId) {
    // Invalidate search caches that might include this country
    await this.invalidateSearchCaches({ affectedCountry: countryId })
    
    // Invalidate analytics caches that might include this country
    const analyticsPattern = this.generateCacheKey('analytics', '*')
    const redisClient = this.getDependency('redisClient')
    const analyticsKeys = await redisClient.keys(analyticsPattern)
    
    if (analyticsKeys.length > 0) {
      await redisClient.del(...analyticsKeys)
    }
  }

  /**
   * Count cache keys by type
   * @private
   */
  async countCacheKeysByType() {
    const redisClient = this.getDependency('redisClient')
    const pattern = this.generateCacheKey('*')
    const keys = await redisClient.keys(pattern)
    
    const counts = {
      country: 0,
      search: 0,
      analytics: 0,
      other: 0
    }
    
    keys.forEach(key => {
      if (key.includes(':country:')) counts.country++
      else if (key.includes(':search:')) counts.search++
      else if (key.includes(':analytics:')) counts.analytics++
      else counts.other++
    })
    
    return counts
  }

  /**
   * Placeholder methods for future implementation
   * @private
   */
  getAverageResponseTime() { return 0 }
  calculateCacheEfficiency() { return 0 }
  getUptime() { return Date.now() - this.startTime || 0 }
}

module.exports = CountryCacheService