
const { BaseMiddleware } = require('backend-core')
const { basicAuth, basicAuthRoutes } = require('../config')
const { stripTrailingSlash } = require('helpers').commonHelpers
const NodeCache = require('node-cache')
const { performance } = require('perf_hooks')
const crypto = require('crypto')
const bcrypt = require('bcrypt')

class BasicAuthMiddleware extends BaseMiddleware {
  constructor(options = {}) {
    super(options)
    
    // Authentication attempt tracking
    this.authAttempts = new NodeCache({
      stdTTL: 900, // 15 minutes
      checkperiod: 60,
      maxKeys: 10000,
      deleteOnExpire: true
    })
    
    // IP-based rate limiting
    this.ipRateLimit = new NodeCache({
      stdTTL: 3600, // 1 hour
      checkperiod: 300,
      maxKeys: 50000,
      deleteOnExpire: true
    })
    
    // User-based rate limiting
    this.userRateLimit = new NodeCache({
      stdTTL: 1800, // 30 minutes
      checkperiod: 120,
      maxKeys: 10000,
      deleteOnExpire: true
    })
    
    // Valid credentials cache
    this.credentialsCache = new NodeCache({
      stdTTL: 300, // 5 minutes
      checkperiod: 60,
      maxKeys: 1000,
      deleteOnExpire: true,
      useClones: false
    })
    
    // Security metrics
    this.metrics = {
      totalRequests: 0,
      successfulAuth: 0,
      failedAuth: 0,
      rateLimitedRequests: 0,
      bruteForceAttempts: 0,
      suspiciousActivities: 0,
      averageResponseTime: 0,
      uniqueIPs: new Set(),
      uniqueUsers: new Set()
    }
    this.config = {
      maxFailedAttempts: 5,
      lockoutDuration: 900, // 15 minutes
      maxRequestsPerIP: 100, // per hour
      maxRequestsPerUser: 50, // per 30 minutes
      enableBruteForceProtection: true,
      enableCredentialsCaching: true,
      enableSecurityHeaders: true,
      enableDetailedLogging: true,
      suspiciousPatterns: [
        /sql|union|select|insert|delete|drop/gi,
        /<script|javascript:|on\w+=/gi,
        /\.\.|\/etc\/|\/proc\/|\/sys\//gi
      ]
    }
    
    // Realm configurations for different routes
    this.realmConfig = new Map([
      ['/admin', 'Admin Area'],
      ['/api/internal', 'Internal API'],
      ['/debug', 'Debug Console'],
      ['default', 'Secure Area']
    ])
  }

  async init() {
    try {
      // Initialize security monitoring
      this.startSecurityMonitoring()
      this.setupCleanupTasks()
      
      // Pre-hash configured credentials for secure comparison
      await this.prepareCredentials()

      this.logger.info(`${this.constructor.name} initialization completed successfully`)
    } catch (error) {
      this.logger.error(`${this.constructor.name} initialization failed:`, error)
      throw error
    }
  }

  async prepareCredentials() {
    try {
      // Hash the configured password for secure storage
      if (basicAuth.password && !basicAuth.hashedPassword) {
        const saltRounds = 12
        basicAuth.hashedPassword = await bcrypt.hash(basicAuth.password, saltRounds)
        this.logger.debug('Basic auth credentials prepared securely')
      }
    } catch (error) {
      this.logger.error('Failed to prepare credentials:', error)
      throw error
    }
  }

  startSecurityMonitoring() {
    // Log security metrics every 10 minutes
    this._intervals = this._intervals || []
    this._intervals.push(setInterval(() => {
      this.logSecurityMetrics()
    }, 600000))
    
    // Clear old metrics every hour
    this._intervals.push(setInterval(() => {
      this.metrics.uniqueIPs.clear()
      this.metrics.uniqueUsers.clear()
    }, 3600000))
  }

  setupCleanupTasks() {
    // Cleanup expired entries every 5 minutes
    this._intervals = this._intervals || []
    this._intervals.push(setInterval(() => {
      this.cleanupExpiredEntries()
    }, 300000))
  }

  logSecurityMetrics() {
    const cacheStats = {
      authAttempts: this.authAttempts.getStats(),
      ipRateLimit: this.ipRateLimit.getStats(),
      userRateLimit: this.userRateLimit.getStats(),
      credentialsCache: this.credentialsCache.getStats()
    }
    
    const successRate = this.metrics.totalRequests > 0 
      ? (this.metrics.successfulAuth / this.metrics.totalRequests * 100).toFixed(2)
      : 0
    
    this.logger.info('BasicAuthMiddleware Security Metrics:', {
      performance: {
        ...this.metrics,
        successRate: `${successRate}%`,
        uniqueIPsCount: this.metrics.uniqueIPs.size,
        uniqueUsersCount: this.metrics.uniqueUsers.size
      },
      cacheStats
    })
  }

  cleanupExpiredEntries() {
    try {
      const now = Date.now()
      const attempts = this.authAttempts.keys()
      
      for (const key of attempts) {
        const data = this.authAttempts.get(key)
        if (data && data.lastAttempt && (now - data.lastAttempt) > this.config.lockoutDuration * 1000) {
          this.authAttempts.del(key)
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup expired entries:', error)
    }
  }

  generateSecureHash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
  }

  isRouteProtected(url) {
    const cleanUrl = stripTrailingSlash(url)
    return basicAuthRoutes.includes(cleanUrl) || basicAuthRoutes.some(route => cleanUrl.startsWith(route))
  }

  getRealm(url) {
    for (const [route, realm] of this.realmConfig) {
      if (url.startsWith(route)) {
        return realm
      }
    }
    return this.realmConfig.get('default')
  }

  isIPRateLimited(clientIP) {
    const ipKey = `ip:${clientIP}`
    const ipData = this.ipRateLimit.get(ipKey) || { count: 0, firstRequest: Date.now() }
    
    if (ipData.count >= this.config.maxRequestsPerIP) {
      this.metrics.rateLimitedRequests++
      return true
    }
    
    return false
  }

  isUserRateLimited(username) {
    const userKey = `user:${username}`
    const userData = this.userRateLimit.get(userKey) || { count: 0, firstRequest: Date.now() }
    
    if (userData.count >= this.config.maxRequestsPerUser) {
      this.metrics.rateLimitedRequests++
      return true
    }
    
    return false
  }

  updateRateLimits(clientIP, username) {
    // Update IP rate limit
    const ipKey = `ip:${clientIP}`
    const ipData = this.ipRateLimit.get(ipKey) || { count: 0, firstRequest: Date.now() }
    ipData.count++
    this.ipRateLimit.set(ipKey, ipData, 3600) // 1 hour TTL
    
    // Update user rate limit
    if (username) {
      const userKey = `user:${username}`
      const userData = this.userRateLimit.get(userKey) || { count: 0, firstRequest: Date.now() }
      userData.count++
      this.userRateLimit.set(userKey, userData, 1800) // 30 minutes TTL
    }
  }

  isBruteForceAttempt(clientIP, username) {
    if (!this.config.enableBruteForceProtection) return false
    
    const attemptKey = `${clientIP}:${username || 'unknown'}`
    const attemptData = this.authAttempts.get(attemptKey) || { 
      count: 0, 
      firstAttempt: Date.now(),
      lastAttempt: Date.now()
    }
    
    if (attemptData.count >= this.config.maxFailedAttempts) {
      const timeSinceLastAttempt = Date.now() - attemptData.lastAttempt
      if (timeSinceLastAttempt < this.config.lockoutDuration * 1000) {
        this.metrics.bruteForceAttempts++
        return true
      } else {
        // Reset attempts after lockout period
        this.authAttempts.del(attemptKey)
        return false
      }
    }
    
    return false
  }

  recordFailedAttempt(clientIP, username, reason) {
    const attemptKey = `${clientIP}:${username || 'unknown'}`
    const attemptData = this.authAttempts.get(attemptKey) || { 
      count: 0, 
      firstAttempt: Date.now(),
      lastAttempt: Date.now()
    }
    
    attemptData.count++
    attemptData.lastAttempt = Date.now()
    attemptData.reason = reason
    
    this.authAttempts.set(attemptKey, attemptData, this.config.lockoutDuration)
    this.metrics.failedAuth++
    
    this.logger.warn('Failed authentication attempt recorded', {
      clientIP,
      username: username || 'unknown',
      reason,
      attemptCount: attemptData.count,
      timestamp: new Date().toISOString()
    })
  }

  async validateCredentials(username, password) {
    if (!username || !password) {
      return { valid: false, reason: 'Missing credentials' }
    }
    
    // Check credentials cache first
    if (this.config.enableCredentialsCaching) {
      const cacheKey = this.generateSecureHash({ username, password })
      const cached = this.credentialsCache.get(cacheKey)
      if (cached !== undefined) {
        return cached
      }
    }
    
    let isValid = false
    let reason = 'Invalid credentials'
    
    try {
      // Validate username
      if (username === basicAuth.username) {
        // Use bcrypt for password comparison if hashed password exists
        if (basicAuth.hashedPassword) {
          isValid = await bcrypt.compare(password, basicAuth.hashedPassword)
        } else {
          // Fallback to plain text comparison (not recommended for production)
          isValid = password === basicAuth.password
        }
        
        if (!isValid) {
          reason = 'Invalid password'
        }
      } else {
        reason = 'Invalid username'
      }
      
      const result = { valid: isValid, reason: isValid ? 'Valid credentials' : reason }
      
      // Cache the result
      if (this.config.enableCredentialsCaching) {
        const cacheKey = this.generateSecureHash({ username, password })
        this.credentialsCache.set(cacheKey, result, 300) // 5 minutes
      }
      
      return result
    } catch (error) {
      this.logger.error('Credential validation error:', error)
      return { valid: false, reason: 'Validation error' }
    }
  }

  detectSuspiciousPatterns(username, password, userAgent) {
    const testStrings = [username, password, userAgent].filter(Boolean)
    
    for (const str of testStrings) {
      for (const pattern of this.config.suspiciousPatterns) {
        if (pattern.test(str)) {
          this.metrics.suspiciousActivities++
          return {
            suspicious: true,
            pattern: pattern.toString(),
            matchedString: str.substring(0, 50) // Limit logged string length
          }
        }
      }
    }
    
    return { suspicious: false }
  }

  parseAuthHeader(authHeader) {
    try {
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return { error: 'Invalid authorization header format' }
      }
      
      const token = authHeader.split(/\s+/).pop() || ''
      const auth = Buffer.from(token, 'base64').toString()
      const parts = auth.split(':')
      
      if (parts.length !== 2) {
        return { error: 'Invalid credential format' }
      }
      
      return {
        username: parts[0],
        password: parts[1]
      }
    } catch {
      return { error: 'Failed to parse authorization header' }
    }
  }

  generateWWWAuthenticateHeader(realm, additionalParams = {}) {
    let header = `Basic realm="${realm}"`
    
    // Add security parameters
    if (additionalParams.charset) {
      header += `, charset="${additionalParams.charset}"`
    }
    
    return header
  }

  handler() {
    return async (req, res, next) => {
      const startTime = performance.now()
      const requestId = req.requestId || crypto.randomUUID()
      const clientIP = req.ip || req.connection.remoteAddress
      const userAgent = req.headers['user-agent'] || 'unknown'
      const url = req.originalUrl
      
      try {
        this.metrics.totalRequests++
        this.metrics.uniqueIPs.add(clientIP)
        
        // Check if route requires basic authentication
        if (!this.isRouteProtected(url)) {
          return next()
        }
        
        // Rate limiting checks
        if (this.isIPRateLimited(clientIP)) {
          this.logger.warn('IP rate limit exceeded', {
            clientIP,
            userAgent,
            url,
            requestId
          })
          
          return res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded'
          })
        }
        
        // Parse authorization header
        const authHeader = req.headers.authorization || ''
        const parsedAuth = this.parseAuthHeader(authHeader)
        
        if (parsedAuth.error) {
          this.logger.warn('Invalid authorization header', {
            error: parsedAuth.error,
            clientIP,
            userAgent,
            requestId
          })
          
          const realm = this.getRealm(url)
          const wwwAuth = this.generateWWWAuthenticateHeader(realm)
          res.setHeader('WWW-Authenticate', wwwAuth)
          
          if (this.config.enableSecurityHeaders) {
            res.setHeader('X-Auth-Required', 'Basic')
            res.setHeader('X-Request-ID', requestId)
          }
          
          return res.status(401).json({
            error: 'Authentication required',
            message: 'Please provide valid credentials'
          })
        }
        
        const { username, password } = parsedAuth
        
        // Check for suspicious patterns
        const suspiciousCheck = this.detectSuspiciousPatterns(username, password, userAgent)
        if (suspiciousCheck.suspicious) {
          this.logger.error('Suspicious authentication attempt detected', {
            clientIP,
            username,
            pattern: suspiciousCheck.pattern,
            matchedString: suspiciousCheck.matchedString,
            userAgent,
            requestId
          })
          
          this.recordFailedAttempt(clientIP, username, 'Suspicious pattern detected')
          
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Suspicious activity detected'
          })
        }
        
        // Check for brute force attempts
        if (this.isBruteForceAttempt(clientIP, username)) {
          this.logger.error('Brute force attempt detected', {
            clientIP,
            username,
            userAgent,
            requestId
          })
          
          return res.status(429).json({
            error: 'Too many failed attempts',
            message: 'Account temporarily locked'
          })
        }
        
        // User-specific rate limiting
        if (this.isUserRateLimited(username)) {
          this.logger.warn('User rate limit exceeded', {
            username,
            clientIP,
            requestId
          })
          
          return res.status(429).json({
            error: 'Too many requests',
            message: 'User rate limit exceeded'
          })
        }
        
        // Validate credentials
        const validation = await this.validateCredentials(username, password)
        
        if (!validation.valid) {
          this.recordFailedAttempt(clientIP, username, validation.reason)
          
          this.logger.warn('Authentication failed', {
            username,
            reason: validation.reason,
            clientIP,
            userAgent,
            requestId
          })
          
          const realm = this.getRealm(url)
          const wwwAuth = this.generateWWWAuthenticateHeader(realm)
          res.setHeader('WWW-Authenticate', wwwAuth)
          
          if (this.config.enableSecurityHeaders) {
            res.setHeader('X-Auth-Failed', 'true')
            res.setHeader('X-Request-ID', requestId)
          }
          
          return res.status(401).json({
            error: 'Authentication failed',
            message: 'Invalid credentials'
          })
        }
        
        // Successful authentication
        this.metrics.successfulAuth++
        this.metrics.uniqueUsers.add(username)
        
        // Update rate limits
        this.updateRateLimits(clientIP, username)
        
        // Clear any existing failed attempts
        const attemptKey = `${clientIP}:${username}`
        this.authAttempts.del(attemptKey)
        
        // Add authentication info to request
        req.basicAuth = {
          username,
          authenticated: true,
          realm: this.getRealm(url)
        }
        
        // Set security headers
        if (this.config.enableSecurityHeaders) {
          res.setHeader('X-Authenticated-User', username)
          res.setHeader('X-Auth-Method', 'Basic')
          res.setHeader('X-Request-ID', requestId)
        }
        
        // Performance tracking
        const processingTime = performance.now() - startTime
        this.metrics.averageResponseTime = 
          (this.metrics.averageResponseTime + processingTime) / 2
        
        if (this.config.enableDetailedLogging) {
          this.logger.info('Basic authentication successful', {
            username,
            clientIP,
            userAgent,
            url,
            processingTime: `${processingTime.toFixed(2)}ms`,
            requestId
          })
        }
        
        next()
        
      } catch (error) {
        const processingTime = performance.now() - startTime
        
        this.logger.error('BasicAuthMiddleware error', {
          error: error.message,
          stack: error.stack,
          clientIP,
          userAgent,
          url,
          processingTime: `${processingTime.toFixed(2)}ms`,
          requestId
        })
        
        const realm = this.getRealm(url)
        const wwwAuth = this.generateWWWAuthenticateHeader(realm)
        res.setHeader('WWW-Authenticate', wwwAuth)
        
        res.status(500).json({
          error: 'Internal server error',
          message: 'Authentication service unavailable'
        })
      }
    }
  }

  // Admin methods for managing authentication
  async resetFailedAttempts(identifier) {
    try {
      const keys = this.authAttempts.keys()
      let resetCount = 0
      
      for (const key of keys) {
        if (key.includes(identifier)) {
          this.authAttempts.del(key)
          resetCount++
        }
      }
      
      this.logger.info(`Reset ${resetCount} failed attempts for identifier: ${identifier}`)
      return resetCount
    } catch (error) {
      this.logger.error('Failed to reset attempts:', error)
      throw error
    }
  }

  async getSecurityReport() {
    return {
      metrics: this.metrics,
      activeLockouts: this.authAttempts.keys().length,
      rateLimitedIPs: this.ipRateLimit.keys().length,
      rateLimitedUsers: this.userRateLimit.keys().length,
      cacheStats: {
        authAttempts: this.authAttempts.getStats(),
        ipRateLimit: this.ipRateLimit.getStats(),
        userRateLimit: this.userRateLimit.getStats(),
        credentialsCache: this.credentialsCache.getStats()
      },
      config: this.config,
      uptime: process.uptime()
    }
  }

  // Health check method
  getHealthStatus() {
    return {
      status: 'healthy',
      ...this.getSecurityReport()
    }
  }

  // Metrics provider
  getMetrics() {
    return {
      ...this.metrics,
      uniqueIPsCount: this.metrics.uniqueIPs.size,
      uniqueUsersCount: this.metrics.uniqueUsers.size
    }
  }

  // Cleanup method for graceful shutdown
  async cleanup() {
    try {
      if (this._intervals && this._intervals.length) {
        for (const id of this._intervals) clearInterval(id)
        this._intervals = []
      }
      this.authAttempts.flushAll()
      this.ipRateLimit.flushAll()
      this.userRateLimit.flushAll()
      this.credentialsCache.flushAll()
      
      this.logger.info(`${this.constructor.name} cleanup completed`)
    } catch (error) {
      this.logger.error(`${this.constructor.name} cleanup failed:`, error)
    }
  }
}

module.exports = { BasicAuthMiddleware }
