const { BaseMiddleware } = require('backend-core')
const logger = require('../util/logger')
const cacheRoutes = require('../config').cacheRoutes
const { redisClient } = require('handlers/RootProvider')
const { stripTrailingSlash } = require('helpers').commonHelpers
const NodeCache = require('node-cache')
const { performance } = require('perf_hooks')
const crypto = require('crypto')

class CacheMiddleware extends BaseMiddleware {
  constructor(options = {}) {
    super(options)
    
    // Memory cache for frequently accessed items (L1 cache)
    this.memoryCache = new NodeCache({
      stdTTL: 300, // 5 minutes
      checkperiod: 60,
      maxKeys: 5000,
      deleteOnExpire: true,
      useClones: false
    })
    
    // Cache key metadata tracking
    this.cacheMetadata = new NodeCache({
      stdTTL: 3600, // 1 hour
      checkperiod: 300,
      maxKeys: 10000,
      deleteOnExpire: true
    })
    
    // Cache statistics and metrics
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      memoryHits: 0,
      redisHits: 0,
      averageResponseTime: 0,
      errors: 0,
      invalidations: 0,
      keyGenerations: 0
    }
    
    // Cache configuration
    this.config = {
      maxCacheSize: 5 * 1024 * 1024, // 5MB max cache size
      enableETag: true,
      enableLastModified: true,
      defaultTTL: 300, // 5 minutes
      maxTTL: 3600, // 1 hour
      enableVaryHeaders: true,
      enableStaleWhileRevalidate: true,
      staleMaxAge: 600 // 10 minutes stale tolerance
    }
    
    // Cache invalidation patterns
    this.invalidationPatterns = new Map([
      [/^\/api\/v1\/users\/\d+$/, ['/api/v1/users', '/api/v1/users/list']],
      [/^\/api\/v1\/stories\/\d+$/, ['/api/v1/stories', '/api/v1/stories/feed']],
      [/^\/api\/v1\/auth\//, ['*']], // Invalidate all on auth changes
      [/^\/api\/v1\/admin\//, ['*']] // Invalidate all on admin changes
    ])
    
    // Vary header handlers
    this.varyHandlers = new Map([
      ['Accept-Language', (req) => req.headers['accept-language']],
      ['Accept-Encoding', (req) => req.headers['accept-encoding']],
      ['User-Agent', (req) => this.normalizeUserAgent(req.headers['user-agent'])],
      ['Authorization', (req) => req.headers.authorization ? 'authenticated' : 'anonymous']
    ])
  }

  async init() {
    try {
      // Initialize cache warming and cleanup
      await this.setupCacheWarming()
      this.startMetricsCollection()
      this.setupCacheCleanup()
      
      logger.info(`${this.constructor.name} initialization completed successfully`)
    } catch (error) {
      logger.error(`${this.constructor.name} initialization failed:`, error)
      throw error
    }
  }

  async setupCacheWarming() {
    try {
      // Warm up cache with popular routes
      const popularRoutes = [
        '/api/v1/stories/feed',
        '/api/v1/users/current',
        '/api/v1/config/app'
      ]
      
      for (const route of popularRoutes) {
        const cacheKey = this.generateCacheKey(route, {})
        const metadata = {
          route,
          warmedUp: true,
          timestamp: Date.now()
        }
        this.cacheMetadata.set(`meta:${cacheKey}`, metadata)
      }
      
      logger.debug('Cache warming completed')
    } catch (error) {
      logger.error('Failed to warm up cache:', error)
    }
  }

  startMetricsCollection() {
    // Log metrics every 5 minutes
    setInterval(() => {
      this.logMetrics()
    }, 300000)
    
    // Cleanup stale cache entries every hour
    setInterval(() => {
      this.cleanupStaleEntries()
    }, 3600000)
  }

  setupCacheCleanup() {
    // Monitor memory usage and cleanup if needed
    setInterval(() => {
      const memUsage = process.memoryUsage()
      if (memUsage.heapUsed > 512 * 1024 * 1024) { // 512MB
        this.memoryCache.flushAll()
        logger.warn('Memory cache flushed due to high memory usage')
      }
    }, 60000)
  }

  logMetrics() {
    const cacheStats = {
      memoryCache: this.memoryCache.getStats(),
      metadata: this.cacheMetadata.getStats()
    }
    
    const hitRatio = this.metrics.totalRequests > 0 
      ? (this.metrics.cacheHits / this.metrics.totalRequests * 100).toFixed(2)
      : 0
    
    logger.info('CacheMiddleware Metrics:', {
      performance: {
        ...this.metrics,
        hitRatio: `${hitRatio}%`
      },
      cacheStats,
      memoryUsage: process.memoryUsage()
    })
  }

  async cleanupStaleEntries() {
    try {
      const keys = this.memoryCache.keys()
      let cleanedCount = 0
      
      for (const key of keys) {
        const metadata = this.cacheMetadata.get(`meta:${key}`)
        if (metadata && this.isCacheStale(metadata)) {
          this.memoryCache.del(key)
          this.cacheMetadata.del(`meta:${key}`)
          cleanedCount++
        }
      }
      
      logger.debug(`Cleaned up ${cleanedCount} stale cache entries`)
    } catch (error) {
      logger.error('Failed to cleanup stale cache entries:', error)
    }
  }

  isCacheStale(metadata) {
    const now = Date.now()
    const age = now - metadata.timestamp
    return age > (metadata.ttl || this.config.defaultTTL) * 1000
  }

  generateCacheKey(url, headers = {}, user = null) {
    const varyParts = []
    
    // Include vary headers in cache key
    for (const [header, handler] of this.varyHandlers) {
      const value = handler({ headers })
      if (value) {
        varyParts.push(`${header}:${value}`)
      }
    }
    
    // Include user context if available
    if (user) {
      varyParts.push(`user:${user.id}`)
      if (user.role) {
        varyParts.push(`role:${user.role}`)
      }
    }
    
    const keyData = {
      url: stripTrailingSlash(url),
      vary: varyParts.sort().join('|'),
      timestamp: Math.floor(Date.now() / 60000) // Round to minute for time-based cache
    }
    
    this.metrics.keyGenerations++
    return crypto.createHash('md5').update(JSON.stringify(keyData)).digest('hex')
  }

  normalizeUserAgent(userAgent) {
    if (!userAgent) return 'unknown'
    
    // Extract major browser/version
    const patterns = [
      /Chrome\/(\d+)/,
      /Firefox\/(\d+)/,
      /Safari\/(\d+)/,
      /Edge\/(\d+)/,
      /Opera\/(\d+)/
    ]
    
    for (const pattern of patterns) {
      const match = userAgent.match(pattern)
      if (match) {
        return match[0]
      }
    }
    
    return 'other'
  }

  generateETag(data) {
    const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')
    return `"${hash}"`
  }

  isRouteMatchingCache(url) {
    const cleanUrl = stripTrailingSlash(url)
    
    // Check exact matches first
    if (cacheRoutes.includes(cleanUrl)) {
      return true
    }
    
    // Check pattern matches
    for (const route of cacheRoutes) {
      const pattern = this.formatRoute(route)
      if (cleanUrl.match(pattern)) {
        return true
      }
    }
    
    return false
  }

  formatRoute(template) {
    const escaped = template.replace(/:[^/]+/g, '([^/]+)')
    return new RegExp(`^${escaped}$`)
  }

  async getFromMemoryCache(cacheKey) {
    const cached = this.memoryCache.get(cacheKey)
    if (cached) {
      this.metrics.memoryHits++
      return cached
    }
    return null
  }

  async getFromRedisCache(cacheKey) {
    try {
      const result = await redisClient.getKey(cacheKey)
      if (result) {
        this.metrics.redisHits++
        // Store in memory cache for faster access
        this.memoryCache.set(cacheKey, result, 300) // 5 minutes in memory
        return result
      }
      return null
    } catch (error) {
      logger.error('Redis cache retrieval failed:', error)
      this.metrics.errors++
      return null
    }
  }

  async setCache(cacheKey, data, ttl = null) {
    try {
      const finalTTL = ttl || this.config.defaultTTL
      
      // Store metadata
      const metadata = {
        timestamp: Date.now(),
        ttl: finalTTL,
        size: JSON.stringify(data).length
      }
      
      // Store in memory cache
      this.memoryCache.set(cacheKey, data, finalTTL)
      this.cacheMetadata.set(`meta:${cacheKey}`, metadata)
      
      // Store in Redis
      await redisClient.setKey(cacheKey, data, finalTTL)
      
      return true
    } catch (error) {
      logger.error('Cache storage failed:', error)
      this.metrics.errors++
      return false
    }
  }

  async invalidateCache(pattern) {
    try {
      this.metrics.invalidations++
      
      if (pattern === '*') {
        // Invalidate all cache
        this.memoryCache.flushAll()
        this.cacheMetadata.flushAll()
        // Note: Redis cache would need separate cleanup
        return
      }
      
      // Pattern-based invalidation
      const keys = this.memoryCache.keys()
      for (const key of keys) {
        const metadata = this.cacheMetadata.get(`meta:${key}`)
        if (metadata && metadata.route && metadata.route.match(pattern)) {
          this.memoryCache.del(key)
          this.cacheMetadata.del(`meta:${key}`)
        }
      }
    } catch (error) {
      logger.error('Cache invalidation failed:', error)
      this.metrics.errors++
    }
  }

  async handleConditionalRequests(req, cachedData) {
    const ifNoneMatch = req.headers['if-none-match']
    const ifModifiedSince = req.headers['if-modified-since']
    
    if (cachedData.etag && ifNoneMatch === cachedData.etag) {
      return { notModified: true }
    }
    
    if (cachedData.lastModified && ifModifiedSince) {
      const ifModifiedDate = new Date(ifModifiedSince)
      const lastModifiedDate = new Date(cachedData.lastModified)
      
      if (ifModifiedDate >= lastModifiedDate) {
        return { notModified: true }
      }
    }
    
    return { notModified: false }
  }

  handler() {
    return async (req, res, next) => {
      const startTime = performance.now()
      const requestId = req.requestId || crypto.randomUUID()
      
      try {
        this.metrics.totalRequests++
        
        const url = req.originalUrl
        
        // Check if route should be cached
        if (!this.isRouteMatchingCache(url)) {
          return next()
        }
        
        // Generate cache key
        const cacheKey = this.generateCacheKey(url, req.headers, req.currentUser)
        
        // Try memory cache first (L1)
        let cachedData = await this.getFromMemoryCache(cacheKey)
        
        // Try Redis cache if not in memory (L2)
        if (!cachedData) {
          cachedData = await this.getFromRedisCache(cacheKey)
        }
        
        if (cachedData) {
          try {
            // Handle conditional requests
            const conditionalResult = await this.handleConditionalRequests(req, cachedData)
            if (conditionalResult.notModified) {
              return res.status(304).end()
            }
            
            // Set cache headers
            const headers = cachedData.headers || {}
            if (this.config.enableETag && cachedData.etag) {
              headers['ETag'] = cachedData.etag
            }
            if (this.config.enableLastModified && cachedData.lastModified) {
              headers['Last-Modified'] = cachedData.lastModified
            }
            
            headers['X-Cache'] = 'HIT'
            headers['X-Cache-Key'] = cacheKey.substring(0, 8)
            headers['X-Cache-Source'] = 'memory'
            
            res.set(headers)
            
            this.metrics.cacheHits++
            
            // Performance tracking
            const processingTime = performance.now() - startTime
            this.metrics.averageResponseTime = 
              (this.metrics.averageResponseTime + processingTime) / 2
            
            logger.debug('Cache hit', {
              url,
              cacheKey: cacheKey.substring(0, 8),
              processingTime: `${processingTime.toFixed(2)}ms`,
              requestId
            })
            
            // Return cached response
            const responseData = { ...cachedData }
            delete responseData.headers
            delete responseData.status
            delete responseData.etag
            delete responseData.lastModified
            
            return res.json(responseData)
            
          } catch (error) {
            logger.error('Cache data processing failed:', error)
            this.metrics.errors++
            // Continue to next middleware on cache error
          }
        }
        
        // Cache miss - continue to next middleware
        this.metrics.cacheMisses++
        
        // Intercept response to cache it
        const originalJson = res.json
        
        res.json = async function(data) {
          try {
            // Generate cache headers
            const etag = self.config.enableETag ? self.generateETag(data) : null
            const lastModified = self.config.enableLastModified ? new Date().toUTCString() : null
            
            const cacheableData = {
              ...data,
              headers: res.getHeaders(),
              status: res.statusCode,
              etag,
              lastModified
            }
            
            // Store in cache if successful response
            if (res.statusCode >= 200 && res.statusCode < 300) {
              setImmediate(async () => {
                await self.setCache(cacheKey, cacheableData)
              })
            }
            
            // Set response headers
            if (etag) res.set('ETag', etag)
            if (lastModified) res.set('Last-Modified', lastModified)
            res.set('X-Cache', 'MISS')
            
          } catch (error) {
            logger.error('Response caching failed:', error)
          }
          
          return originalJson.call(this, data)
        }
        
        const self = this
        
        // Performance tracking
        const processingTime = performance.now() - startTime
        this.metrics.averageResponseTime = 
          (this.metrics.averageResponseTime + processingTime) / 2
        
        logger.debug('Cache miss', {
          url,
          cacheKey: cacheKey.substring(0, 8),
          processingTime: `${processingTime.toFixed(2)}ms`,
          requestId
        })
        
        next()
        
      } catch (error) {
        this.metrics.errors++
        const processingTime = performance.now() - startTime
        
        logger.error('CacheMiddleware error', {
          error: error.message,
          stack: error.stack,
          processingTime: `${processingTime.toFixed(2)}ms`,
          requestId,
          url: req.originalUrl
        })
        
        next()
      }
    }
  }

  // Cache management methods
  async purgeCache(pattern = '*') {
    return this.invalidateCache(pattern)
  }

  async warmCache(routes) {
    for (const route of routes) {
      const cacheKey = this.generateCacheKey(route, {})
      const metadata = {
        route,
        warmedUp: true,
        timestamp: Date.now()
      }
      this.cacheMetadata.set(`meta:${cacheKey}`, metadata)
    }
  }

  // Health check method
  getHealthStatus() {
    const memoryStats = this.memoryCache.getStats()
    const metadataStats = this.cacheMetadata.getStats()
    
    return {
      status: 'healthy',
      metrics: this.metrics,
      cacheStats: {
        memory: memoryStats,
        metadata: metadataStats
      },
      config: this.config,
      uptime: process.uptime()
    }
  }

  // Cleanup method for graceful shutdown
  async cleanup() {
    try {
      this.memoryCache.flushAll()
      this.cacheMetadata.flushAll()
      
      logger.info(`${this.constructor.name} cleanup completed`)
    } catch (error) {
      logger.error(`${this.constructor.name} cleanup failed:`, error)
    }
  }
}

module.exports = { CacheMiddleware }
