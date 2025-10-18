const { BaseDAO } = require('backend-core')
// TODO: Replace with proper service injection
let redisClient = null
try {
  redisClient = require('handlers/RootProvider').redisClient
} catch (error) {
  // RootProvider not available, continue without Redis
  redisClient = null
}
const sessionConfig = require('../../config/session')

/**
 * Enterprise Session Data Access Object (DAO)
 *
 * Advanced database operations for session management with enterprise features
 * including security analytics, performance optimization, session lifecycle
 * management, and comprehensive monitoring capabilities.
 *
 * Features:
 * - Enhanced session retrieval and management
 * - Security analytics and threat detection
 * - Performance optimization with caching
 * - Session lifecycle and cleanup operations
 * - Advanced querying and filtering
 * - Audit trail and compliance support
 *
 * @author Susanoo Team
 * @version 2.0.0
 */

class SessionDAO extends BaseDAO {
  static get tableName() {
    return 'sessions'
  }

  constructor() {
    super('sessions')
  }

  /**
   * ===============================
   * ENHANCED CORE OPERATIONS
   * ===============================
   */

  /**
   * Retrieve session by refresh token with security validation
   * @param {string} refreshToken - The refresh token to search for
   * @param {Object} options - Query options
   * @returns {Promise<Object|null>} Session record or null
   */
  async getByRefreshToken(refreshToken, options = {}) {
    const { includeExpired = false, validateSecurity = true } = options

    try {
      let query = this.db(this.tableName)
        .where('refreshToken', refreshToken)

      // Filter out expired sessions unless explicitly requested
      if (!includeExpired) {
        query = query.where('expiredAt', '>', Date.now())
      }

      const session = await query.first()

      if (!session) {
        return null
      }

      // Security validation
      if (validateSecurity) {
        const securityCheck = await this.validateSessionSecurity(session)
        if (!securityCheck.isValid) {
          // Log security violation
          console.warn('Session security validation failed:', {
            sessionId: session.id,
            violations: securityCheck.violations
          })
          
          // Mark session as compromised if critical issues found
          if (securityCheck.violations.some(v => v.severity === 'critical')) {
            await this.markSessionCompromised(session.id)
            return null
          }
        }
      }

      return session
    } catch (error) {
      console.error('Error retrieving session by refresh token:', error)
      throw error
    }
  }

  /**
   * Remove other sessions for a user (enhanced with security options)
   * @param {string} userId - The user ID
   * @param {string} currentSessionId - Current session to keep
   * @param {Object} options - Removal options
   * @returns {Promise<number>} Number of sessions removed
   */
  async removeOtherSessions(userId, currentSessionId, options = {}) {
    const { 
      keepMobileSession = false, 
      auditReason = 'user_logout',
      logActivity = true
    } = options

    try {
      let query = this.db(this.tableName)
        .where('userId', userId)
        .whereNot('id', currentSessionId)

      // Optionally keep mobile sessions
      if (keepMobileSession) {
        query = query.whereNot('sessionType', 'mobile')
      }

      // Log session removal activity
      if (logActivity) {
        const sessionsToRemove = await query.clone().select('id', 'ipAddress', 'ua', 'sessionType')
        for (const session of sessionsToRemove) {
          const ipAddress = session.ipAddress || 'unknown'
          await this.logSessionActivity(session.id, 'session_terminated', {
            reason: auditReason,
            terminatedBy: currentSessionId,
            ipAddress,
            userAgent: session.ua
          })
        }
      }

      const removedCount = await query.del()
      
      return removedCount
    } catch (error) {
      console.error('Error removing other sessions:', error)
      throw error
    }
  }

  /**
   * Get user session count with filtering options
   * @param {string} userId - The user ID
   * @param {Object} options - Counting options
   * @returns {Promise<Object>} Session count statistics
   */
  async getUserSessionsCount(userId, options = {}) {
    const { 
      includeExpired = false, 
      groupByType = false,
      includeSecurityStats = false 
    } = options

    try {
      let baseQuery = this.db(this.tableName).where('userId', userId)

      if (!includeExpired) {
        baseQuery = baseQuery.where('expiredAt', '>', Date.now())
      }

      const results = {
        total: 0,
        active: 0,
        expired: 0
      }

      if (groupByType) {
        const typeStats = await baseQuery.clone()
          .select('sessionType')
          .count('* as count')
          .groupBy('sessionType')

        results.byType = {}
        for (const stat of typeStats) {
          results.byType[stat.sessionType || 'unknown'] = parseInt(stat.count)
          results.total += parseInt(stat.count)
        }
      } else {
        const totalCount = await baseQuery.clone().count('* as count').first()
        results.total = parseInt(totalCount.count)
      }

      // Get active vs expired breakdown
      const now = Date.now()
      const activeCount = await this.db(this.tableName)
        .where('userId', userId)
        .where('expiredAt', '>', now)
        .count('* as count')
        .first()

      const expiredCount = await this.db(this.tableName)
        .where('userId', userId)
        .where('expiredAt', '<=', now)
        .count('* as count')
        .first()

      results.active = parseInt(activeCount.count)
      results.expired = parseInt(expiredCount.count)

      // Include security statistics if requested
      if (includeSecurityStats) {
        results.security = await this.getSessionSecurityStats(userId)
      }

      return results
    } catch (error) {
      console.error('Error getting user sessions count:', error)
      throw error
    }
  }

  /**
   * Get active sessions with enhanced filtering
   * @param {string} userId - The user ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Active sessions
   */
  async getActiveSessions(userId, options = {}) {
    const { 
      limit = 50, 
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeMetadata = false,
      securityLevel = null
    } = options

    try {
      let query = this.db(this.tableName)
        .where('userId', userId)
        .where('expiredAt', '>', Date.now())
        .limit(limit)
        .offset(offset)
        .orderBy(sortBy, sortOrder)

      // Filter by security level if specified
      if (securityLevel) {
        query = query.where('securityLevel', securityLevel)
      }

      const sessions = await query

      // Process sessions for API response
      return sessions.map(session => {
        const ipAddress = session.ipAddress || null
        const processedSession = {
          id: session.id,
          fingerprint: session.fingerprint,
          ipAddress,
          sessionType: session.sessionType,
          securityLevel: session.securityLevel,
          createdAt: session.createdAt,
          expiredAt: session.expiredAt,
          lastActivity: session.updatedAt
        }

        // Include metadata if requested
        if (includeMetadata && session.metadata) {
          try {
            processedSession.metadata = typeof session.metadata === 'string' 
              ? JSON.parse(session.metadata) 
              : session.metadata
          } catch {
            console.warn('Invalid metadata in session:', session.id)
          }
        }

        return processedSession
      })
    } catch (error) {
      console.error('Error getting active sessions:', error)
      throw error
    }
  }

  /**
   * ===============================
   * ENTERPRISE SECURITY METHODS
   * ===============================
   */

  /**
   * Validate session security against enterprise policies
   * @param {Object} session - Session record
   * @returns {Promise<Object>} Security validation result
   */
  async validateSessionSecurity(session) {
    const violations = []
    const warnings = []

    try {
      // Check session age limits
      const sessionAge = Date.now() - session.createdAt
      const maxAge = 30 * 24 * 60 * 60 * 1000 // 30 days
      
      if (sessionAge > maxAge) {
        violations.push({
          type: 'SESSION_TOO_OLD',
          severity: 'high',
          message: 'Session exceeds maximum age limit',
          age: sessionAge,
          limit: maxAge
        })
      }

      // Check for suspicious IP patterns
      const ipAddress = session.ipAddress || null
      if (await this.isSuspiciousIP(ipAddress)) {
        violations.push({
          type: 'SUSPICIOUS_IP',
          severity: 'medium',
          message: 'Session from suspicious IP address',
          ipAddress
        })
      }

      // Check for concurrent session anomalies
      const userSessionCount = await this.getUserSessionsCount(session.userId, { includeExpired: false })
      if (userSessionCount.total > 10) {
        warnings.push({
          type: 'HIGH_SESSION_COUNT',
          message: 'User has unusually high number of active sessions',
          count: userSessionCount.total
        })
      }

      // Check device fingerprint consistency
      if (await this.hasInconsistentFingerprint(session)) {
        violations.push({
          type: 'FINGERPRINT_ANOMALY',
          severity: 'medium',
          message: 'Device fingerprint inconsistency detected'
        })
      }

      return {
        isValid: violations.length === 0,
        violations,
        warnings,
        riskScore: this.calculateRiskScore(violations, warnings)
      }
    } catch (error) {
      console.error('Error validating session security:', error)
      return {
        isValid: false,
        violations: [{ type: 'VALIDATION_ERROR', severity: 'critical', message: error.message }],
        warnings: [],
        riskScore: 100
      }
    }
  }

  /**
   * Get security statistics for user sessions
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Security statistics
   */
  async getSessionSecurityStats(userId) {
    try {
      const stats = {
        totalSessions: 0,
        securityLevels: { low: 0, medium: 0, high: 0, critical: 0 },
        suspiciousIPs: 0,
        compromisedSessions: 0,
        averageSessionDuration: 0
      }

      // Get security level distribution
      const securityLevelStats = await this.db(this.tableName)
        .where('userId', userId)
        .select('securityLevel')
        .count('* as count')
        .groupBy('securityLevel')

      for (const stat of securityLevelStats) {
        const level = stat.securityLevel || 'low'
        stats.securityLevels[level] = parseInt(stat.count)
        stats.totalSessions += parseInt(stat.count)
      }

      // Check for suspicious IPs
      const uniqueIPs = await this.db(this.tableName)
        .where('userId', userId)
        .distinct('ipAddress')

      for (const { ipAddress } of uniqueIPs) {
        if (await this.isSuspiciousIP(ipAddress)) {
          stats.suspiciousIPs++
        }
      }

      // Calculate average session duration
      const sessionDurations = await this.db(this.tableName)
        .where('userId', userId)
        .where('expiredAt', '>', 'createdAt')
        .select(this.db.raw('AVG(expiredAt - createdAt) as avgDuration'))
        .first()

      stats.averageSessionDuration = sessionDurations.avgDuration || 0

      return stats
    } catch (error) {
      console.error('Error getting session security stats:', error)
      throw error
    }
  }

  /**
   * Mark session as compromised
   * @param {string} sessionId - Session ID
   * @param {string} reason - Compromise reason
   * @returns {Promise<boolean>} Success status
   */
  async markSessionCompromised(sessionId, reason = 'security_violation') {
    try {
      await this.db(this.tableName)
        .where('id', sessionId)
        .update({
          securityLevel: 'critical',
          expiredAt: Date.now(), // Immediately expire
          metadata: this.db.raw(`
            COALESCE(metadata, '{}')::jsonb || 
            '{"compromised": true, "compromiseReason": "${reason}", "compromisedAt": ${Date.now()}}'::jsonb
          `)
        })

      // Log security incident
      await this.logSessionActivity(sessionId, 'session_compromised', {
        reason,
        timestamp: Date.now(),
        action: 'auto_termination'
      })

      return true
    } catch (error) {
      console.error('Error marking session as compromised:', error)
      return false
    }
  }

  /**
   * ===============================
   * PERFORMANCE & ANALYTICS METHODS
   * ===============================
   */

  /**
   * Search sessions with advanced filtering
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results with pagination
   */
  async searchSessions(criteria = {}, options = {}) {
    const {
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeExpired = false
    } = options

    try {
      let query = this.db(this.tableName)

      // Apply search criteria
      if (criteria.userId) {
        query = query.where('userId', criteria.userId)
      }

      const searchIp = criteria.ipAddress || criteria.ip
      if (searchIp) {
        query = query.where('ipAddress', searchIp)
      }

      if (criteria.securityLevel) {
        query = query.where('securityLevel', criteria.securityLevel)
      }

      if (criteria.sessionType) {
        query = query.where('sessionType', criteria.sessionType)
      }

      if (criteria.fingerprint) {
        query = query.where('fingerprint', 'like', `%${criteria.fingerprint}%`)
      }

      if (criteria.dateRange) {
        if (criteria.dateRange.from) {
          query = query.where('createdAt', '>=', criteria.dateRange.from)
        }
        if (criteria.dateRange.to) {
          query = query.where('createdAt', '<=', criteria.dateRange.to)
        }
      }

      // Filter expired sessions
      if (!includeExpired) {
        query = query.where('expiredAt', '>', Date.now())
      }

      // Get total count for pagination
      const totalCountQuery = query.clone()
      const totalResult = await totalCountQuery.count('* as count').first()
      const total = parseInt(totalResult.count)

      // Apply pagination and sorting
      const sessions = await query
        .limit(limit)
        .offset(offset)
        .orderBy(sortBy, sortOrder)

      return {
        sessions,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }
    } catch (error) {
      console.error('Error searching sessions:', error)
      throw error
    }
  }

  /**
   * Cleanup expired sessions with options
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupExpiredSessions(options = {}) {
    const {
      retentionDays = 30,
      batchSize = 1000,
      logActivity = true
    } = options

    try {
      const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000)
      
      let totalRemoved = 0
      let hasMore = true

      while (hasMore) {
        // Get batch of expired sessions
        const expiredSessions = await this.db(this.tableName)
          .where('expiredAt', '<', cutoffDate)
          .limit(batchSize)
          .select('id', 'userId', 'ipAddress')

        if (expiredSessions.length === 0) {
          hasMore = false
          break
        }

        // Log activity if requested
        if (logActivity) {
          for (const session of expiredSessions) {
            await this.logSessionActivity(session.id, 'session_cleanup', {
              reason: 'expired_retention',
              retentionDays,
              cleanupDate: Date.now()
            })
          }
        }

        // Remove batch
        const sessionIds = expiredSessions.map(s => s.id)
        const removed = await this.db(this.tableName)
          .whereIn('id', sessionIds)
          .del()

        totalRemoved += removed

        // Check if we have more sessions to clean
        hasMore = expiredSessions.length === batchSize
      }

      return {
        totalRemoved,
        cutoffDate,
        retentionDays
      }
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error)
      throw error
    }
  }

  /**
   * Get session analytics for dashboard
   * @param {Object} options - Analytics options
   * @returns {Promise<Object>} Session analytics data
   */
  async getSessionAnalytics(options = {}) {
    const {
      timeframe = '24h',
      groupBy = 'hour'
    } = options

    try {
      const timeframes = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      }

      const startTime = Date.now() - (timeframes[timeframe] || timeframes['24h'])

      const analytics = {
        timeframe,
        startTime,
        endTime: Date.now(),
        totals: {},
        breakdown: {},
        trends: {}
      }

      // Get total counts
      analytics.totals = await this.getSessionTotals(startTime)

      // Get breakdown by session type
      analytics.breakdown.byType = await this.getSessionBreakdown(startTime, 'sessionType')

      // Get breakdown by security level
      analytics.breakdown.bySecurity = await this.getSessionBreakdown(startTime, 'securityLevel')

      // Get time-series data
      analytics.trends.created = await this.getSessionTrends(startTime, 'created', groupBy)
      analytics.trends.expired = await this.getSessionTrends(startTime, 'expired', groupBy)

      return analytics
    } catch (error) {
      console.error('Error getting session analytics:', error)
      throw error
    }
  }

  /**
   * ===============================
   * PRIVATE HELPER METHODS
   * ===============================
   */

  /**
   * Check if IP address is suspicious
   * @private
   */
  async isSuspiciousIP(ip) {
    // Implement your IP reputation checking logic here
    // This could involve checking against threat intelligence databases
    
    // Basic checks for obviously suspicious IPs
    if (ip === '0.0.0.0' || ip === '127.0.0.1') return false
    
    // You could integrate with services like:
    // - AbuseIPDB
    // - VirusTotal
    // - Custom IP reputation database
    
    return false // Placeholder
  }

  /**
   * Check for inconsistent device fingerprint
   * @private
   */
  async hasInconsistentFingerprint(session) {
    try {
      // Get recent sessions for the same user from similar IP range
      const recentSessions = await this.db(this.tableName)
        .where('userId', session.userId)
        .where('createdAt', '>', Date.now() - (24 * 60 * 60 * 1000)) // Last 24 hours
        .whereNot('id', session.id)
        .select('fingerprint', 'ipAddress')

      // Check for fingerprint inconsistencies
      for (const recentSession of recentSessions) {
        const recentIp = recentSession.ipAddress
        const currentIp = session.ipAddress
        if (recentIp === currentIp && 
            recentSession.fingerprint !== session.fingerprint) {
          return true // Same IP, different fingerprint
        }
      }

      return false
    } catch (error) {
      console.error('Error checking fingerprint consistency:', error)
      return false
    }
  }

  /**
   * Calculate risk score from violations and warnings
   * @private
   */
  calculateRiskScore(violations, warnings) {
    let score = 0
    
    for (const violation of violations) {
      switch (violation.severity) {
        case 'critical': score += 40; break
        case 'high': score += 25; break
        case 'medium': score += 15; break
        case 'low': score += 5; break
      }
    }

    score += warnings.length * 2

    return Math.min(100, score)
  }

  /**
   * Log session activity for audit trail
   * @private
   */
  async logSessionActivity(sessionId, action, metadata = {}) {
    try {
      // This could log to a separate audit table or external logging service
      console.log(`Session Activity: ${action}`, {
        sessionId,
        timestamp: Date.now(),
        ...metadata
      })
      
      // In a real implementation, you might:
      // - Insert into an audit_logs table
      // - Send to external logging service
      // - Write to application logs with structured format
      
    } catch (error) {
      console.error('Error logging session activity:', error)
    }
  }

  /**
   * Get session totals for analytics
   * @private
   */
  async getSessionTotals(startTime) {
    const [active, created, expired] = await Promise.all([
      this.db(this.tableName)
        .where('expiredAt', '>', Date.now())
        .count('* as count')
        .first(),
      
      this.db(this.tableName)
        .where('createdAt', '>=', startTime)
        .count('* as count')
        .first(),
      
      this.db(this.tableName)
        .where('expiredAt', '>=', startTime)
        .where('expiredAt', '<=', Date.now())
        .count('* as count')
        .first()
    ])

    return {
      active: parseInt(active.count),
      created: parseInt(created.count),
      expired: parseInt(expired.count)
    }
  }

  /**
   * Get session breakdown by field
   * @private
   */
  async getSessionBreakdown(startTime, field) {
    const breakdown = await this.db(this.tableName)
      .where('createdAt', '>=', startTime)
      .select(field)
      .count('* as count')
      .groupBy(field)

    const result = {}
    for (const item of breakdown) {
      const key = item[field] || 'unknown'
      result[key] = parseInt(item.count)
    }

    return result
  }

  /**
   * Get session trends over time
   * @private
   */
  async getSessionTrends(startTime, type, groupBy) {
    const dateField = type === 'created' ? 'createdAt' : 'expiredAt'
    
    // This is a simplified version - you might want to use more sophisticated
    // time bucketing based on your database capabilities
    const trends = await this.db(this.tableName)
      .where(dateField, '>=', startTime)
      .select(this.db.raw(`
        date_trunc('${groupBy}', to_timestamp(${dateField} / 1000)) as time_bucket,
        count(*) as count
      `))
      .groupBy('time_bucket')
      .orderBy('time_bucket')

    return trends.map(trend => ({
      time: new Date(trend.time_bucket).getTime(),
      count: parseInt(trend.count)
    }))
  }

  /**
   * ===============================
   * REDIS CACHE MANAGEMENT METHODS
   * ===============================
   */

  /**
   * Override baseRemoveWhere to include Redis cache invalidation
   * @param {Object} where - Where clause for deletion
   * @param {Object} options - Additional options
   * @returns {Promise<number>} Number of deleted records
   */
  static async baseRemoveWhere(where = {}, options = {}) {
    try {
      // Get sessions before deletion to clear their cache
      const sessionsToDelete = await this.query().where(where).select('userId')
      
      // Perform the database deletion using parent method
      const result = await super.baseRemoveWhere(where, options)
      
      // Clear Redis cache for affected users
      if (sessionsToDelete.length > 0 && redisClient && sessionConfig) {
        const userIds = [...new Set(sessionsToDelete.map(s => s.userId))]
        
        for (const userId of userIds) {
          try {
            const userSessionsKey = sessionConfig.redis.userSessionsKey(userId)
            await redisClient.removeKey(userSessionsKey)
          } catch (cacheError) {
            console.warn(`Failed to clear Redis cache for user ${userId}:`, cacheError.message)
            // Continue with other users even if one fails
          }
        }
        
        console.log(`Cleared Redis cache for ${userIds.length} users after session deletion`)
      }
      
      return result
      
    } catch (error) {
      console.error('Error in SessionDAO.baseRemoveWhere:', error.message)
      throw error
    }
  }

  /**
   * Clear Redis cache for a specific user
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  static async clearUserSessionCache(userId) {
    if (!redisClient || !sessionConfig) {
      return false
    }

    try {
      const userSessionsKey = sessionConfig.redis.userSessionsKey(userId)
      await redisClient.removeKey(userSessionsKey)
      return true
    } catch (error) {
      console.warn(`Failed to clear session cache for user ${userId}:`, error.message)
      return false
    }
  }

  /**
   * Retrieve session by ID
   * @param {string|number} sessionId
   * @param {Object} options
   * @returns {Promise<Object|null>}
   */
  static async getSessionById(sessionId, options = {}) {
    return this.baseGetById(sessionId, options)
  }

  /**
   * Update session by ID
   * @param {string|number} sessionId
   * @param {Object} payload
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  static async updateSession(sessionId, payload = {}, options = {}) {
    return this.baseUpdate(sessionId, payload, options)
  }

  /**
   * Delete single session
   * @param {string|number} sessionId
   * @param {Object} options
   * @returns {Promise<number>}
   */
  static async deleteSession(sessionId, options = {}) {
    return this.baseRemove(sessionId, options)
  }

  /**
   * Delete all sessions for a user
   * @param {string} userId
   * @param {Object} options
   * @returns {Promise<number>}
   */
  static async deleteUserSessions(userId, options = {}) {
    return this.baseRemoveWhere({ userId }, options)
  }
}

module.exports = SessionDAO
