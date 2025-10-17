/**
 * Enterprise Session Model
 *
 * Comprehensive session data model with enhanced validation, security features,
 * business logic methods, and enterprise-grade functionality for session management.
 *
 * Features:
 * - Advanced security validation and threat detection
 * - Session lifecycle management and analysis
 * - Device fingerprinting and risk assessment
 * - Performance optimization and metadata handling
 * - GDPR compliance and audit trail support
 * - Comprehensive validation with security patterns
 *
 * @author Susanoo Team
 * @version 2.0.0
 */

const isUUID = require('validator/lib/isUUID')
const isIP = require('validator/lib/isIP')
const { BaseModel, Rule } = require('backend-core')
const UserModel = require('./UserModel')

const schema = {
  userId: UserModel.schema.id,
  refreshToken: new Rule({
    validator: v => {
      if (!isUUID(v)) return false
      // Enhanced security: Check for weak UUID patterns
      if (v === '00000000-0000-0000-0000-000000000000') return false
      return true
    },
    description: 'UUID; valid and secure refresh token identifier;'
  }),
  ua: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      if (typeof v !== 'string') return false
      if (v.length > 500) return false // Increased limit for modern user agents
      // Security: Block suspicious user agent patterns
      const suspiciousPatterns = ['<script', 'javascript:', 'data:', 'vbscript:']
      return !suspiciousPatterns.some(pattern => v.toLowerCase().includes(pattern))
    },
    description: 'string; valid user agent; max 500 chars; security validated;'
  }),
  fingerprint: new Rule({
    validator: v => {
      if (typeof v !== 'string') return false
      if (v.length < 8 || v.length > 200) return false
      // Enhanced fingerprint validation
      if (/^(.)\1{7,}$/.test(v)) return false // Repeated characters
      if (v.includes(' ') || v.includes('\t')) return false // No whitespace
      return /^[a-zA-Z0-9\-_.]+$/.test(v) // Only safe characters
    },
    description: 'string; device fingerprint; 8-200 chars; alphanumeric with safe symbols;'
  }),
  ip: new Rule({
    validator: v => {
      if (!isIP(v)) return false
      // Security checks for IP address
      if (v === '0.0.0.0' || v === '::') return false // Invalid IPs
      return true
    },
    description: 'string; valid IP address; IPv4 or IPv6;'
  }),
  expiredAt: new Rule({
    validator: v => {
      if (!Number.isInteger(v)) return false
      // Enhanced expiration validation
      const now = Date.now()
      const maxExpiration = now + (365 * 24 * 60 * 60 * 1000) // 1 year max
      const minExpiration = now + (5 * 60 * 1000) // 5 minutes min
      return v >= minExpiration && v <= maxExpiration
    },
    description: 'number; future timestamp; between 5 minutes and 1 year from now;'
  }),
  securityLevel: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      return typeof v === 'string' && ['low', 'medium', 'high', 'critical'].includes(v.toLowerCase())
    },
    description: 'string; security risk level: low, medium, high, critical;'
  }),
  sessionType: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      const validTypes = ['standard', 'persistent', 'mobile', 'api', 'admin', 'suspicious', 'guest']
      return typeof v === 'string' && validTypes.includes(v.toLowerCase())
    },
    description: 'string; session type: standard, persistent, mobile, api, admin, suspicious, guest;'
  }),
  metadata: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      if (typeof v === 'string') {
        try {
          v = JSON.parse(v)
        } catch {
          return false
        }
      }
      if (typeof v !== 'object' || Array.isArray(v)) return false
      
      // Size limit for metadata
      if (JSON.stringify(v).length > 10000) return false
      
      // Security: Check for sensitive data
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'hash', 'credit']
      const jsonStr = JSON.stringify(v).toLowerCase()
      if (sensitiveKeys.some(key => jsonStr.includes(key))) return false
      
      return true
    },
    description: 'object; session metadata; JSON object; size limited; security validated;'
  })
}

class SessionModel extends BaseModel {
  static get schema () {
    return schema
  }

  /**
   * ===============================
   * ENTERPRISE BUSINESS LOGIC METHODS
   * ===============================
   */

  /**
   * Assess session security risk level
   * @param {Object} sessionData - Session data object
   * @returns {Object} Security assessment with risk level and factors
   */
  static assessSessionSecurity(sessionData) {
    let riskScore = 0
    const riskFactors = []

    // IP-based risk assessment
    if (this.isPrivateIP(sessionData.ip)) {
      riskScore += 5
      riskFactors.push('Private IP address')
    } else if (this.isLoopbackIP(sessionData.ip)) {
      riskScore += 10
      riskFactors.push('Loopback IP address')
    }

    // User agent analysis
    if (!sessionData.ua || sessionData.ua.length < 20) {
      riskScore += 15
      riskFactors.push('Missing or suspicious user agent')
    } else if (this.isSuspiciousUserAgent(sessionData.ua)) {
      riskScore += 25
      riskFactors.push('Suspicious user agent pattern')
    }

    // Fingerprint analysis
    if (this.isWeakFingerprint(sessionData.fingerprint)) {
      riskScore += 20
      riskFactors.push('Weak device fingerprint')
    }

    // Session timing analysis
    if (sessionData.expiredAt && sessionData.createdAt) {
      const sessionDuration = sessionData.expiredAt - sessionData.createdAt
      const oneYear = 365 * 24 * 60 * 60 * 1000
      if (sessionDuration > oneYear) {
        riskScore += 15
        riskFactors.push('Unusually long session duration')
      }
    }

    // Metadata analysis
    if (sessionData.metadata) {
      const metadata = typeof sessionData.metadata === 'string' 
        ? JSON.parse(sessionData.metadata) 
        : sessionData.metadata

      if (metadata.device?.isJailbroken || metadata.device?.isRooted) {
        riskScore += 30
        riskFactors.push('Jailbroken or rooted device')
      }

      if (metadata.location?.isVPN || metadata.location?.isTor) {
        riskScore += 20
        riskFactors.push('VPN or Tor usage detected')
      }
    }

    // Determine risk level
    let riskLevel = 'low'
    if (riskScore >= 80) riskLevel = 'critical'
    else if (riskScore >= 60) riskLevel = 'high'
    else if (riskScore >= 30) riskLevel = 'medium'

    return {
      riskScore,
      riskLevel,
      riskFactors,
      recommendations: this.getSecurityRecommendations(riskLevel, riskFactors)
    }
  }

  /**
   * Analyze session activity patterns
   * @param {Object} sessionData - Session data
   * @returns {Object} Activity analysis
   */
  static analyzeSessionActivity(sessionData) {
    const now = Date.now()
    const createdAt = sessionData.createdAt || now
    const expiredAt = sessionData.expiredAt || now
    
    const sessionAge = now - createdAt
    const sessionDuration = expiredAt - createdAt
    const remainingTime = expiredAt - now

    return {
      age: {
        milliseconds: sessionAge,
        hours: Math.floor(sessionAge / (1000 * 60 * 60)),
        days: Math.floor(sessionAge / (1000 * 60 * 60 * 24))
      },
      duration: {
        milliseconds: sessionDuration,
        hours: Math.floor(sessionDuration / (1000 * 60 * 60)),
        days: Math.floor(sessionDuration / (1000 * 60 * 60 * 24))
      },
      remaining: {
        milliseconds: Math.max(0, remainingTime),
        hours: Math.max(0, Math.floor(remainingTime / (1000 * 60 * 60))),
        isExpired: remainingTime <= 0,
        expiresWithin24h: remainingTime <= (24 * 60 * 60 * 1000) && remainingTime > 0
      },
      status: this.getSessionStatus(sessionData),
      type: this.determineSessionType(sessionData)
    }
  }

  /**
   * Format session data for API response
   * @param {Object} sessionData - Raw session data
   * @param {Object} options - Formatting options
   * @returns {Object} Formatted session data
   */
  static formatForAPI(sessionData, options = {}) {
    const { includeMetadata = false, includeSecurity = false, format = 'standard' } = options

    const baseData = {
      id: sessionData.id,
      fingerprint: sessionData.fingerprint,
      ip: sessionData.ip,
      createdAt: sessionData.createdAt,
      expiredAt: sessionData.expiredAt,
      isActive: sessionData.expiredAt > Date.now()
    }

    if (format === 'minimal') {
      return {
        id: sessionData.id,
        isActive: baseData.isActive,
        expiresAt: sessionData.expiredAt
      }
    }

    // Add device information from user agent
    if (sessionData.ua) {
      baseData.device = this.parseUserAgent(sessionData.ua)
    }

    // Add session type and security level
    if (sessionData.sessionType) {
      baseData.sessionType = sessionData.sessionType
    }

    if (includeSecurity && sessionData.securityLevel) {
      baseData.securityLevel = sessionData.securityLevel
    }

    // Add sanitized metadata
    if (includeMetadata && sessionData.metadata) {
      baseData.metadata = this.sanitizeMetadata(sessionData.metadata)
    }

    return baseData
  }

  /**
   * Validate session against security policies
   * @param {Object} sessionData - Session data
   * @returns {Object} Validation result
   */
  static validateSecurityPolicies(sessionData) {
    const violations = []
    const warnings = []

    // Check session duration policy
    const sessionDuration = sessionData.expiredAt - (sessionData.createdAt || Date.now())
    const maxDuration = 30 * 24 * 60 * 60 * 1000 // 30 days
    
    if (sessionDuration > maxDuration) {
      violations.push({
        policy: 'MAX_SESSION_DURATION',
        message: 'Session duration exceeds maximum allowed',
        current: sessionDuration,
        limit: maxDuration
      })
    }

    // Check IP restrictions
    if (this.isRestrictedIP(sessionData.ip)) {
      violations.push({
        policy: 'IP_RESTRICTION',
        message: 'IP address is in restricted range',
        ip: sessionData.ip
      })
    }

    // Check user agent requirements
    if (!sessionData.ua || sessionData.ua.length < 10) {
      warnings.push({
        policy: 'USER_AGENT_REQUIRED',
        message: 'User agent information is missing or insufficient'
      })
    }

    return {
      isValid: violations.length === 0,
      violations,
      warnings,
      score: Math.max(0, 100 - (violations.length * 25) - (warnings.length * 5))
    }
  }

  /**
   * ===============================
   * PRIVATE HELPER METHODS
   * ===============================
   */

  /**
   * Check if IP is private/internal
   * @private
   */
  static isPrivateIP(ip) {
    if (ip.includes(':')) {
      // IPv6 private ranges
      return ip.startsWith('fc') || ip.startsWith('fd') || ip === '::1'
    }
    
    // IPv4 private ranges
    return ip.startsWith('10.') || 
           ip.startsWith('192.168.') || 
           (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31)
  }

  /**
   * Check if IP is loopback
   * @private
   */
  static isLoopbackIP(ip) {
    return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.')
  }

  /**
   * Check if IP is restricted
   * @private
   */
  static isRestrictedIP(ip) {
    // Add your restricted IP ranges here
    const restrictedRanges = ['0.0.0.0', '255.255.255.255']
    return restrictedRanges.includes(ip)
  }

  /**
   * Check if user agent appears suspicious
   * @private
   */
  static isSuspiciousUserAgent(ua) {
    const suspiciousPatterns = [
      /bot/i, /crawler/i, /spider/i, /scraper/i,
      /curl/i, /wget/i, /python/i, /ruby/i,
      /<script/i, /javascript:/i, /vbscript:/i
    ]
    return suspiciousPatterns.some(pattern => pattern.test(ua))
  }

  /**
   * Check if fingerprint is weak
   * @private
   */
  static isWeakFingerprint(fingerprint) {
    if (!fingerprint || fingerprint.length < 16) return true
    if (/^(.)\1{7,}$/.test(fingerprint)) return true // Repeated characters
    if (fingerprint === 'undefined' || fingerprint === 'null') return true
    return false
  }

  /**
   * Get security recommendations
   * @private
   */
  static getSecurityRecommendations(riskLevel, factors) {
    const recommendations = []

    if (riskLevel === 'critical') {
      recommendations.push('Terminate session immediately')
      recommendations.push('Require re-authentication')
      recommendations.push('Enable additional security monitoring')
    } else if (riskLevel === 'high') {
      recommendations.push('Require additional verification')
      recommendations.push('Limit session permissions')
      recommendations.push('Monitor session activity closely')
    } else if (riskLevel === 'medium') {
      recommendations.push('Enable enhanced logging')
      recommendations.push('Consider additional verification')
    }

    if (factors.includes('VPN or Tor usage detected')) {
      recommendations.push('Verify user identity through alternative means')
    }

    return recommendations
  }

  /**
   * Get session status
   * @private
   */
  static getSessionStatus(sessionData) {
    const now = Date.now()
    if (sessionData.expiredAt <= now) return 'expired'
    if (sessionData.expiredAt - now <= 60000) return 'expiring-soon'
    return 'active'
  }

  /**
   * Determine session type from data
   * @private
   */
  static determineSessionType(sessionData) {
    if (sessionData.sessionType) return sessionData.sessionType

    // Determine from metadata or other factors
    if (sessionData.metadata) {
      const metadata = typeof sessionData.metadata === 'string' 
        ? JSON.parse(sessionData.metadata) 
        : sessionData.metadata

      if (metadata.device?.type === 'mobile') return 'mobile'
      if (metadata.rememberMe) return 'persistent'
    }

    return 'standard'
  }

  /**
   * Parse user agent string
   * @private
   */
  static parseUserAgent(ua) {
    return {
      raw: ua,
      browser: this.extractBrowser(ua),
      os: this.extractOS(ua),
      device: this.extractDevice(ua),
      isMobile: /Mobile|Android|iPhone|iPad/.test(ua)
    }
  }

  /**
   * Extract browser from user agent
   * @private
   */
  static extractBrowser(ua) {
    if (/Firefox/.test(ua)) return 'Firefox'
    if (/Chrome/.test(ua)) return 'Chrome'
    if (/Safari/.test(ua)) return 'Safari'
    if (/Edge/.test(ua)) return 'Edge'
    return 'Unknown'
  }

  /**
   * Extract OS from user agent
   * @private
   */
  static extractOS(ua) {
    if (/Windows/.test(ua)) return 'Windows'
    if (/Mac OS/.test(ua)) return 'macOS'
    if (/Linux/.test(ua)) return 'Linux'
    if (/Android/.test(ua)) return 'Android'
    if (/iOS/.test(ua)) return 'iOS'
    return 'Unknown'
  }

  /**
   * Extract device type from user agent
   * @private
   */
  static extractDevice(ua) {
    if (/Mobile/.test(ua)) return 'mobile'
    if (/Tablet|iPad/.test(ua)) return 'tablet'
    return 'desktop'
  }

  /**
   * Sanitize metadata for API output
   * @private
   */
  static sanitizeMetadata(metadata) {
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata)
      } catch {
        return null
      }
    }

    const sanitized = { ...metadata }
    
    // Remove sensitive fields
    delete sanitized.deviceId
    delete sanitized.sessionSecret
    delete sanitized.internalFlags
    
    return sanitized
  }
}

module.exports = SessionModel
