/**
 * Enterprise Session Management Service
 * 
 * Provides comprehensive session management with enterprise-grade features including
 * security monitoring, performance tracking, anomaly detection, and robust error handling.
 * 
 * @author Susanoo Team
 * @version 2.0.0
 */

const { assert, ErrorWrapper, errorCodes } = require('backend-core')
const SessionDAO = require('../../../database/dao/SessionDAO')
const SessionEntity = require('../entities/SessionEntity')
const UserModel = require('../../../models/UserModel')
const SessionCacheService = require('./SessionCacheService')
const sessionConfig = require('../../../config/session')
const logger = require('../../../util/logger')

/**
 * Performance and security metrics collector
 */
class SessionMetrics {
  static metrics = {
    totalSessions: 0,
    sessionsByUser: new Map(),
    sessionsByIP: new Map(),
    slowOperations: 0,
    securityEvents: 0,
    redisErrors: 0,
    lastCleanup: null
  }

  static recordSessionCreation(userId, ipAddress, duration = 0) {
    this.metrics.totalSessions++
    this.metrics.sessionsByUser.set(userId, (this.metrics.sessionsByUser.get(userId) || 0) + 1)
    const normalizedIp = ipAddress || 'unknown'
    this.metrics.sessionsByIP.set(normalizedIp, (this.metrics.sessionsByIP.get(normalizedIp) || 0) + 1)
    
    if (duration > sessionConfig.performance.slowOperationThreshold) {
      this.metrics.slowOperations++
      logger.warn('Slow session operation detected', { 
        userId, 
        ipAddress: normalizedIp, 
        duration,
        threshold: sessionConfig.performance.slowOperationThreshold 
      })
    }
  }

  static recordSecurityEvent(event, details) {
    this.metrics.securityEvents++
    if (sessionConfig.security.auditLogging.enabled) {
      logger.warn('Session security event', { event, ...details })
    }
  }

  static recordRedisError(error, operation) {
    this.metrics.redisErrors++
    logger.error('Redis operation failed', { error: error.message, operation })
  }

  static getMetrics() {
    return {
      ...this.metrics,
      sessionsByUser: Object.fromEntries(this.metrics.sessionsByUser),
      sessionsByIP: Object.fromEntries(this.metrics.sessionsByIP)
    }
  }
}

/**
 * Security analyzer for detecting suspicious session patterns
 */
class SessionSecurityAnalyzer {
  /**
   * Analyzes session creation for security anomalies
   * @param {Object} sessionData - Session creation data
   * @param {string} sessionData.userId - User ID
   * @param {string} sessionData.ipAddress - IP address
   * @param {string} sessionData.fingerprint - Device fingerprint
   * @param {string} sessionData.ua - User agent
   * @returns {Object} Analysis result with warnings and risk level
   */
  static async analyzeSessionSecurity(sessionData) {
    const analysis = {
      riskLevel: 'low',
      warnings: [],
      metadata: {},
      allowSession: true
    }

    if (!sessionConfig.security.anomalyDetection.enabled) {
      return analysis
    }

    try {
      // Check concurrent IPs for this user
      const userSessions = await this._getUserActiveSessions(sessionData.userId)
      const uniqueIPs = new Set(userSessions.map(s => s.ipAddress || s.ip))
      
      if (uniqueIPs.size >= sessionConfig.security.anomalyDetection.maxConcurrentIPs) {
        analysis.riskLevel = 'high'
        analysis.warnings.push('Multiple concurrent IP addresses detected')
        SessionMetrics.recordSecurityEvent('concurrent_ips', {
          userId: sessionData.userId,
          currentIPs: Array.from(uniqueIPs),
          newIP: sessionData.ipAddress
        })
      }

      // Check session frequency for IP
      const normalizedIp = sessionData.ipAddress || 'unknown'
      const ipSessionCount = SessionMetrics.metrics.sessionsByIP.get(normalizedIp) || 0
      if (ipSessionCount >= sessionConfig.limits.maxSessionsPerIP) {
        analysis.riskLevel = 'high'
        analysis.warnings.push('Excessive sessions from single IP')
        analysis.allowSession = false
        SessionMetrics.recordSecurityEvent('ip_session_limit', {
          ipAddress: normalizedIp,
          sessionCount: ipSessionCount
        })
      }

      // Analyze user agent for suspicious patterns
      if (sessionData.ua) {
        if (this._isSuspiciousUserAgent(sessionData.ua)) {
          analysis.riskLevel = 'medium'
          analysis.warnings.push('Suspicious user agent detected')
          SessionMetrics.recordSecurityEvent('suspicious_ua', {
            userId: sessionData.userId,
            userAgent: sessionData.ua
          })
        }
      }

      // Device fingerprint analysis
      const deviceSessions = userSessions.filter(s => s.fingerprint === sessionData.fingerprint)
      analysis.metadata.isKnownDevice = deviceSessions.length > 0
      analysis.metadata.deviceSessionCount = deviceSessions.length

    } catch (error) {
      logger.error('Security analysis failed', { error: error.message, userId: sessionData.userId })
      // Allow session creation on analysis failure (fail open)
    }

    return analysis
  }

  static async _getUserActiveSessions(userId) {
    try {
      return await SessionDAO.getActiveSessions(userId) || []
    } catch (error) {
      logger.error('Failed to get active sessions for security analysis', { error: error.message, userId })
      return []
    }
  }

  static _isSuspiciousUserAgent(ua) {
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /automated/i,
      /headless/i
    ]
    return suspiciousPatterns.some(pattern => pattern.test(ua))
  }
}

/**
 * Main session management function
 * Creates a new session with comprehensive validation, security analysis, and monitoring
 * 
 * @param {SessionEntity} session - Session entity to be created
 * @returns {Promise<Object>} Result object with session data and metadata
 * @throws {ErrorWrapper} When validation fails or security constraints are violated
 */
async function addSession(session) {
  const startTime = Date.now()
  
  try {
    // Input validation
    assert.instanceOf(session, SessionEntity, 'Invalid session entity provided')
    
    // Security analysis
    const securityAnalysis = await SessionSecurityAnalyzer.analyzeSessionSecurity({
      userId: session.userId,
      ipAddress: session.ipAddress,
      fingerprint: session.fingerprint,
      ua: session.ua
    })

    if (!securityAnalysis.allowSession) {
      throw new ErrorWrapper({
        ...errorCodes.FORBIDDEN,
        message: 'Session creation blocked due to security constraints',
        details: { warnings: securityAnalysis.warnings }
      })
    }

    // Check session limits and manage existing sessions
    const sessionResult = await _manageUserSessions(session)
    
    // Record metrics
    const duration = Date.now() - startTime
    SessionMetrics.recordSessionCreation(session.userId, session.ipAddress, duration)

    // Audit logging
    if (sessionConfig.security.auditLogging.enabled) {
      logger.info('Session created successfully', {
        userId: session.userId,
        ipAddress: session.ipAddress,
        fingerprint: session.fingerprint,
        securityRisk: securityAnalysis.riskLevel,
        warnings: securityAnalysis.warnings,
        duration,
        sessionId: sessionResult.id
      })
    }

    return {
      success: true,
      session: sessionResult,
      security: {
        riskLevel: securityAnalysis.riskLevel,
        warnings: securityAnalysis.warnings,
        metadata: securityAnalysis.metadata
      },
      performance: {
        duration,
        cached: sessionResult.cached || false
      }
    }

  } catch (error) {
    const duration = Date.now() - startTime
    
    logger.error('Session creation failed', {
      error: error.message,
      userId: session?.userId,
      ipAddress: session?.ipAddress,
      duration,
      stack: error.stack
    })

    if (error instanceof ErrorWrapper) {
      throw error
    }

    throw new ErrorWrapper({
      ...errorCodes.INTERNAL_SERVER_ERROR,
      message: 'Failed to create session',
      originalError: error.message
    })
  }
}

/**
 * Manages user sessions including limit enforcement and cleanup
 * @private
 */
async function _manageUserSessions(session) {
  const isValidCount = await _isValidSessionsCount(session.userId)
  
  if (isValidCount) {
    return await _createSession(session)
  } else {
    // Log session limit reached
    logger.warn('User session limit reached, cleaning up old sessions', {
      userId: session.userId,
      maxSessions: sessionConfig.limits.maxSessionsPerUser
    })
    
    await _wipeAllUserSessions(session.userId)
    return await _createSession(session)
  }
}

/**
 * Validates session count against configured limits
 * @private
 */
async function _isValidSessionsCount(userId) {
  try {
    assert.validate(userId, UserModel.schema.id, { required: true })
    
    const existingSessionsCount = await SessionDAO.baseGetCount({ userId })
    const maxSessions = sessionConfig.limits.maxSessionsPerUser
    
    return existingSessionsCount < maxSessions
  } catch (error) {
    logger.error('Failed to validate session count', { error: error.message, userId })
    // Fail safe - allow session creation
    return true
  }
}

/**
 * Creates a new session with database and cache updates
 * @private
 */
async function _createSession(session) {
  try {
    // Create session in database with graceful handling of missing fields
    let sessionData
    try {
      sessionData = await SessionDAO.baseCreate(session.toDatabase())
    } catch (error) {
      // Handle missing columns during migration period
      if (error.message.includes('does not exist')) {
        logger.warn('Database schema migration may be pending', { error: error.message })
        
        // Create with basic fields only
        const basicSessionData = {
          refreshToken: session.refreshToken,
          userId: session.userId,
          fingerprint: session.fingerprint,
          ipAddress: session.ipAddress,
          ua: session.ua,
          expiredAt: session.expiredAt
        }
        sessionData = await SessionDAO.baseCreate(basicSessionData)
        
        // Add missing fields manually for response
        sessionData.securityLevel = session.securityLevel
        sessionData.sessionType = session.sessionType
        sessionData.metadata = session.metadata
      } else {
        throw error
      }
    }
    
    // Update Redis cache
    const cacheResult = await SessionCacheService.addSession(
      sessionData.userId, 
      sessionData,
      { operation: 'create_session' }
    )
    
    if (cacheResult.success) {
      sessionData.cached = true
      logger.debug('Session cached successfully', { sessionId: sessionData.id })
    } else if (!sessionConfig.errorHandling.fallbackBehavior.allowSessionCreation && !cacheResult.fallback) {
      // If Redis is required and failed, rollback database creation
      await SessionDAO.baseRemove(sessionData.id)
      throw new ErrorWrapper({
        ...errorCodes.SERVICE_UNAVAILABLE,
        message: 'Session caching failed and fallback is disabled'
      })
    }

    return sessionData
  } catch (error) {
    logger.error('Session creation failed', { error: error.message })
    throw error
  }
}

/**
 * Removes all sessions for a user
 * @private
 */
async function _wipeAllUserSessions(userId) {
  try {
    assert.validate(userId, UserModel.schema.id, { required: true })
    
    // Remove from database
    const removedCount = await SessionDAO.baseRemoveWhere({ userId })
    
    // Clear Redis cache
    await SessionCacheService.clearUserSessions(userId, { operation: 'wipe_all_sessions' })
    
    logger.info('User sessions cleared', { userId, removedCount })
    return removedCount
  } catch (error) {
    logger.error('Failed to wipe user sessions', { error: error.message, userId })
    throw error
  }
}

/**
 * Cleanup expired sessions (can be called by cron jobs)
 */
async function cleanupExpiredSessions() {
  if (!sessionConfig.cleanup.autoCleanup.enabled) {
    return { skipped: true, reason: 'Auto cleanup disabled' }
  }

  const startTime = Date.now()
  
  try {
    const expiredSessions = await SessionDAO.query()
      .where('expiredAt', '<', Date.now())
      .limit(sessionConfig.cleanup.autoCleanup.batchSize)

    if (expiredSessions.length === 0) {
      return { cleaned: 0, duration: Date.now() - startTime }
    }

    // Remove expired sessions
    const sessionIds = expiredSessions.map(s => s.id)
    await SessionDAO.query().whereIn('id', sessionIds).delete()

    // Update Redis cache for affected users
    const userIds = [...new Set(expiredSessions.map(s => s.userId))]
    for (const userId of userIds) {
      const activeSessions = await SessionDAO.getActiveSessions(userId)
      await SessionCacheService.clearUserSessions(userId, { operation: 'cleanup_expired' })
      
      if (activeSessions.length > 0) {
        for (const session of activeSessions) {
          await SessionCacheService.addSession(userId, session, { operation: 'restore_active' })
        }
      }
    }

    SessionMetrics.metrics.lastCleanup = new Date()
    
    logger.info('Expired sessions cleaned up', {
      cleaned: expiredSessions.length,
      affectedUsers: userIds.length,
      duration: Date.now() - startTime
    })

    return {
      cleaned: expiredSessions.length,
      affectedUsers: userIds.length,
      duration: Date.now() - startTime
    }
  } catch (error) {
    logger.error('Session cleanup failed', { error: error.message })
    throw error
  }
}

/**
 * Get session metrics for monitoring and analytics
 */
function getSessionMetrics() {
  return SessionMetrics.getMetrics()
}

// Export main function and utilities
module.exports = addSession
module.exports.cleanupExpiredSessions = cleanupExpiredSessions
module.exports.getSessionMetrics = getSessionMetrics
module.exports.SessionMetrics = SessionMetrics
module.exports.SessionSecurityAnalyzer = SessionSecurityAnalyzer
module.exports.SessionCacheService = SessionCacheService
