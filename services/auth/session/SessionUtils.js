/**
 * Enterprise Session Utilities
 *
 * Pure functional utilities for session data processing, analysis, and formatting.
 * Contains no database operations - only pure functions for session manipulation,
 * security analysis, and data transformation.
 *
 * Features:
 * - Session data validation and sanitization
 * - Security risk assessment utilities
 * - Session analytics and metrics calculation
 * - Device and browser detection
 * - Geographic location processing
 * - Performance optimization helpers
 *
 * @author Susanoo Team
 * @version 2.0.0
 */

class SessionUtils {
  /**
   * ===============================
   * VALIDATION & SANITIZATION
   * ===============================
   */

  /**
   * Sanitize session data for safe processing
   * @param {Object} sessionData - Raw session data
   * @param {Object} options - Sanitization options
   * @returns {Object} Sanitized session data
   */
  static sanitizeSessionData(sessionData, options = {}) {
    const { removeMetadata = false, maskIP = false, removeUA = false } = options

    const sanitized = { ...sessionData }

    // Remove or mask sensitive fields
    if (maskIP && sanitized.ip) {
      sanitized.ip = this.maskIPAddress(sanitized.ip)
    }

    if (removeUA) {
      delete sanitized.ua
    }

    if (removeMetadata) {
      delete sanitized.metadata
    } else if (sanitized.metadata) {
      sanitized.metadata = this.sanitizeMetadata(sanitized.metadata)
    }

    return sanitized
  }

  /**
   * Mask IP address for privacy protection
   * @param {string} ip - IP address to mask
   * @returns {string} Masked IP address
   */
  static maskIPAddress(ip) {
    if (!ip || typeof ip !== 'string') return 'unknown'

    // IPv4 masking (show first two octets)
    if (ip.includes('.')) {
      const parts = ip.split('.')
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.xxx.xxx`
      }
    }

    // IPv6 masking (show first two groups)
    if (ip.includes(':')) {
      const parts = ip.split(':')
      if (parts.length >= 2) {
        return `${parts[0]}:${parts[1]}::xxxx`
      }
    }

    return 'masked'
  }

  /**
   * Sanitize metadata object
   * @param {Object} metadata - Session metadata
   * @returns {Object} Sanitized metadata
   */
  static sanitizeMetadata(metadata) {
    const sanitized = { ...metadata }

    // Remove potential sensitive fields
    delete sanitized.internalId
    delete sanitized.debugInfo
    delete sanitized.serverInfo

    return sanitized
  }

  /**
   * Validate session data structure and content
   * @param {Object} sessionData - Session data to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  static validateSessionData(sessionData, options = {}) {
    const { strictMode = false, checkExpiry = true } = options
    const errors = []
    const warnings = []

    // Required fields check
    const requiredFields = ['sessionId', 'userId', 'createdAt']
    for (const field of requiredFields) {
      if (!sessionData[field]) {
        errors.push(`Missing required field: ${field}`)
      }
    }

    // Session ID validation
    if (sessionData.sessionId && !this.isValidSessionId(sessionData.sessionId)) {
      errors.push('Invalid session ID format')
    }

    // Expiry validation
    if (checkExpiry && sessionData.expiresAt) {
      const now = new Date()
      const expiryDate = new Date(sessionData.expiresAt)
      if (expiryDate <= now) {
        errors.push('Session has expired')
      }
    }

    // User agent validation
    if (sessionData.ua && typeof sessionData.ua !== 'string') {
      warnings.push('User agent should be a string')
    }

    // IP address validation
    if (sessionData.ip && !this.isValidIP(sessionData.ip)) {
      warnings.push('Invalid IP address format')
    }

    // Strict mode additional checks
    if (strictMode) {
      if (!sessionData.lastActiveAt) {
        warnings.push('Missing lastActiveAt timestamp')
      }
      if (!sessionData.deviceInfo) {
        warnings.push('Missing device information')
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: this.calculateValidationScore(errors, warnings)
    }
  }

  /**
   * Check if session ID format is valid
   * @param {string} sessionId - Session ID to validate
   * @returns {boolean} True if valid
   */
  static isValidSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return false

    // Allow various common session ID formats
    const patterns = [
      /^[a-f0-9]{32}$/i, // MD5 hex
      /^[a-f0-9]{40}$/i, // SHA1 hex
      /^[a-f0-9]{64}$/i, // SHA256 hex
      /^[a-zA-Z0-9_-]{20,}$/, // Base64-like
      /^[0-9]+$/ // Numeric ID
    ]

    return patterns.some(pattern => pattern.test(sessionId))
  }

  /**
   * Basic IP address validation
   * @param {string} ip - IP address to validate
   * @returns {boolean} True if valid
   */
  static isValidIP(ip) {
    if (!ip || typeof ip !== 'string') return false

    // IPv4 pattern
    const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    if (ipv4Pattern.test(ip)) return true

    // IPv6 pattern (simplified)
    const ipv6Pattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/
    if (ipv6Pattern.test(ip)) return true

    // IPv6 compressed
    if (ip.includes('::')) return true

    return false
  }

  /**
   * Calculate validation score
   * @param {Array} errors - Validation errors
   * @param {Array} warnings - Validation warnings
   * @returns {number} Score from 0-100
   */
  static calculateValidationScore(errors, warnings) {
    const errorPenalty = errors.length * 30
    const warningPenalty = warnings.length * 10
    return Math.max(0, 100 - errorPenalty - warningPenalty)
  }

  /**
   * ===============================
   * SECURITY ANALYSIS
   * ===============================
   */

  /**
   * Calculate comprehensive security score for session
   * @param {Object} sessionData - Session data to analyze
   * @param {Object} options - Analysis options
   * @returns {Object} Security analysis result
   */
  static calculateSecurityScore(sessionData, options = {}) {
    const {
      includeDeviceInfo = true,
      includeLocationInfo = true,
      includeBehaviorAnalysis = true
    } = options

    const factors = {}
    let totalScore = 100

    // Basic session security factors
    factors.sessionAge = this.analyzeSessionAge(sessionData)
    factors.ipConsistency = this.analyzeIPConsistency(sessionData)
    factors.userAgentConsistency = this.analyzeUserAgentConsistency(sessionData)

    // Optional detailed analysis
    if (includeDeviceInfo && sessionData.deviceInfo) {
      factors.deviceFingerprint = this.analyzeDeviceFingerprint(sessionData.deviceInfo)
    }

    if (includeLocationInfo && sessionData.locationInfo) {
      factors.locationConsistency = this.analyzeLocationConsistency(sessionData.locationInfo)
    }

    if (includeBehaviorAnalysis && sessionData.behaviorData) {
      factors.behaviorPattern = this.analyzeBehaviorPattern(sessionData.behaviorData)
    }

    // Calculate weighted score
    for (const [factor, result] of Object.entries(factors)) {
      totalScore -= result.riskScore || 0
    }

    const finalScore = Math.max(0, Math.min(100, totalScore))

    return {
      score: finalScore,
      riskLevel: this.getRiskLevel(finalScore),
      factors,
      recommendations: this.generateSecurityRecommendations(factors)
    }
  }

  /**
   * Analyze session age for security risks
   * @param {Object} sessionData - Session data
   * @returns {Object} Age analysis result
   */
  static analyzeSessionAge(sessionData) {
    if (!sessionData.createdAt) {
      return { riskScore: 20, reason: 'No creation timestamp' }
    }

    const now = new Date()
    const created = new Date(sessionData.createdAt)
    const ageHours = (now - created) / (1000 * 60 * 60)

    if (ageHours > 24 * 7) { // Over a week
      return { riskScore: 25, reason: 'Session is very old', ageHours }
    } else if (ageHours > 24) { // Over a day
      return { riskScore: 10, reason: 'Session is old', ageHours }
    } else {
      return { riskScore: 0, reason: 'Session age is acceptable', ageHours }
    }
  }

  /**
   * Analyze IP address consistency
   * @param {Object} sessionData - Session data
   * @returns {Object} IP analysis result
   */
  static analyzeIPConsistency(sessionData) {
    if (!sessionData.ip) {
      return { riskScore: 15, reason: 'No IP address recorded' }
    }

    // For now, basic checks - in production, compare with historical IPs
    const suspiciousIPs = ['127.0.0.1', '0.0.0.0']
    if (suspiciousIPs.includes(sessionData.ip)) {
      return { riskScore: 30, reason: 'Suspicious IP address', ip: sessionData.ip }
    }

    return { riskScore: 0, reason: 'IP address looks normal', ip: sessionData.ip }
  }

  /**
   * Analyze user agent consistency
   * @param {Object} sessionData - Session data
   * @returns {Object} User agent analysis result
   */
  static analyzeUserAgentConsistency(sessionData) {
    if (!sessionData.ua) {
      return { riskScore: 10, reason: 'No user agent recorded' }
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /headless/i
    ]

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(sessionData.ua)) {
        return { riskScore: 40, reason: 'Suspicious user agent pattern', userAgent: sessionData.ua }
      }
    }

    return { riskScore: 0, reason: 'User agent appears normal' }
  }

  /**
   * Analyze device fingerprint
   * @param {Object} deviceInfo - Device information
   * @returns {Object} Device analysis result
   */
  static analyzeDeviceFingerprint(deviceInfo) {
    if (!deviceInfo || typeof deviceInfo !== 'object') {
      return { riskScore: 15, reason: 'No device fingerprint available' }
    }

    let riskScore = 0
    const reasons = []

    // Check for missing key fingerprint components
    if (!deviceInfo.screen) {
      riskScore += 5
      reasons.push('Missing screen information')
    }

    if (!deviceInfo.timezone) {
      riskScore += 5
      reasons.push('Missing timezone information')
    }

    if (!deviceInfo.language) {
      riskScore += 3
      reasons.push('Missing language information')
    }

    return {
      riskScore,
      reason: reasons.length > 0 ? reasons.join(', ') : 'Device fingerprint looks complete'
    }
  }

  /**
   * Analyze location consistency
   * @param {Object} locationInfo - Location information
   * @returns {Object} Location analysis result
   */
  static analyzeLocationConsistency(locationInfo) {
    if (!locationInfo) {
      return { riskScore: 5, reason: 'No location information available' }
    }

    // Basic location validation
    if (locationInfo.country && locationInfo.city) {
      return { riskScore: 0, reason: 'Location information available' }
    }

    return { riskScore: 10, reason: 'Incomplete location information' }
  }

  /**
   * Analyze behavior patterns
   * @param {Object} behaviorData - Behavior data
   * @returns {Object} Behavior analysis result
   */
  static analyzeBehaviorPattern(behaviorData) {
    if (!behaviorData) {
      return { riskScore: 5, reason: 'No behavior data available' }
    }

    // This would contain more sophisticated behavior analysis
    return { riskScore: 0, reason: 'Behavior analysis not yet implemented' }
  }

  /**
   * Get risk level based on score
   * @param {number} score - Security score
   * @returns {string} Risk level
   */
  static getRiskLevel(score) {
    if (score >= 80) return 'LOW'
    if (score >= 60) return 'MEDIUM'
    if (score >= 40) return 'HIGH'
    return 'CRITICAL'
  }

  /**
   * Generate security recommendations
   * @param {Object} factors - Security analysis factors
   * @returns {Array} Security recommendations
   */
  static generateSecurityRecommendations(factors) {
    const recommendations = []

    for (const [factor, result] of Object.entries(factors)) {
      if (result.riskScore > 20) {
        switch (factor) {
          case 'sessionAge':
            recommendations.push('Consider requiring re-authentication for old sessions')
            break
          case 'ipConsistency':
            recommendations.push('Monitor IP address changes and require additional verification')
            break
          case 'userAgentConsistency':
            recommendations.push('Implement user agent validation and bot detection')
            break
          case 'deviceFingerprint':
            recommendations.push('Enhance device fingerprinting for better security')
            break
        }
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Session security looks good')
    }

    return recommendations
  }

  /**
   * ===============================
   * ANALYTICS & METRICS
   * ===============================
   */

  /**
   * Calculate session analytics and metrics
   * @param {Array} sessions - Array of session data
   * @param {Object} options - Analysis options
   * @returns {Object} Analytics result
   */
  static calculateSessionAnalytics(sessions, _options = {}) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return {
        totalSessions: 0,
        averageDuration: 0,
        uniqueUsers: 0,
        deviceTypes: {},
        browsers: {},
        locations: {},
        timeDistribution: {},
        securityMetrics: {}
      }
    }

    return {
      totalSessions: sessions.length,
      averageDuration: this.calculateAverageDuration(sessions),
      uniqueUsers: this.countUniqueUsers(sessions),
      deviceTypes: this.analyzeDeviceTypes(sessions),
      browsers: this.analyzeBrowsers(sessions),
      locations: this.analyzeLocations(sessions),
      timeDistribution: this.analyzeTimeDistribution(sessions),
      securityMetrics: this.calculateSecurityMetrics(sessions)
    }
  }

  /**
   * Calculate average session duration
   * @param {Array} sessions - Session data array
   * @returns {number} Average duration in minutes
   */
  static calculateAverageDuration(sessions) {
    const durations = sessions
      .filter(session => session.createdAt && session.lastActiveAt)
      .map(session => {
        const start = new Date(session.createdAt)
        const end = new Date(session.lastActiveAt)
        return (end - start) / (1000 * 60) // Convert to minutes
      })
      .filter(duration => duration > 0 && duration < 24 * 60) // Filter out invalid durations

    if (durations.length === 0) return 0

    return durations.reduce((sum, duration) => sum + duration, 0) / durations.length
  }

  /**
   * Count unique users
   * @param {Array} sessions - Session data array
   * @returns {number} Number of unique users
   */
  static countUniqueUsers(sessions) {
    const uniqueUserIds = new Set(
      sessions
        .filter(session => session.userId)
        .map(session => session.userId)
    )
    return uniqueUserIds.size
  }

  /**
   * Analyze device types distribution
   * @param {Array} sessions - Session data array
   * @returns {Object} Device type distribution
   */
  static analyzeDeviceTypes(sessions) {
    const deviceTypes = {}

    sessions.forEach(session => {
      if (session.deviceInfo && session.deviceInfo.type) {
        const type = session.deviceInfo.type
        deviceTypes[type] = (deviceTypes[type] || 0) + 1
      } else {
        deviceTypes.unknown = (deviceTypes.unknown || 0) + 1
      }
    })

    return deviceTypes
  }

  /**
   * Analyze browser distribution
   * @param {Array} sessions - Session data array
   * @returns {Object} Browser distribution
   */
  static analyzeBrowsers(sessions) {
    const browsers = {}

    sessions.forEach(session => {
      if (session.ua) {
        const browser = this.extractBrowserFromUA(session.ua)
        browsers[browser] = (browsers[browser] || 0) + 1
      } else {
        browsers.unknown = (browsers.unknown || 0) + 1
      }
    })

    return browsers
  }

  /**
   * Extract browser name from user agent
   * @param {string} userAgent - User agent string
   * @returns {string} Browser name
   */
  static extractBrowserFromUA(userAgent) {
    const browsers = [
      { name: 'Chrome', pattern: /Chrome\/[\d.]+/ },
      { name: 'Firefox', pattern: /Firefox\/[\d.]+/ },
      { name: 'Safari', pattern: /Safari\/[\d.]+/ },
      { name: 'Edge', pattern: /Edg\/[\d.]+/ },
      { name: 'Opera', pattern: /OPR\/[\d.]+/ }
    ]

    for (const browser of browsers) {
      if (browser.pattern.test(userAgent)) {
        return browser.name
      }
    }

    return 'Unknown'
  }

  /**
   * Analyze location distribution
   * @param {Array} sessions - Session data array
   * @returns {Object} Location distribution
   */
  static analyzeLocations(sessions) {
    const locations = {}

    sessions.forEach(session => {
      if (session.locationInfo && session.locationInfo.country) {
        const country = session.locationInfo.country
        locations[country] = (locations[country] || 0) + 1
      } else {
        locations.unknown = (locations.unknown || 0) + 1
      }
    })

    return locations
  }

  /**
   * Analyze time distribution of sessions
   * @param {Array} sessions - Session data array
   * @returns {Object} Time distribution
   */
  static analyzeTimeDistribution(sessions) {
    const hourly = {}
    const daily = {}

    sessions.forEach(session => {
      if (session.createdAt) {
        const date = new Date(session.createdAt)
        const hour = date.getHours()
        const day = date.toDateString()

        hourly[hour] = (hourly[hour] || 0) + 1
        daily[day] = (daily[day] || 0) + 1
      }
    })

    return { hourly, daily }
  }

  /**
   * Calculate security metrics for sessions
   * @param {Array} sessions - Session data array
   * @returns {Object} Security metrics
   */
  static calculateSecurityMetrics(sessions) {
    let totalRiskScore = 0
    let suspiciousSessions = 0
    const riskLevels = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }

    sessions.forEach(session => {
      const securityAnalysis = this.calculateSecurityScore(session)
      totalRiskScore += securityAnalysis.score
      riskLevels[securityAnalysis.riskLevel]++

      if (securityAnalysis.riskLevel === 'HIGH' || securityAnalysis.riskLevel === 'CRITICAL') {
        suspiciousSessions++
      }
    })

    return {
      averageSecurityScore: sessions.length > 0 ? totalRiskScore / sessions.length : 0,
      suspiciousSessionCount: suspiciousSessions,
      suspiciousSessionPercentage: sessions.length > 0 ? (suspiciousSessions / sessions.length) * 100 : 0,
      riskLevelDistribution: riskLevels
    }
  }

  /**
   * ===============================
   * DEVICE & BROWSER DETECTION
   * ===============================
   */

  /**
   * Parse device information from user agent and other data
   * @param {string} userAgent - User agent string
   * @param {Object} additionalData - Additional device data
   * @returns {Object} Parsed device information
   */
  static parseDeviceInfo(userAgent, additionalData = {}) {
    const deviceInfo = {
      browser: this.extractBrowserFromUA(userAgent),
      os: this.extractOSFromUA(userAgent),
      device: this.extractDeviceFromUA(userAgent),
      isMobile: this.isMobileUA(userAgent),
      isBot: this.isBotUA(userAgent),
      ...additionalData
    }

    return deviceInfo
  }

  /**
   * Extract operating system from user agent
   * @param {string} userAgent - User agent string
   * @returns {string} Operating system name
   */
  static extractOSFromUA(userAgent) {
    const osPatterns = [
      { name: 'Windows', pattern: /Windows NT [\d.]+/ },
      { name: 'macOS', pattern: /Mac OS X [\d._]+/ },
      { name: 'iOS', pattern: /iPhone OS [\d._]+|iOS [\d._]+/ },
      { name: 'Android', pattern: /Android [\d.]+/ },
      { name: 'Linux', pattern: /Linux/ }
    ]

    for (const os of osPatterns) {
      if (os.pattern.test(userAgent)) {
        return os.name
      }
    }

    return 'Unknown'
  }

  /**
   * Extract device type from user agent
   * @param {string} userAgent - User agent string
   * @returns {string} Device type
   */
  static extractDeviceFromUA(userAgent) {
    if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
      if (/iPad/.test(userAgent)) return 'Tablet'
      return 'Mobile'
    }

    return 'Desktop'
  }

  /**
   * Check if user agent indicates mobile device
   * @param {string} userAgent - User agent string
   * @returns {boolean} True if mobile
   */
  static isMobileUA(userAgent) {
    return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/.test(userAgent)
  }

  /**
   * Check if user agent indicates bot/crawler
   * @param {string} userAgent - User agent string
   * @returns {boolean} True if bot
   */
  static isBotUA(userAgent) {
    return /bot|crawler|spider|crawling|headless|phantom|selenium|automation/i.test(userAgent)
  }

  /**
   * ===============================
   * PERFORMANCE OPTIMIZATION
   * ===============================
   */

  /**
   * Format session data for different contexts
   * @param {Object} sessionData - Session data to format
   * @param {string} format - Format type (minimal, standard, detailed)
   * @returns {Object} Formatted session data
   */
  static formatSessionData(sessionData, format = 'standard') {
    switch (format) {
      case 'minimal':
        return this.formatMinimalSession(sessionData)
      case 'detailed':
        return this.formatDetailedSession(sessionData)
      case 'standard':
      default:
        return this.formatStandardSession(sessionData)
    }
  }

  /**
   * Format session for minimal output
   * @param {Object} sessionData - Session data
   * @returns {Object} Minimal session data
   */
  static formatMinimalSession(sessionData) {
    return {
      sessionId: sessionData.sessionId,
      userId: sessionData.userId,
      isActive: sessionData.isActive,
      lastActiveAt: sessionData.lastActiveAt
    }
  }

  /**
   * Format session for standard output
   * @param {Object} sessionData - Session data
   * @returns {Object} Standard session data
   */
  static formatStandardSession(sessionData) {
    return {
      sessionId: sessionData.sessionId,
      userId: sessionData.userId,
      isActive: sessionData.isActive,
      createdAt: sessionData.createdAt,
      lastActiveAt: sessionData.lastActiveAt,
      expiresAt: sessionData.expiresAt,
      ip: sessionData.ip,
      deviceType: sessionData.deviceInfo?.type || 'unknown'
    }
  }

  /**
   * Format session for detailed output
   * @param {Object} sessionData - Session data
   * @returns {Object} Detailed session data
   */
  static formatDetailedSession(sessionData) {
    return {
      ...sessionData,
      analytics: {
        duration: this.calculateSessionDuration(sessionData),
        securityScore: this.calculateSecurityScore(sessionData).score,
        deviceInfo: this.parseDeviceInfo(sessionData.ua || ''),
        validationScore: this.validateSessionData(sessionData).score
      }
    }
  }

  /**
   * Calculate individual session duration
   * @param {Object} sessionData - Session data
   * @returns {number} Duration in minutes
   */
  static calculateSessionDuration(sessionData) {
    if (!sessionData.createdAt || !sessionData.lastActiveAt) return 0

    const start = new Date(sessionData.createdAt)
    const end = new Date(sessionData.lastActiveAt)
    return Math.max(0, (end - start) / (1000 * 60))
  }

  /**
   * ===============================
   * UTILITY HELPERS
   * ===============================
   */

  /**
   * Generate session fingerprint for uniqueness checking
   * @param {Object} sessionData - Session data
   * @returns {string} Session fingerprint
   */
  static generateSessionFingerprint(sessionData) {
    const fingerprintData = [
      sessionData.userId || '',
      sessionData.ip || '',
      sessionData.ua || '',
      sessionData.deviceInfo?.screen || '',
      sessionData.deviceInfo?.timezone || ''
    ].join('|')

    // Simple hash function (in production, use crypto)
    let hash = 0
    for (let i = 0; i < fingerprintData.length; i++) {
      const char = fingerprintData.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Check if two sessions belong to the same user/device
   * @param {Object} session1 - First session
   * @param {Object} session2 - Second session
   * @returns {Object} Similarity analysis
   */
  static compareSessionSimilarity(session1, session2) {
    const similarities = {}
    let totalScore = 0

    // User ID comparison
    if (session1.userId && session2.userId) {
      similarities.userId = session1.userId === session2.userId
      totalScore += similarities.userId ? 30 : 0
    }

    // IP address comparison
    if (session1.ip && session2.ip) {
      similarities.ip = session1.ip === session2.ip
      totalScore += similarities.ip ? 25 : 0
    }

    // User agent comparison
    if (session1.ua && session2.ua) {
      similarities.userAgent = session1.ua === session2.ua
      totalScore += similarities.userAgent ? 20 : 0
    }

    // Device fingerprint comparison
    const fp1 = this.generateSessionFingerprint(session1)
    const fp2 = this.generateSessionFingerprint(session2)
    similarities.fingerprint = fp1 === fp2
    totalScore += similarities.fingerprint ? 25 : 0

    return {
      similarities,
      similarityScore: totalScore,
      isSameUser: totalScore >= 50
    }
  }

  /**
   * Get session age in various units
   * @param {Object} sessionData - Session data
   * @returns {Object} Age information
   */
  static getSessionAge(sessionData) {
    if (!sessionData.createdAt) {
      return { error: 'No creation date available' }
    }

    const now = new Date()
    const created = new Date(sessionData.createdAt)
    const diffMs = now - created

    return {
      milliseconds: diffMs,
      seconds: Math.floor(diffMs / 1000),
      minutes: Math.floor(diffMs / (1000 * 60)),
      hours: Math.floor(diffMs / (1000 * 60 * 60)),
      days: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
      humanReadable: this.formatDuration(diffMs)
    }
  }

  /**
   * Format duration in human readable format
   * @param {number} durationMs - Duration in milliseconds
   * @returns {string} Human readable duration
   */
  static formatDuration(durationMs) {
    const seconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`
    return `${seconds} second${seconds !== 1 ? 's' : ''}`
  }
}

module.exports = SessionUtils