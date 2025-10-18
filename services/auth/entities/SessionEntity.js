/**
 * Enhanced Session Entity
 * 
 * Enterprise-grade session entity with comprehensive validation,
 * metadata collection, and security features.
 * 
 * @author Susanoo Team
 * @version 2.0.0
 */

const { assert, ErrorWrapper, errorCodes } = require('backend-core')
const ms = require('ms')
const { v4: uuidV4 } = require('uuid')
const config = require('../../../config')
const sessionConfig = require('../../../config/session')
const UserModel = require('../../../models/UserModel')
const SessionModel = require('../../../models/SessionModel')

const expiredAtPeriodSec = ms(config.token.refresh.expiresIn)

/**
 * Enhanced Session Entity with enterprise features
 */
class SessionEntity {
  /**
   * Creates a new session entity with enhanced validation and metadata
   * 
   * @param {Object} src - Source data for session creation
   * @param {string} src.userId - User identifier (required)
   * @param {string} src.fingerprint - Device fingerprint (required)
   * @param {string} src.ipAddress - IP address (required)
   * @param {string} [src.ua] - User agent string
   * @param {number} [src.expiredAt] - Custom expiration timestamp
   * @param {Object} [src.metadata] - Additional session metadata
   * @param {boolean} [src.rememberMe] - Remember me flag for extended sessions
   * @param {string} [src.deviceType] - Device type (mobile, desktop, tablet)
   * @param {Object} [src.geoLocation] - Geographic location data
   * @throws {ErrorWrapper} When validation fails
   */
  constructor(src = {}) {
    // Core validation
    this._validateRequiredFields(src)
    this._validateOptionalFields(src)
    
    // Core session properties
    this.refreshToken = uuidV4()
    this.userId = src.userId
    this.fingerprint = src.fingerprint
    this.ipAddress = typeof src.ipAddress === 'string' && src.ipAddress.trim().length
      ? src.ipAddress.trim()
      : (typeof src.ip === 'string' ? src.ip.trim() : null)
    this.ua = src.ua || null
    
    // Enhanced session metadata
    this.metadata = this._buildMetadata(src)
    
    // Session timing
    this.createdAt = Date.now()
    this.expiredAt = this._calculateExpiration(src)
    
    // Security and tracking
    this.securityLevel = this._assessSecurityLevel(src)
    this.sessionType = this._determineSessionType(src)
    
    // Validate final entity
    this._validateEntity()
  }

  /**
   * Validates required fields with comprehensive error messages
   * @private
   */
  _validateRequiredFields(src) {
    try {
      assert.validate(src.userId, UserModel.schema.id, { required: true })
    } catch (error) {
      throw new ErrorWrapper({
        ...errorCodes.BAD_REQUEST,
        message: 'Invalid or missing userId',
        field: 'userId',
        value: src.userId
      })
    }

    try {
      assert.validate(src.fingerprint, SessionModel.schema.fingerprint, { required: true })
    } catch (error) {
      throw new ErrorWrapper({
        ...errorCodes.BAD_REQUEST,
        message: 'Invalid or missing device fingerprint',
        field: 'fingerprint',
        value: src.fingerprint
      })
    }

    const primaryIp = src.ipAddress || src.ip
    try {
      assert.validate(primaryIp, SessionModel.schema.ipAddress, { required: true })
    } catch (error) {
      throw new ErrorWrapper({
        ...errorCodes.BAD_REQUEST,
        message: 'Invalid or missing IP address',
        field: 'ipAddress',
        value: primaryIp
      })
    }
  }

  /**
   * Validates optional fields with type checking
   * @private
   */
  _validateOptionalFields(src) {
    // User agent validation
    if (src.ua !== undefined) {
      try {
        assert.validate(src.ua, SessionModel.schema.ua)
      } catch (error) {
        throw new ErrorWrapper({
          ...errorCodes.BAD_REQUEST,
          message: 'Invalid user agent format',
          field: 'ua',
          value: src.ua
        })
      }
    }

    // Custom expiration validation
    if (src.expiredAt !== undefined && !Number(src.expiredAt)) {
      throw new ErrorWrapper({
        ...errorCodes.UNPROCESSABLE_ENTITY,
        message: 'Invalid expiredAt value - must be a valid timestamp',
        field: 'expiredAt',
        value: src.expiredAt
      })
    }

    // Device type validation
    if (src.deviceType && !['mobile', 'desktop', 'tablet', 'unknown'].includes(src.deviceType)) {
      throw new ErrorWrapper({
        ...errorCodes.BAD_REQUEST,
        message: 'Invalid device type',
        field: 'deviceType',
        value: src.deviceType,
        allowedValues: ['mobile', 'desktop', 'tablet', 'unknown']
      })
    }

    // Geographic location validation
    if (src.geoLocation) {
      this._validateGeoLocation(src.geoLocation)
    }
  }

  /**
   * Validates geographic location data
   * @private
   */
  _validateGeoLocation(geoLocation) {
    if (typeof geoLocation !== 'object') {
      throw new ErrorWrapper({
        ...errorCodes.BAD_REQUEST,
        message: 'Geographic location must be an object',
        field: 'geoLocation'
      })
    }

    // Validate latitude
    if (geoLocation.latitude !== undefined) {
      const lat = parseFloat(geoLocation.latitude)
      if (isNaN(lat) || lat < -90 || lat > 90) {
        throw new ErrorWrapper({
          ...errorCodes.BAD_REQUEST,
          message: 'Invalid latitude - must be between -90 and 90',
          field: 'geoLocation.latitude',
          value: geoLocation.latitude
        })
      }
    }

    // Validate longitude
    if (geoLocation.longitude !== undefined) {
      const lng = parseFloat(geoLocation.longitude)
      if (isNaN(lng) || lng < -180 || lng > 180) {
        throw new ErrorWrapper({
          ...errorCodes.BAD_REQUEST,
          message: 'Invalid longitude - must be between -180 and 180',
          field: 'geoLocation.longitude',
          value: geoLocation.longitude
        })
      }
    }

    // Validate country code
    if (geoLocation.country && !/^[A-Z]{2}$/.test(geoLocation.country)) {
      throw new ErrorWrapper({
        ...errorCodes.BAD_REQUEST,
        message: 'Invalid country code - must be 2-letter ISO code',
        field: 'geoLocation.country',
        value: geoLocation.country
      })
    }
  }

  /**
   * Builds comprehensive session metadata
   * @private
   */
  _buildMetadata(src) {
    const metadata = {
      // Device information
      device: {
        type: this._detectDeviceType(src.ua),
        fingerprint: src.fingerprint,
        userAgent: src.ua,
        capabilities: this._analyzeDeviceCapabilities(src.ua)
      },

      // Network information
      network: {
        ip: this.ipAddress,
        ipType: this._detectIPType(this.ipAddress),
        ...this._analyzeNetworkInfo(this.ipAddress)
      },

      // Session behavior
      behavior: {
        rememberMe: src.rememberMe || false,
        sessionType: this._determineSessionType(src),
        creationContext: src.creationContext || 'web_login'
      },

      // Security metadata
      security: {
        riskFactors: [],
        trustLevel: 'unknown',
        requiresVerification: false
      },

      // Custom metadata
      custom: src.metadata || {}
    }

    // Add geographic information if available
    if (src.geoLocation || sessionConfig.security.collectMetadata.geoLocation) {
      metadata.location = {
        ...src.geoLocation,
        timestamp: Date.now(),
        source: src.geoLocation ? 'provided' : 'detected'
      }
    }

    return metadata
  }

  /**
   * Calculates session expiration with enhanced logic
   * @private
   */
  _calculateExpiration(src) {
    if (src.expiredAt) {
      return Number(src.expiredAt)
    }

    const baseExpiration = new Date().getTime() + expiredAtPeriodSec
    
    // Extend expiration for "remember me" sessions
    if (src.rememberMe) {
      const extendedPeriod = ms(config.token.refresh.rememberMeExpiresIn || '30d')
      return new Date().getTime() + extendedPeriod
    }

    // Shorter expiration for high-risk sessions
    const securityLevel = this._assessSecurityLevel(src)
    if (securityLevel === 'high') {
      const shortPeriod = ms(sessionConfig.redis.shortTTL || '1h')
      return new Date().getTime() + shortPeriod
    }

    return baseExpiration
  }

  /**
   * Assesses security level based on session characteristics
   * @private
   */
  _assessSecurityLevel(src) {
    let riskScore = 0
    const riskFactors = []

    // Analyze user agent for suspicious patterns
    if (src.ua) {
      if (this._isSuspiciousUserAgent(src.ua)) {
        riskScore += 3
        riskFactors.push('suspicious_user_agent')
      }
    } else {
      riskScore += 1
      riskFactors.push('missing_user_agent')
    }

    // Analyze IP address
    if (this._isPrivateIP(this.ipAddress)) {
      riskScore += 1
      riskFactors.push('private_ip')
    }

    // Geographic risk factors
    if (src.geoLocation && sessionConfig.security.anomalyDetection.allowedCountries) {
      const allowedCountries = sessionConfig.security.anomalyDetection.allowedCountries
      if (!allowedCountries.includes(src.geoLocation.country)) {
        riskScore += 2
        riskFactors.push('restricted_country')
      }
    }

    // Store risk factors in metadata
    if (this.metadata) {
      this.metadata.security.riskFactors = riskFactors
    }

    // Determine security level
    if (riskScore >= 4) return 'high'
    if (riskScore >= 2) return 'medium'
    return 'low'
  }

  /**
   * Determines session type based on characteristics
   * @private
   */
  _determineSessionType(src) {
    if (src.rememberMe) return 'persistent'
    if (src.deviceType === 'mobile') return 'mobile'
    if (this._isSuspiciousUserAgent(src.ua)) return 'suspicious'
    return 'standard'
  }

  /**
   * Detects device type from user agent
   * @private
   */
  _detectDeviceType(ua) {
    if (!ua) return 'unknown'
    
    const uaLower = ua.toLowerCase()
    
    if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(uaLower)) {
      return 'mobile'
    }
    
    if (/tablet|ipad|android(?!.*mobile)/i.test(uaLower)) {
      return 'tablet'
    }
    
    return 'desktop'
  }

  /**
   * Analyzes device capabilities from user agent
   * @private
   */
  _analyzeDeviceCapabilities(ua) {
    if (!ua) return {}

    return {
      browser: this._extractBrowser(ua),
      os: this._extractOS(ua),
      mobile: /mobile/i.test(ua),
      tablet: /tablet|ipad/i.test(ua)
    }
  }

  /**
   * Extracts browser information from user agent
   * @private
   */
  _extractBrowser(ua) {
    if (/chrome/i.test(ua)) return 'Chrome'
    if (/firefox/i.test(ua)) return 'Firefox'
    if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari'
    if (/edge/i.test(ua)) return 'Edge'
    if (/opera/i.test(ua)) return 'Opera'
    return 'Unknown'
  }

  /**
   * Extracts OS information from user agent
   * @private
   */
  _extractOS(ua) {
    if (/windows/i.test(ua)) return 'Windows'
    if (/mac os x/i.test(ua)) return 'macOS'
    if (/android/i.test(ua)) return 'Android'
    if (/ios|iphone|ipad/i.test(ua)) return 'iOS'
    if (/linux/i.test(ua)) return 'Linux'
    return 'Unknown'
  }

  /**
   * Detects IP address type
   * @private
   */
  _detectIPType(ip) {
    if (this._isPrivateIP(ip)) return 'private'
    if (this._isLoopbackIP(ip)) return 'loopback'
    return 'public'
  }

  /**
   * Analyzes network information
   * @private
   */
  _analyzeNetworkInfo(ip) {
    return {
      version: ip.includes(':') ? 'IPv6' : 'IPv4',
      isPrivate: this._isPrivateIP(ip),
      isLoopback: this._isLoopbackIP(ip)
    }
  }

  /**
   * Checks if user agent appears suspicious
   * @private
   */
  _isSuspiciousUserAgent(ua) {
    if (!ua) return true
    
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /automated/i,
      /headless/i,
      /curl/i,
      /wget/i
    ]
    
    return suspiciousPatterns.some(pattern => pattern.test(ua))
  }

  /**
   * Checks if IP is private/internal
   * @private
   */
  _isPrivateIP(ip) {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i
    ]
    
    return privateRanges.some(range => range.test(ip))
  }

  /**
   * Checks if IP is loopback
   * @private
   */
  _isLoopbackIP(ip) {
    return /^127\./.test(ip) || ip === '::1'
  }

  /**
   * Final validation of the complete entity
   * @private
   */
  _validateEntity() {
    // Ensure expiration is in the future
    if (this.expiredAt <= Date.now()) {
      throw new ErrorWrapper({
        ...errorCodes.BAD_REQUEST,
        message: 'Session expiration must be in the future',
        field: 'expiredAt',
        value: this.expiredAt
      })
    }

    // Validate refresh token format
    if (!this.refreshToken || typeof this.refreshToken !== 'string') {
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Failed to generate valid refresh token'
      })
    }

    // Ensure metadata is properly structured
    if (!this.metadata || typeof this.metadata !== 'object') {
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Failed to generate session metadata'
      })
    }
  }

  /**
   * Converts entity to database-safe object
   * @returns {Object} Database-safe session object
   */
  toDatabase() {
    const dbObject = {
      refreshToken: this.refreshToken,
      userId: this.userId,
      fingerprint: this.fingerprint,
      ipAddress: this.ipAddress,
      ua: this.ua,
      expiredAt: this.expiredAt
    }

    // Add enhanced fields if they exist in the schema
    // This provides backward compatibility during migration
    try {
      dbObject.securityLevel = this.securityLevel
      dbObject.sessionType = this.sessionType
      dbObject.metadata = JSON.stringify(this.metadata)
      
      // Only add createdAt if it's not already handled by database defaults
      if (this.createdAt) {
        dbObject.createdAt = new Date(this.createdAt)
      }
    } catch (error) {
      // Graceful degradation - continue without enhanced fields
      // This allows the system to work during migration period
    }

    return dbObject
  }

  /**
   * Converts entity to cache-safe object
   * @returns {Object} Cache-safe session object
   */
  toCache() {
    return {
      id: this.id, // Will be set after database creation
      refreshToken: this.refreshToken,
      userId: this.userId,
      fingerprint: this.fingerprint,
      ipAddress: this.ipAddress,
      ua: this.ua,
      expiredAt: this.expiredAt,
      createdAt: this.createdAt,
      securityLevel: this.securityLevel,
      sessionType: this.sessionType,
      // Simplified metadata for cache
      deviceType: this.metadata.device.type,
      location: this.metadata.location
    }
  }

  /**
   * Converts entity to API-safe object (for responses)
   * @returns {Object} API-safe session object
   */
  toAPI() {
    return {
      id: this.id,
      fingerprint: this.fingerprint,
      ipAddress: this.ipAddress,
      deviceType: this.metadata.device.type,
      browser: this.metadata.device.capabilities.browser,
      os: this.metadata.device.capabilities.os,
      location: this.metadata.location,
      createdAt: this.createdAt,
      expiredAt: this.expiredAt,
      securityLevel: this.securityLevel,
      sessionType: this.sessionType,
      isActive: this.expiredAt > Date.now()
    }
  }
}

module.exports = SessionEntity
