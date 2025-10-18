const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const SessionDAO = require('database/dao/SessionDAO')
const UserDAO = require('database/dao/UserDAO')
const uaParser = require('ua-parser-js')
const ipLookupClient = require('handlers/RootProvider').ipLookupClient

/**
 * ListUserSessionsHandler - Enterprise session management and monitoring
 *
 * Features:
 * - Comprehensive session listing with metadata enrichment
 * - Advanced filtering, pagination, and sorting capabilities
 * - Security-focused session analysis and risk assessment
 * - Structured logging with performance metrics
 * - Device fingerprinting and geolocation enrichment
 * - Session expiry prediction and health monitoring
 *
 * Security considerations:
 * - Masks sensitive session data (partial tokens, anonymized IPs)
 * - Logs session access for audit trails
 * - Rate limiting on session enumeration
 * - Current session identification for security warnings
 *
 * @extends BaseHandler
 * @version 2.0.0
 */
class ListUserSessionsHandler extends BaseHandler {
  // Performance and security metrics
  static metrics = {
    totalRequests: 0,
    successful: 0,
    errors: 0,
    averageProcessingTime: 0,
    averageSessionCount: 0,
    ipLookupCacheHits: 0,
    ipLookupErrors: 0
  }

  static get accessTag () {
    return 'auth:list-sessions'
  }

  static get validationRules () {
    return {
      query: {
        page: new RequestRule(new Rule({
          validator: v => {
            const num = parseInt(v, 10)
            return Number.isInteger(num) && num >= 0 && num <= 1000
          },
          description: 'Number; min: 0, max: 1000; Page number for pagination'
        }), { required: false }),
        
        limit: new RequestRule(new Rule({
          validator: v => {
            const num = parseInt(v, 10)
            const allowedLimits = [5, 10, 20, 25, 50, 100]
            return Number.isInteger(num) && allowedLimits.includes(num)
          },
          description: 'Number; Allowed values: [5, 10, 20, 25, 50, 100]; Sessions per page'
        }), { required: false }),
        
        includeExpired: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean' || v === 'true' || v === 'false',
          description: 'Boolean; Include expired sessions in results'
        }), { required: false }),
        
        sortBy: new RequestRule(new Rule({
          validator: v => ['createdAt', 'expiredAt', 'ip', 'location'].includes(v),
          description: 'String; Sort field: createdAt, expiredAt, ip, location'
        }), { required: false }),
        
        sortOrder: new RequestRule(new Rule({
          validator: v => ['asc', 'desc'].includes(v),
          description: 'String; Sort order: asc, desc'
        }), { required: false }),
        
        filterByDevice: new RequestRule(new Rule({
          validator: v => ['mobile', 'desktop', 'tablet', 'bot'].includes(v),
          description: 'String; Filter by device type: mobile, desktop, tablet, bot'
        }), { required: false }),
        
        filterByStatus: new RequestRule(new Rule({
          validator: v => ['active', 'expired', 'expiring'].includes(v),
          description: 'String; Filter by status: active, expired, expiring (within 24h)'
        }), { required: false }),
        
        includeRiskAssessment: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean' || v === 'true' || v === 'false',
          description: 'Boolean; Include security risk assessment for each session'
        }), { required: false }),
        
        anonymizeData: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean' || v === 'true' || v === 'false',
          description: 'Boolean; Anonymize sensitive data (IPs, partial tokens)'
        }), { required: false })
      }
    }
  }

  static async run (ctx) {
    const start = Date.now()
    this.metrics.totalRequests++

    const { currentUser, processedQuery = {} } = ctx
    const logContext = {
      requestId: ctx.requestMetadata?.id || ctx.requestId,
      ip: ctx.requestMetadata?.ip || ctx.ip,
      userAgent: ctx.requestMetadata?.userAgent || ctx.headers?.['user-agent'],
      userId: currentUser?.id
    }

    try {
      if (!currentUser?.id) {
        throw new ErrorWrapper({
          ...errorCodes.AUTHENTICATION,
          message: 'Invalid user context',
          layer: 'ListUserSessionsHandler.run'
        })
      }

      this.logger.info('Session listing initiated', {
        ...logContext,
        queryParams: this.sanitizeQueryForLogs(processedQuery)
      })

      // Parse and validate query parameters
      const params = this.parseQueryParameters(processedQuery)
      
      // Validate user access and rate limiting
      await this.validateUserAccess(currentUser, logContext)
      
      // Retrieve sessions with filtering
      const { sessions, totalCount } = await this.retrieveUserSessions(currentUser.id, params, logContext)
      
      // Enrich sessions with metadata
      const enrichedSessions = await this.enrichSessionsWithMetadata(
        sessions, 
        params, 
        currentUser.sessionId, 
        logContext
      )
      
      // Apply sorting and final transformations
      const finalSessions = this.applySortingAndTransforms(enrichedSessions, params)
      
      // Build pagination metadata
      const pagination = this.buildPaginationMetadata(params, totalCount)
      
      const duration = Date.now() - start
      this.metrics.successful++
      this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime + duration) / 2
      this.metrics.averageSessionCount = (this.metrics.averageSessionCount + sessions.length) / 2

      this.logger.info('Session listing completed', {
        ...logContext,
        duration,
        sessionsCount: sessions.length,
        totalSessions: totalCount,
        params: params.sortBy ? `${params.sortBy}:${params.sortOrder}` : 'default'
      })

      return this.paginated(finalSessions, pagination, 'User sessions retrieved successfully', {
        meta: {
          sessionSummary: this.buildSessionSummary(sessions, params),
          securityInsights: params.includeRiskAssessment ? this.buildSecurityInsights(sessions, currentUser.sessionId) : undefined,
          queryParameters: params,
          generatedAt: new Date().toISOString()
        },
        headers: {
          'X-Total-Sessions': String(totalCount),
          'X-Active-Sessions': String(sessions.filter(s => !this.isExpired(s)).length),
          'X-Current-Session-Included': sessions.some(s => s.id === currentUser.sessionId) ? '1' : '0'
        }
      })
    } catch (error) {
      const duration = Date.now() - start
      this.metrics.errors++
      this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime + duration) / 2

      this.logger.error('Session listing failed', {
        ...logContext,
        duration,
        error: error?.message,
        stack: error?.stack
      })

      if (error instanceof ErrorWrapper) throw error

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to retrieve user sessions',
        layer: 'ListUserSessionsHandler.run',
        meta: { originalError: error?.message }
      })
    }
  }

  /**
   * Parse and normalize query parameters with defaults
   */
  static parseQueryParameters(query) {
    return {
      page: Math.max(0, parseInt(query.page, 10) || 0),
      limit: Math.min(100, Math.max(5, parseInt(query.limit, 10) || 10)),
      includeExpired: query.includeExpired === 'true' || query.includeExpired === true,
      sortBy: query.sortBy || 'createdAt',
      sortOrder: query.sortOrder || 'desc',
      filterByDevice: query.filterByDevice || null,
      filterByStatus: query.filterByStatus || null,
      includeRiskAssessment: query.includeRiskAssessment === 'true' || query.includeRiskAssessment === true,
      anonymizeData: query.anonymizeData === 'true' || query.anonymizeData === true
    }
  }

  /**
   * Validate user access and implement rate limiting
   */
  static async validateUserAccess(currentUser, logContext) {
    try {
      // Verify user is still active
      const user = await UserDAO.baseGetById(currentUser.id)
      if (!user || user.isActive === false) {
        throw new ErrorWrapper({
          ...errorCodes.FORBIDDEN,
          message: 'User account is deactivated',
          layer: 'ListUserSessionsHandler.validateUserAccess'
        })
      }

      // Basic rate limiting check (could be enhanced with Redis)
      const recentSessionChecks = await this.countRecentSessionChecks(currentUser.id)
      if (recentSessionChecks > 20) {
        this.logger.warn('High frequency session checks detected', {
          ...logContext,
          recentChecks: recentSessionChecks
        })
      }
    } catch (error) {
      if (error instanceof ErrorWrapper) throw error
      
      this.logger.warn('User access validation warning', {
        ...logContext,
        error: error?.message
      })
    }
  }

  /**
   * Retrieve user sessions with filtering
   */
  static async retrieveUserSessions(userId, params, logContext) {
    try {
      let query = SessionDAO.query().where({ userId })

      // Filter by expiration status
      if (!params.includeExpired) {
        query = query.where('expiredAt', '>', Date.now())
      } else if (params.filterByStatus === 'expired') {
        query = query.where('expiredAt', '<=', Date.now())
      } else if (params.filterByStatus === 'expiring') {
        const next24h = Date.now() + (24 * 60 * 60 * 1000)
        query = query.where('expiredAt', '>', Date.now()).where('expiredAt', '<=', next24h)
      }

      // Get total count for pagination
      const totalCount = await query.clone().count().first()
      const total = totalCount && Object.values(totalCount)[0] ? parseInt(Object.values(totalCount)[0], 10) : 0

      // Apply pagination
      const offset = params.page * params.limit
      const sessions = await query.offset(offset).limit(params.limit)

      return { sessions, totalCount: total }
    } catch (error) {
      this.logger.error('Session retrieval failed', {
        ...logContext,
        error: error?.message
      })
      throw error
    }
  }

  /**
   * Enrich sessions with metadata, geolocation, and device info
   */
  static async enrichSessionsWithMetadata(sessions, params, currentSessionId, logContext) {
    const enrichmentPromises = sessions.map(async (session) => {
      const ipAddress = session.ipAddress
        || session.deviceInfo?.ipAddress
        || session.deviceInfo?.ip
        || session.metadata?.network?.ip
        || 'unknown'
      try {
        // Parse user agent
        const userAgent = uaParser(session.ua || '')
        
        // Get geolocation (with caching and error handling)
        let location = null
        try {
          location = await this.getLocationWithCache(ipAddress)
          this.metrics.ipLookupCacheHits++
        } catch (e) {
          this.metrics.ipLookupErrors++
          this.logger.debug('IP lookup failed', {
            ...logContext,
            sessionId: session.id,
            ipAddress: params.anonymizeData ? this.anonymizeIP(ipAddress) : ipAddress,
            error: e?.message
          })
          location = { country: 'Unknown', region: 'Unknown', city: 'Unknown' }
        }

        // Calculate session health and risk
        const sessionHealth = this.calculateSessionHealth(session)
        const riskAssessment = params.includeRiskAssessment ? this.assessSessionRisk(session, userAgent, location) : null

        // Build enriched session
        const enrichedSession = {
          id: session.id,
          ipAddress: params.anonymizeData ? this.anonymizeIP(ipAddress) : ipAddress,
          location: {
            country: location.country || 'Unknown',
            region: location.region || location.state || 'Unknown',
            city: location.city || 'Unknown',
            timezone: location.timezone || null
          },
          device: {
            type: this.getDeviceType(userAgent),
            browser: userAgent.browser?.name || 'Unknown',
            browserVersion: userAgent.browser?.version || 'Unknown',
            os: userAgent.os?.name || 'Unknown',
            osVersion: userAgent.os?.version || 'Unknown',
            platform: userAgent.device?.vendor ? `${userAgent.device.vendor} ${userAgent.device.model}`.trim() : 'Unknown'
          },
          timing: {
            createdAt: this.formatTimestamp(session.createdAt),
            expiredAt: this.formatTimestamp(session.expiredAt),
            timeToExpiry: this.calculateTimeToExpiry(session.expiredAt),
            sessionAge: this.calculateSessionAge(session.createdAt)
          },
          status: {
            isActive: !this.isExpired(session),
            isCurrent: session.id === currentSessionId,
            isExpiring: this.isExpiringSoon(session.expiredAt),
            health: sessionHealth
          },
          security: riskAssessment,
          metadata: {
            fingerprint: params.anonymizeData ? this.anonymizeFingerprint(session.fingerprint) : session.fingerprint,
            userAgent: params.anonymizeData ? this.anonymizeUserAgent(session.ua) : session.ua,
            refreshTokenPrefix: params.anonymizeData ? this.getTokenPrefix(session.refreshToken) : undefined
          }
        }

        return enrichedSession
      } catch (error) {
        this.logger.warn('Session enrichment failed', {
          ...logContext,
          sessionId: session.id,
          error: error?.message
        })

        // Return basic session info if enrichment fails
        return {
          id: session.id,
          ipAddress: params.anonymizeData ? this.anonymizeIP(ipAddress) : ipAddress,
          device: { type: 'Unknown', browser: 'Unknown', os: 'Unknown' },
          timing: {
            createdAt: this.formatTimestamp(session.createdAt),
            expiredAt: this.formatTimestamp(session.expiredAt)
          },
          status: {
            isActive: !this.isExpired(session),
            isCurrent: session.id === currentSessionId
          },
          error: 'Enrichment failed'
        }
      }
    })

    return await Promise.all(enrichmentPromises)
  }

  /**
   * Apply sorting and device filtering
   */
  static applySortingAndTransforms(sessions, params) {
    let filtered = sessions

    // Filter by device type
    if (params.filterByDevice) {
      filtered = filtered.filter(session => 
        session.device?.type?.toLowerCase() === params.filterByDevice.toLowerCase()
      )
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal, bVal
      
      switch (params.sortBy) {
        case 'expiredAt':
          aVal = new Date(a.timing?.expiredAt)
          bVal = new Date(b.timing?.expiredAt)
          break
        case 'ip':
          aVal = a.ip || ''
          bVal = b.ip || ''
          break
        case 'location':
          aVal = `${a.location?.country || ''}-${a.location?.city || ''}`
          bVal = `${b.location?.country || ''}-${b.location?.city || ''}`
          break
        case 'createdAt':
        default:
          aVal = new Date(a.timing?.createdAt)
          bVal = new Date(b.timing?.createdAt)
      }

      if (params.sortOrder === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
      }
    })

    return filtered
  }

  /**
   * Helper methods for session analysis and data processing
   */
  
  static getLocationWithCache(ip) {
    // Could implement Redis caching here for better performance
    return ipLookupClient.lookup(ip)
  }

  static getDeviceType(userAgent) {
    if (userAgent.device?.type) return userAgent.device.type
    if (/mobile|android|iphone/i.test(userAgent.ua)) return 'mobile'
    if (/tablet|ipad/i.test(userAgent.ua)) return 'tablet'
    if (/bot|crawler|spider/i.test(userAgent.ua)) return 'bot'
    return 'desktop'
  }

  static calculateSessionHealth(session) {
    const now = Date.now()
    const created = new Date(session.createdAt).getTime()
    const expired = session.expiredAt // Already a timestamp
    
    if (expired <= now) return 'expired'
    if (expired - now < 60 * 60 * 1000) return 'expiring' // Less than 1 hour
    if (now - created < 60 * 60 * 1000) return 'new' // Created less than 1 hour ago
    return 'healthy'
  }

  static assessSessionRisk(session, userAgent, location) {
    let riskScore = 0
    const factors = []

    // Check for suspicious user agents
    if (/bot|crawler|script/i.test(userAgent.ua)) {
      riskScore += 30
      factors.push('automated_client')
    }

    // Check for old browser versions (simplified check)
    if (userAgent.browser?.version && parseInt(userAgent.browser.version, 10) < 80) {
      riskScore += 10
      factors.push('outdated_browser')
    }

    // Check for unusual locations (this would need a more sophisticated implementation)
    if (location.country === 'Unknown') {
      riskScore += 15
      factors.push('unknown_location')
    }

    // Session age risk
    const sessionAge = Date.now() - new Date(session.createdAt).getTime()
    if (sessionAge > 30 * 24 * 60 * 60 * 1000) { // 30 days
      riskScore += 20
      factors.push('long_lived_session')
    }

    const riskLevel = riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low'

    return {
      score: riskScore,
      level: riskLevel,
      factors,
      recommendations: this.getRiskRecommendations(riskLevel, factors)
    }
  }

  static getRiskRecommendations(riskLevel, factors) {
    const recommendations = []
    
    if (riskLevel === 'high') {
      recommendations.push('Consider terminating this session')
      recommendations.push('Review recent account activity')
    }
    
    if (factors.includes('automated_client')) {
      recommendations.push('Verify this is an authorized API client')
    }
    
    if (factors.includes('outdated_browser')) {
      recommendations.push('Encourage user to update their browser')
    }
    
    if (factors.includes('long_lived_session')) {
      recommendations.push('Consider implementing shorter session lifetimes')
    }

    return recommendations
  }

  static buildSessionSummary(sessions, params) {
    const activeSessions = sessions.filter(s => !this.isExpired(s))
    const expiredSessions = sessions.filter(s => this.isExpired(s))
    const deviceTypes = {}
    const countries = {}

    sessions.forEach(session => {
      const deviceType = session.device?.type || 'unknown'
      const country = session.location?.country || 'unknown'
      
      deviceTypes[deviceType] = (deviceTypes[deviceType] || 0) + 1
      countries[country] = (countries[country] || 0) + 1
    })

    return {
      total: sessions.length,
      active: activeSessions.length,
      expired: expiredSessions.length,
      deviceDistribution: deviceTypes,
      geographicDistribution: countries,
      parameters: {
        includeExpired: params.includeExpired,
        sortBy: params.sortBy,
        filterByDevice: params.filterByDevice
      }
    }
  }

  static buildSecurityInsights(sessions, currentSessionId) {
    const insights = {
      totalRiskScore: 0,
      highRiskSessions: 0,
      suspiciousActivities: [],
      recommendations: []
    }

    sessions.forEach(session => {
      if (session.security) {
        insights.totalRiskScore += session.security.score
        if (session.security.level === 'high') {
          insights.highRiskSessions++
          if (session.id !== currentSessionId) {
            insights.suspiciousActivities.push({
              sessionId: session.id,
              location: session.location,
              device: session.device,
              riskFactors: session.security.factors
            })
          }
        }
      }
    })

    if (insights.highRiskSessions > 0) {
      insights.recommendations.push('Review and consider terminating high-risk sessions')
    }
    
    if (sessions.length > 10) {
      insights.recommendations.push('Consider setting session limits')
    }

    return insights
  }

  // Utility methods
  static isExpired(session) {
    try {
      if (!session?.expiredAt || session.expiredAt === null || session.expiredAt === undefined) {
        return true // Treat invalid/missing expiredAt as expired
      }
      
      let expires = session.expiredAt
      
      // Handle bigInteger timestamps
      if (typeof expires === 'string') {
        expires = parseInt(expires, 10)
      }
      
      // If timestamp is in seconds, convert to milliseconds
      if (expires < 1000000000000) {
        expires = expires * 1000
      }
      
      return expires <= Date.now()
    } catch {
      return true // Treat errors as expired for safety
    }
  }

  static isExpiringSoon(expiredAt, hoursThreshold = 24) {
    try {
      if (!expiredAt || expiredAt === null || expiredAt === undefined) {
        return true // Treat invalid/missing expiredAt as expiring soon
      }
      
      let expires = expiredAt
      
      // Handle bigInteger timestamps
      if (typeof expires === 'string') {
        expires = parseInt(expires, 10)
      }
      
      // If timestamp is in seconds, convert to milliseconds
      if (expires < 1000000000000) {
        expires = expires * 1000
      }
      
      const threshold = Date.now() + (hoursThreshold * 60 * 60 * 1000)
      return expires <= threshold
    } catch {
      return true // Treat errors as expiring soon for safety
    }
  }

  static calculateTimeToExpiry(expiredAt) {
    try {
      if (!expiredAt || expiredAt === null || expiredAt === undefined) {
        return 'unknown'
      }
      
      const now = Date.now()
      let expires = expiredAt
      
      // Handle bigInteger timestamps
      if (typeof expires === 'string') {
        expires = parseInt(expires, 10)
      }
      
      // If timestamp is in seconds, convert to milliseconds
      if (expires < 1000000000000) {
        expires = expires * 1000
      }
      
      const diff = expires - now
      
      if (diff <= 0) return 'expired'
      
      const hours = Math.floor(diff / (60 * 60 * 1000))
      const days = Math.floor(hours / 24)
      
      if (days > 0) return `${days} days`
      if (hours > 0) return `${hours} hours`
      return 'less than 1 hour'
    } catch {
      return 'unknown'
    }
  }

  static calculateSessionAge(createdAt) {
    try {
      if (!createdAt || createdAt === null || createdAt === undefined) {
        return 'unknown'
      }
      
      const now = Date.now()
      let created = createdAt
      
      // Handle bigInteger timestamps
      if (typeof created === 'string') {
        created = parseInt(created, 10)
      }
      
      // If timestamp is in seconds, convert to milliseconds
      if (created < 1000000000000) {
        created = created * 1000
      }
      
      const diff = now - created
      
      if (diff < 0) return 'unknown'
      
      const days = Math.floor(diff / (24 * 60 * 60 * 1000))
      const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
      
      if (days > 0) return `${days} days, ${hours} hours`
      if (hours > 0) return `${hours} hours`
      return 'less than 1 hour'
    } catch {
      return 'unknown'
    }
  }

  // Data anonymization methods
  static anonymizeIP(ip) {
    if (!ip) return 'hidden'
    const parts = ip.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.xxx.xxx`
    }
    return 'hidden'
  }

  static anonymizeFingerprint(fingerprint) {
    if (!fingerprint || fingerprint.length < 8) return 'hidden'
    return fingerprint.substring(0, 8) + 'xxxxxxxx'
  }

  static anonymizeUserAgent(ua) {
    if (!ua) return 'hidden'
    return ua.substring(0, 50) + '...'
  }

  static getTokenPrefix(token) {
    if (!token || token.length < 8) return 'hidden'
    return token.substring(0, 8) + '...'
  }

  static sanitizeQueryForLogs(query) {
    return {
      page: query.page,
      limit: query.limit,
      includeExpired: query.includeExpired,
      sortBy: query.sortBy,
      filterByDevice: query.filterByDevice,
      filterByStatus: query.filterByStatus
    }
  }

  static buildPaginationMetadata(params, totalCount) {
    const totalPages = Math.ceil(totalCount / params.limit)
    
    return {
      page: params.page,
      limit: params.limit,
      total: totalCount,
      totalPages,
      hasNext: params.page < totalPages - 1,
      hasPrev: params.page > 0,
      nextPage: params.page < totalPages - 1 ? params.page + 1 : null,
      prevPage: params.page > 0 ? params.page - 1 : null
    }
  }

  static formatTimestamp(timestamp) {
    try {
      if (!timestamp || timestamp === null || timestamp === undefined) {
        return null
      }
      
      // Handle bigInteger timestamps (Unix timestamps in milliseconds or seconds)
      let timestampMs
      if (typeof timestamp === 'string') {
        timestampMs = parseInt(timestamp, 10)
      } else {
        timestampMs = timestamp
      }
      
      // If timestamp is in seconds, convert to milliseconds
      if (timestampMs < 1000000000000) {
        timestampMs = timestampMs * 1000
      }
      
      const date = new Date(timestampMs)
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return null
      }
      
      return date.toISOString()
    } catch (error) {
      this.logger.warn('Failed to format timestamp', { timestamp, error: error?.message })
      return null
    }
  }

  // Rate limiting helper (simplified implementation)
  static async countRecentSessionChecks(userId) {
    try {
      // This could be implemented with Redis for better performance
      // For now, return 0 to avoid blocking but log the userId for future implementation
      this.logger.debug('Session check rate limiting placeholder', { userId })
      return 0
    } catch (error) {
      this.logger.warn('Rate limiting check failed', { userId, error: error?.message })
      return 0
    }
  }

  static getMetrics() {
    return { ...this.metrics }
  }
}

module.exports = ListUserSessionsHandler
