/**
 * Session Redis Cache Manager
 * 
 * Centralized Redis operations for session management across the application.
 * Provides consistent caching strategies, error handling, and fallback mechanisms
 * for session-related Redis operations.
 * 
 * Features:
 * - User session cache management
 * - Individual session operations
 * - Batch operations with error handling
 * - Consistent key naming strategy
 * - Fallback mechanisms for Redis failures
 * - Performance monitoring and logging
 * 
 * @author Susanoo Team
 * @version 1.0.0
 */

const { redisClient } = require('../../../handlers/RootProvider')
const sessionConfig = require('../../../config/session')
const logger = require('../../../util/logger')

/**
 * SessionCacheService - Centralized Redis session cache operations
 */
class SessionCacheService {
  /**
   * Clear all sessions for a specific user
   * @param {string} userId - User ID
   * @param {Object} logContext - Logging context
   * @returns {Promise<Object>} Operation result
   */
  static async clearUserSessions(userId, logContext = {}) {
    if (!redisClient) {
      logger.warn('Redis client not available, skipping session cache clear', logContext)
      return { success: false, fallback: true }
    }

    if (!sessionConfig?.redis?.userSessionsKey) {
      logger.warn('Session config not available, skipping cache operation', logContext)
      return { success: false, fallback: true }
    }

    try {
      const key = sessionConfig.redis.userSessionsKey(userId)
      await redisClient.removeKey(key)
      
      logger.debug('Successfully cleared user sessions from Redis cache', {
        ...logContext,
        userId,
        cacheKey: key
      })
      
      return { success: true, key }
    } catch (error) {
      logger.warn('Failed to clear user sessions from Redis cache', { 
        ...logContext, 
        userId,
        error: error.message,
        stack: error.stack
      })
      return { success: false, error: error.message }
    }
  }

  /**
   * Remove a specific session from user's session cache
   * @param {string} userId - User ID
   * @param {Object} sessionData - Session data to remove
   * @param {Object} logContext - Logging context
   * @returns {Promise<Object>} Operation result
   */
  static async removeSpecificSession(userId, sessionData, logContext = {}) {
    if (!redisClient) {
      logger.warn('Redis client not available, skipping session removal', logContext)
      return { success: false, fallback: true }
    }

    if (!sessionConfig?.redis?.userSessionsKey) {
      logger.warn('Session config not available, skipping cache operation', logContext)
      return { success: false, fallback: true }
    }

    try {
      const key = sessionConfig.redis.userSessionsKey(userId)
      const existing = await redisClient.getKey(key) || []
      
      if (!Array.isArray(existing)) {
        logger.warn('Invalid session cache format, clearing cache', {
          ...logContext,
          userId,
          existingType: typeof existing
        })
        await redisClient.removeKey(key)
        return { success: true, removed: 0, cleared: true }
      }
      
      // Remove session by refresh token or session ID
      const filtered = existing.filter(session => 
        session.refreshToken !== sessionData.refreshToken && 
        session.id !== sessionData.id
      )
      
      const removedCount = existing.length - filtered.length
      
      if (filtered.length === 0) {
        // Remove the key entirely if no sessions left
        await redisClient.removeKey(key)
      } else {
        // Update with filtered sessions
        await redisClient.setKey(key, filtered, sessionConfig.redis.defaultTTL)
      }
      
      logger.debug('Successfully removed specific session from Redis cache', {
        ...logContext,
        userId,
        sessionId: sessionData.id,
        refreshToken: sessionData.refreshToken ? '***' : undefined,
        removedCount,
        remainingSessions: filtered.length
      })
      
      return { success: true, removed: removedCount, remaining: filtered.length }
    } catch (error) {
      logger.warn('Failed to remove specific session from Redis cache', { 
        ...logContext, 
        userId,
        sessionId: sessionData.id,
        error: error.message,
        stack: error.stack
      })
      return { success: false, error: error.message }
    }
  }

  /**
   * Add a session to user's session cache
   * @param {string} userId - User ID
   * @param {Object} sessionData - Session data to add
   * @param {Object} logContext - Logging context
   * @returns {Promise<Object>} Operation result
   */
  static async addSession(userId, sessionData, logContext = {}) {
    if (!redisClient) {
      logger.warn('Redis client not available, skipping session addition', logContext)
      return { success: false, fallback: true }
    }

    if (!sessionConfig?.redis?.userSessionsKey) {
      logger.warn('Session config not available, skipping cache operation', logContext)
      return { success: false, fallback: true }
    }

    try {
      const key = sessionConfig.redis.userSessionsKey(userId)
      const existing = await redisClient.getKey(key) || []
      
      if (!Array.isArray(existing)) {
        logger.warn('Invalid session cache format, resetting cache', {
          ...logContext,
          userId,
          existingType: typeof existing
        })
        // Reset with new session only
        await redisClient.setKey(key, [sessionData], sessionConfig.redis.defaultTTL)
        return { success: true, added: 1, total: 1, reset: true }
      }
      
      // Add new session
      existing.push(sessionData)
      await redisClient.setKey(key, existing, sessionConfig.redis.defaultTTL)
      
      logger.debug('Successfully added session to Redis cache', {
        ...logContext,
        userId,
        sessionId: sessionData.id,
        totalSessions: existing.length
      })
      
      return { success: true, added: 1, total: existing.length }
    } catch (error) {
      logger.warn('Failed to add session to Redis cache', { 
        ...logContext, 
        userId,
        sessionId: sessionData?.id,
        error: error.message,
        stack: error.stack
      })
      return { success: false, error: error.message }
    }
  }

  /**
   * Get all sessions for a user from cache
   * @param {string} userId - User ID
   * @param {Object} logContext - Logging context
   * @returns {Promise<Object>} Operation result with sessions
   */
  static async getUserSessions(userId, logContext = {}) {
    if (!redisClient) {
      logger.warn('Redis client not available, returning empty sessions', logContext)
      return { success: false, sessions: [], fallback: true }
    }

    if (!sessionConfig?.redis?.userSessionsKey) {
      logger.warn('Session config not available, returning empty sessions', logContext)
      return { success: false, sessions: [], fallback: true }
    }

    try {
      const key = sessionConfig.redis.userSessionsKey(userId)
      const sessions = await redisClient.getKey(key) || []
      
      if (!Array.isArray(sessions)) {
        logger.warn('Invalid session cache format, clearing and returning empty', {
          ...logContext,
          userId,
          existingType: typeof sessions
        })
        await redisClient.removeKey(key)
        return { success: true, sessions: [], cleared: true }
      }
      
      logger.debug('Successfully retrieved user sessions from Redis cache', {
        ...logContext,
        userId,
        sessionCount: sessions.length
      })
      
      return { success: true, sessions, count: sessions.length }
    } catch (error) {
      logger.warn('Failed to get user sessions from Redis cache', { 
        ...logContext, 
        userId,
        error: error.message
      })
      return { success: false, sessions: [], error: error.message }
    }
  }

  /**
   * Update session data in cache
   * @param {string} userId - User ID
   * @param {Object} sessionData - Updated session data
   * @param {Object} logContext - Logging context
   * @returns {Promise<Object>} Operation result
   */
  static async updateSession(userId, sessionData, logContext = {}) {
    if (!redisClient || !sessionConfig?.redis?.userSessionsKey) {
      return { success: false, fallback: true }
    }

    try {
      const key = sessionConfig.redis.userSessionsKey(userId)
      const existing = await redisClient.getKey(key) || []
      
      if (!Array.isArray(existing)) {
        // If cache is corrupted, just add the session
        await redisClient.setKey(key, [sessionData], sessionConfig.redis.defaultTTL)
        return { success: true, updated: 1, total: 1, reset: true }
      }
      
      // Find and update existing session
      const sessionIndex = existing.findIndex(session => 
        session.id === sessionData.id || session.refreshToken === sessionData.refreshToken
      )
      
      if (sessionIndex !== -1) {
        existing[sessionIndex] = sessionData
        await redisClient.setKey(key, existing, sessionConfig.redis.defaultTTL)
        
        logger.debug('Successfully updated session in Redis cache', {
          ...logContext,
          userId,
          sessionId: sessionData.id,
          sessionIndex
        })
        
        return { success: true, updated: 1, total: existing.length }
      } else {
        // Session not found, add it
        existing.push(sessionData)
        await redisClient.setKey(key, existing, sessionConfig.redis.defaultTTL)
        
        return { success: true, added: 1, total: existing.length }
      }
    } catch (error) {
      logger.warn('Failed to update session in Redis cache', { 
        ...logContext, 
        userId,
        sessionId: sessionData?.id,
        error: error.message
      })
      return { success: false, error: error.message }
    }
  }

  /**
   * Clean up expired sessions from cache
   * @param {string} userId - User ID
   * @param {Object} logContext - Logging context
   * @returns {Promise<Object>} Operation result
   */
  static async cleanupExpiredSessions(userId, logContext = {}) {
    if (!redisClient || !sessionConfig?.redis?.userSessionsKey) {
      return { success: false, fallback: true }
    }

    try {
      const key = sessionConfig.redis.userSessionsKey(userId)
      const existing = await redisClient.getKey(key) || []
      
      if (!Array.isArray(existing)) {
        await redisClient.removeKey(key)
        return { success: true, cleaned: 0, total: 0, reset: true }
      }
      
      const now = Date.now()
      const active = existing.filter(session => session.expiredAt > now)
      const cleaned = existing.length - active.length
      
      if (cleaned > 0) {
        if (active.length === 0) {
          await redisClient.removeKey(key)
        } else {
          await redisClient.setKey(key, active, sessionConfig.redis.defaultTTL)
        }
        
        logger.debug('Cleaned up expired sessions from Redis cache', {
          ...logContext,
          userId,
          cleaned,
          remaining: active.length
        })
      }
      
      return { success: true, cleaned, remaining: active.length }
    } catch (error) {
      logger.warn('Failed to cleanup expired sessions from Redis cache', { 
        ...logContext, 
        userId,
        error: error.message
      })
      return { success: false, error: error.message }
    }
  }

  /**
   * Check if Redis is available and properly configured
   * @returns {boolean} Availability status
   */
  static isAvailable() {
    return !!(redisClient && sessionConfig?.redis?.userSessionsKey)
  }

  /**
   * Get cache statistics for monitoring
   * @returns {Object} Cache statistics
   */
  static getStats() {
    return {
      available: this.isAvailable(),
      redisClient: !!redisClient,
      sessionConfig: !!sessionConfig?.redis?.userSessionsKey,
      defaultTTL: sessionConfig?.redis?.defaultTTL || 'unknown'
    }
  }
}

module.exports = SessionCacheService