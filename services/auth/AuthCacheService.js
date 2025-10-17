/**
 * AuthCacheService - Authentication Caching Service
 * 
 * Intelligent caching service for authentication data including:
 * - Session caching and management
 * - User data caching
 * - Token blacklisting and validation
 * - Authentication state caching
 * - Rate limiting data caching
 * - Security event caching
 * - Performance optimization
 * 
 * @version 1.0.0
 * @author Susanoo API Team
 */

const BaseService = require('../BaseService')
const { ErrorWrapper } = require('backend-core')
const joi = require('joi')

/**
 * Specialized caching service for authentication operations
 */
class AuthCacheService extends BaseService {
  constructor(options = {}) {
    super(options)
    
    // Register dependencies
    this.registerDependency('redisClient', options.redisClient)
    
    // Cache configuration
    this.config = {
      // TTL settings (in seconds)
      ttl: {
        session: 3600,          // 1 hour
        user: 1800,             // 30 minutes
        blacklistedToken: 86400, // 24 hours
        rateLimiting: 900,      // 15 minutes
        securityEvent: 3600,    // 1 hour
        otpChallenge: 300       // 5 minutes
      },
      
      // Cache key prefixes
      keyPrefix: 'auth:',
      
      // Performance settings
      batchSize: 100,
      compressionThreshold: 1024, // Compress data larger than 1KB
      
      ...options.config
    }
    
    // In-memory fallback cache
    this.memoryCache = new Map()
    this.memoryCacheStats = {
      hits: 0,
      misses: 0,
      size: 0
    }
  }

  /**
   * Cache user session data
   * @param {string} sessionId - Session ID
   * @param {Object} sessionData - Session data to cache
   * @param {Object} options - Cache options
   * @returns {Promise<boolean>} Success status
   */
  async cacheSession(sessionId, sessionData, options = {}) {
    return this.executeOperation('cacheSession', async (context) => {
      const cacheKey = this.generateCacheKey('session', sessionId)
      const ttl = options.ttl || this.config.ttl.session
      
      // Prepare session data for caching
      const cacheData = {
        ...sessionData,
        cachedAt: new Date(),
        ttl
      }
      
      // Cache in Redis if available
      const redisClient = this.getDependency('redisClient')
      if (redisClient) {
        try {
          await redisClient.setex(cacheKey, ttl, JSON.stringify(cacheData))
        } catch (error) {
          this.logger.warn('Failed to cache session in Redis', {
            sessionId,
            error: error.message
          })
        }
      }
      
      // Also cache in memory for faster access
      this.setMemoryCache(cacheKey, cacheData, ttl)
      
      this.emit('auth_cache:session_cached', { sessionId, ttl, context })
      
      return true
    }, { sessionId, options })
  }

  /**
   * Get cached session data
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Cached session data
   */
  async getSession(sessionId) {
    return this.executeOperation('getSession', async (context) => {
      const cacheKey = this.generateCacheKey('session', sessionId)
      
      // Try memory cache first
      const memoryResult = this.getFromMemoryCache(cacheKey)
      if (memoryResult) {
        this.memoryCacheStats.hits++
        this.emit('auth_cache:memory_hit', { key: cacheKey, context })
        return memoryResult
      }
      
      this.memoryCacheStats.misses++
      
      // Try Redis cache
      const redisClient = this.getDependency('redisClient')
      if (redisClient) {
        try {
          const cachedData = await redisClient.get(cacheKey)
          if (cachedData) {
            const parsed = JSON.parse(cachedData)
            
            // Store in memory cache for faster next access
            this.setMemoryCache(cacheKey, parsed, this.config.ttl.session)
            
            this.emit('auth_cache:redis_hit', { key: cacheKey, context })
            return parsed
          }
        } catch (error) {
          this.logger.warn('Failed to get session from Redis', {
            sessionId,
            error: error.message
          })
        }
      }
      
      this.emit('auth_cache:miss', { key: cacheKey, context })
      return null
    }, { sessionId })
  }

  /**
   * Invalidate session cache
   * @param {string} sessionId - Session ID to invalidate
   * @returns {Promise<boolean>} Success status
   */
  async invalidateSession(sessionId) {
    return this.executeOperation('invalidateSession', async (context) => {
      const cacheKey = this.generateCacheKey('session', sessionId)
      
      // Remove from Redis
      const redisClient = this.getDependency('redisClient')
      if (redisClient) {
        try {
          await redisClient.del(cacheKey)
        } catch (error) {
          this.logger.warn('Failed to invalidate session in Redis', {
            sessionId,
            error: error.message
          })
        }
      }
      
      // Remove from memory cache
      this.memoryCache.delete(cacheKey)
      this.memoryCacheStats.size = this.memoryCache.size
      
      this.emit('auth_cache:session_invalidated', { sessionId, context })
      
      return true
    }, { sessionId })
  }

  /**
   * Cache user data for authentication
   * @param {number} userId - User ID
   * @param {Object} userData - User data to cache
   * @param {Object} options - Cache options
   * @returns {Promise<boolean>} Success status
   */
  async cacheUser(userId, userData, options = {}) {
    return this.executeOperation('cacheUser', async (context) => {
      const cacheKey = this.generateCacheKey('user', userId)
      const ttl = options.ttl || this.config.ttl.user
      
      // Sanitize user data for caching (remove sensitive fields)
      const sanitizedData = this.sanitizeUserData(userData)
      
      const cacheData = {
        ...sanitizedData,
        cachedAt: new Date(),
        ttl
      }
      
      // Cache in Redis
      const redisClient = this.getDependency('redisClient')
      if (redisClient) {
        try {
          await redisClient.setex(cacheKey, ttl, JSON.stringify(cacheData))
        } catch (error) {
          this.logger.warn('Failed to cache user in Redis', {
            userId,
            error: error.message
          })
        }
      }
      
      // Cache in memory
      this.setMemoryCache(cacheKey, cacheData, ttl)
      
      this.emit('auth_cache:user_cached', { userId, ttl, context })
      
      return true
    }, { userId, options })
  }

  /**
   * Get cached user data
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} Cached user data
   */
  async getUser(userId) {
    return this.executeOperation('getUser', async (context) => {
      const cacheKey = this.generateCacheKey('user', userId)
      
      // Try memory cache first
      const memoryResult = this.getFromMemoryCache(cacheKey)
      if (memoryResult) {
        this.memoryCacheStats.hits++
        return memoryResult
      }
      
      this.memoryCacheStats.misses++
      
      // Try Redis cache
      const redisClient = this.getDependency('redisClient')
      if (redisClient) {
        try {
          const cachedData = await redisClient.get(cacheKey)
          if (cachedData) {
            const parsed = JSON.parse(cachedData)
            this.setMemoryCache(cacheKey, parsed, this.config.ttl.user)
            return parsed
          }
        } catch (error) {
          this.logger.warn('Failed to get user from Redis', {
            userId,
            error: error.message
          })
        }
      }
      
      return null
    }, { userId })
  }

  /**
   * Blacklist token (for logout, revocation)
   * @param {string} token - Token to blacklist
   * @param {Object} options - Blacklist options
   * @returns {Promise<boolean>} Success status
   */
  async blacklistToken(token, options = {}) {
    return this.executeOperation('blacklistToken', async (context) => {
      // Generate token hash for storage (don't store full token)
      const tokenHash = this.hashToken(token)
      const cacheKey = this.generateCacheKey('blacklist', tokenHash)
      const ttl = options.ttl || this.config.ttl.blacklistedToken
      
      const blacklistData = {
        tokenHash,
        blacklistedAt: new Date(),
        reason: options.reason || 'MANUAL_REVOCATION',
        ttl
      }
      
      // Store in Redis
      const redisClient = this.getDependency('redisClient')
      if (redisClient) {
        try {
          await redisClient.setex(cacheKey, ttl, JSON.stringify(blacklistData))
        } catch (error) {
          this.logger.warn('Failed to blacklist token in Redis', {
            error: error.message
          })
        }
      }
      
      // Store in memory
      this.setMemoryCache(cacheKey, blacklistData, ttl)
      
      this.emit('auth_cache:token_blacklisted', { tokenHash, reason: options.reason, context })
      
      return true
    }, { token: '***', options })
  }

  /**
   * Check if token is blacklisted
   * @param {string} token - Token to check
   * @returns {Promise<boolean>} True if blacklisted
   */
  async isTokenBlacklisted(token) {
    return this.executeOperation('isTokenBlacklisted', async (context) => {
      const tokenHash = this.hashToken(token)
      const cacheKey = this.generateCacheKey('blacklist', tokenHash)
      
      // Check memory cache first
      const memoryResult = this.getFromMemoryCache(cacheKey)
      if (memoryResult) {
        this.emit('auth_cache:blacklist_hit', { tokenHash, source: 'memory', context })
        return true
      }
      
      // Check Redis cache
      const redisClient = this.getDependency('redisClient')
      if (redisClient) {
        try {
          const cachedData = await redisClient.get(cacheKey)
          if (cachedData) {
            const parsed = JSON.parse(cachedData)
            this.setMemoryCache(cacheKey, parsed, this.config.ttl.blacklistedToken)
            this.emit('auth_cache:blacklist_hit', { tokenHash, source: 'redis', context })
            return true
          }
        } catch (error) {
          this.logger.warn('Failed to check blacklist in Redis', {
            error: error.message
          })
        }
      }
      
      return false
    }, { token: '***' })
  }

  /**
   * Cache rate limiting data
   * @param {string} identifier - Rate limit identifier (IP, user ID, etc.)
   * @param {Object} limitData - Rate limiting data
   * @param {Object} options - Cache options
   * @returns {Promise<boolean>} Success status
   */
  async cacheRateLimit(identifier, limitData, options = {}) {
    return this.executeOperation('cacheRateLimit', async (context) => {
      const cacheKey = this.generateCacheKey('ratelimit', identifier)
      const ttl = options.ttl || this.config.ttl.rateLimiting
      
      const cacheData = {
        ...limitData,
        updatedAt: new Date(),
        ttl
      }
      
      // Cache in Redis
      const redisClient = this.getDependency('redisClient')
      if (redisClient) {
        try {
          await redisClient.setex(cacheKey, ttl, JSON.stringify(cacheData))
        } catch (error) {
          this.logger.warn('Failed to cache rate limit in Redis', {
            identifier,
            error: error.message
          })
        }
      }
      
      // Cache in memory for faster access
      this.setMemoryCache(cacheKey, cacheData, ttl)
      
      return true
    }, { identifier, limitData })
  }

  /**
   * Get rate limiting data
   * @param {string} identifier - Rate limit identifier
   * @returns {Promise<Object|null>} Rate limiting data
   */
  async getRateLimit(identifier) {
    return this.executeOperation('getRateLimit', async (context) => {
      const cacheKey = this.generateCacheKey('ratelimit', identifier)
      
      // Check memory cache first
      const memoryResult = this.getFromMemoryCache(cacheKey)
      if (memoryResult) {
        return memoryResult
      }
      
      // Check Redis cache
      const redisClient = this.getDependency('redisClient')
      if (redisClient) {
        try {
          const cachedData = await redisClient.get(cacheKey)
          if (cachedData) {
            const parsed = JSON.parse(cachedData)
            this.setMemoryCache(cacheKey, parsed, this.config.ttl.rateLimiting)
            return parsed
          }
        } catch (error) {
          this.logger.warn('Failed to get rate limit from Redis', {
            identifier,
            error: error.message
          })
        }
      }
      
      return null
    }, { identifier })
  }

  /**
   * Cache OTP challenge data
   * @param {string} challengeId - Challenge ID
   * @param {Object} challengeData - Challenge data
   * @returns {Promise<boolean>} Success status
   */
  async cacheOTPChallenge(challengeId, challengeData) {
    return this.executeOperation('cacheOTPChallenge', async (context) => {
      const cacheKey = this.generateCacheKey('otp', challengeId)
      const ttl = this.config.ttl.otpChallenge
      
      const cacheData = {
        ...challengeData,
        createdAt: new Date(),
        ttl
      }
      
      // Cache in Redis
      const redisClient = this.getDependency('redisClient')
      if (redisClient) {
        try {
          await redisClient.setex(cacheKey, ttl, JSON.stringify(cacheData))
        } catch (error) {
          this.logger.warn('Failed to cache OTP challenge in Redis', {
            challengeId,
            error: error.message
          })
        }
      }
      
      // Cache in memory
      this.setMemoryCache(cacheKey, cacheData, ttl)
      
      this.emit('auth_cache:otp_cached', { challengeId, ttl, context })
      
      return true
    }, { challengeId, challengeData })
  }

  /**
   * Get and consume OTP challenge (single use)
   * @param {string} challengeId - Challenge ID
   * @returns {Promise<Object|null>} Challenge data
   */
  async consumeOTPChallenge(challengeId) {
    return this.executeOperation('consumeOTPChallenge', async (context) => {
      const cacheKey = this.generateCacheKey('otp', challengeId)
      
      // Get from Redis
      const redisClient = this.getDependency('redisClient')
      let challengeData = null
      
      if (redisClient) {
        try {
          const cachedData = await redisClient.get(cacheKey)
          if (cachedData) {
            challengeData = JSON.parse(cachedData)
            // Immediately delete to ensure single use
            await redisClient.del(cacheKey)
          }
        } catch (error) {
          this.logger.warn('Failed to consume OTP challenge from Redis', {
            challengeId,
            error: error.message
          })
        }
      }
      
      // Remove from memory cache
      this.memoryCache.delete(cacheKey)
      this.memoryCacheStats.size = this.memoryCache.size
      
      if (challengeData) {
        this.emit('auth_cache:otp_consumed', { challengeId, context })
      }
      
      return challengeData
    }, { challengeId })
  }

  // ===============================
  // PRIVATE CACHE METHODS
  // ===============================

  /**
   * Generate cache key with prefix
   * @private
   */
  generateCacheKey(type, identifier) {
    return `${this.config.keyPrefix}${type}:${identifier}`
  }

  /**
   * Hash token for secure storage
   * @private
   */
  hashToken(token) {
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  /**
   * Sanitize user data for caching
   * @private
   */
  sanitizeUserData(userData) {
    const sanitized = { ...userData }
    
    // Remove sensitive fields
    delete sanitized.password
    delete sanitized.passwordResetToken
    delete sanitized.emailConfirmToken
    delete sanitized.twoFactorSecret
    
    return sanitized
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
  }
}

module.exports = AuthCacheService