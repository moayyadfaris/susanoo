const { BaseMiddleware } = require('backend-core')
const logger = require('../util/logger')
const UserDAO = require('database/dao/UserDAO')
const NodeCache = require('node-cache')
const { performance } = require('perf_hooks')
const crypto = require('crypto')

class CheckLanguageMiddleware extends BaseMiddleware {
  constructor(options = {}) {
    super(options)
    
    // Language validation cache - 15 minutes TTL
    this.languageCache = new NodeCache({ 
      stdTTL: 900,
      checkperiod: 60,
      maxKeys: 10000,
      deleteOnExpire: true,
      useClones: false
    })
    
    // User language preferences cache - 30 minutes TTL
    this.userLanguageCache = new NodeCache({
      stdTTL: 1800,
      checkperiod: 120,
      maxKeys: 50000,
      deleteOnExpire: true,
      useClones: false
    })
    
    // Rate limiting for language updates per user
    this.updateRateLimit = new NodeCache({
      stdTTL: 300, // 5 minutes
      checkperiod: 60,
      maxKeys: 10000,
      deleteOnExpire: true
    })
    
    // Supported languages configuration
    this.supportedLanguages = new Set([
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
      'ar', 'hi', 'bn', 'ur', 'fa', 'tr', 'pl', 'nl', 'sv', 'da',
      'no', 'fi', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sr', 'sl',
      'et', 'lv', 'lt', 'el', 'he', 'th', 'vi', 'id', 'ms', 'tl'
    ])
    
    // Language region mappings
    this.languageRegions = new Map([
      ['en-US', 'en'], ['en-GB', 'en'], ['en-CA', 'en'], ['en-AU', 'en'],
      ['es-ES', 'es'], ['es-MX', 'es'], ['es-AR', 'es'], ['es-CO', 'es'],
      ['fr-FR', 'fr'], ['fr-CA', 'fr'], ['fr-BE', 'fr'], ['fr-CH', 'fr'],
      ['de-DE', 'de'], ['de-AT', 'de'], ['de-CH', 'de'],
      ['it-IT', 'it'], ['it-CH', 'it'],
      ['pt-BR', 'pt'], ['pt-PT', 'pt'],
      ['zh-CN', 'zh'], ['zh-TW', 'zh'], ['zh-HK', 'zh'],
      ['ar-SA', 'ar'], ['ar-EG', 'ar'], ['ar-AE', 'ar']
    ])
    
    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      languageValidations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      languageUpdates: 0,
      securityViolations: 0,
      averageProcessingTime: 0,
      errors: 0
    }
    
    // Security patterns
    this.securityPatterns = [
      /[<>"'&]/g, // HTML/XML injection
      /(?:union|select|insert|update|delete|drop|create|alter|exec|script)/gi, // SQL keywords
      /javascript:|data:|vbscript:/gi, // Script protocols
      /on\w+\s*=/gi // Event handlers
    ]
  }

  async init() {
    try {
      // Warm up caches with default configurations
      await this.warmupCaches()
      
      // Start performance monitoring
      this.startMetricsCollection()
      
      logger.info(`${this.constructor.name} initialization completed successfully`)
    } catch (error) {
      logger.error(`${this.constructor.name} initialization failed:`, error)
      throw error
    }
  }

  async warmupCaches() {
    try {
      // Pre-populate language validation cache with supported languages
      for (const lang of this.supportedLanguages) {
        this.languageCache.set(`valid:${lang}`, true)
      }
      
      // Pre-populate region mappings
      for (const [region, lang] of this.languageRegions) {
        this.languageCache.set(`region:${region}`, lang)
      }
      
      logger.debug('Language caches warmed up successfully')
    } catch (error) {
      logger.error('Failed to warm up language caches:', error)
      throw error
    }
  }

  startMetricsCollection() {
    // Log metrics every 5 minutes
    setInterval(() => {
      this.logMetrics()
    }, 300000)
  }

  logMetrics() {
    const cacheStats = {
      languageCache: this.languageCache.getStats(),
      userLanguageCache: this.userLanguageCache.getStats(),
      updateRateLimit: this.updateRateLimit.getStats()
    }
    
    logger.info('CheckLanguageMiddleware Metrics:', {
      performance: this.metrics,
      cacheStats
    })
  }

  validateLanguageCode(language) {
    if (!language || typeof language !== 'string') {
      return { valid: false, reason: 'Invalid language format' }
    }
    
    // Security validation
    for (const pattern of this.securityPatterns) {
      if (pattern.test(language)) {
        this.metrics.securityViolations++
        return { valid: false, reason: 'Security violation detected' }
      }
    }
    
    // Length validation
    if (language.length > 10) {
      return { valid: false, reason: 'Language code too long' }
    }
    
    // Check cache first
    const cacheKey = `valid:${language.toLowerCase()}`
    const cached = this.languageCache.get(cacheKey)
    if (cached !== undefined) {
      this.metrics.cacheHits++
      return { valid: cached, cached: true }
    }
    
    this.metrics.cacheMisses++
    
    // Normalize language code
    const normalizedLang = this.normalizeLanguageCode(language)
    
    // Check if supported
    const isValid = this.supportedLanguages.has(normalizedLang)
    
    // Cache result
    this.languageCache.set(cacheKey, isValid)
    
    return { 
      valid: isValid, 
      normalized: normalizedLang,
      original: language
    }
  }

  normalizeLanguageCode(language) {
    const cleaned = language.toLowerCase().trim()
    
    // Handle region codes (e.g., en-US -> en)
    if (this.languageRegions.has(cleaned)) {
      return this.languageRegions.get(cleaned)
    }
    
    // Extract base language from region code
    const baseLang = cleaned.split('-')[0]
    return baseLang
  }

  detectLanguageFromAcceptHeader(acceptLanguage) {
    if (!acceptLanguage) return null
    
    try {
      // Parse Accept-Language header
      const languages = acceptLanguage
        .split(',')
        .map(lang => {
          const parts = lang.trim().split(';')
          const code = parts[0]
          const quality = parts[1] ? parseFloat(parts[1].split('=')[1]) : 1
          return { code, quality }
        })
        .sort((a, b) => b.quality - a.quality)
      
      // Find first supported language
      for (const { code } of languages) {
        const validation = this.validateLanguageCode(code)
        if (validation.valid) {
          return validation.normalized || code
        }
      }
      
      return null
    } catch (error) {
      logger.warn('Failed to parse Accept-Language header:', acceptLanguage, error)
      return null
    }
  }

  async getUserLanguagePreference(userId) {
    const cacheKey = `user:${userId}`
    const cached = this.userLanguageCache.get(cacheKey)
    
    if (cached !== undefined) {
      this.metrics.cacheHits++
      return cached
    }
    
    try {
      this.metrics.cacheMisses++
      // Use BaseDAO helper that exists in our stack
      const user = await UserDAO.baseGetById(userId, { includeHidden: true, throwOnNotFound: false })
      const preference = user?.preferredLanguage || user?.language || null
      
      // Cache for 30 minutes
      this.userLanguageCache.set(cacheKey, preference)
      
      return preference
    } catch (error) {
      logger.error(`Failed to get user language preference for user ${userId}:`, error)
      this.metrics.errors++
      return null
    }
  }

  async updateUserLanguagePreference(userId, language, requestId) {
    const rateLimitKey = `update:${userId}`
    const lastUpdate = this.updateRateLimit.get(rateLimitKey)
    
    if (lastUpdate) {
      logger.warn('Rate limit exceeded for language update', {
        userId,
        language,
        requestId,
        lastUpdate
      })
      return false
    }
    
    try {
      // Set rate limit
      this.updateRateLimit.set(rateLimitKey, Date.now())
      
      await UserDAO.baseUpdate(userId, { preferredLanguage: language })
      
      // Update cache
      this.userLanguageCache.set(`user:${userId}`, language)
      
      this.metrics.languageUpdates++
      
      logger.info('User language preference updated', {
        userId,
        language,
        requestId
      })
      
      return true
    } catch (error) {
      logger.error('Failed to update user language preference', {
        userId,
        language,
        requestId,
        error: error.message
      })
      this.metrics.errors++
      return false
    }
  }

  generateSecurityHash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
  }

  handler() {
    return async (req, res, next) => {
      const startTime = performance.now()
      const requestId = req.requestId || crypto.randomUUID()
      
      try {
        this.metrics.totalRequests++
        
        // Extract language from various sources
        const headerLanguage = req.headers['language'] || req.headers['accept-language']
        const queryLanguage = req.query.lang || req.query.language
        const bodyLanguage = req.body?.language
        
        // Priority: query > header > body > auto-detect
        const requestedLanguage = queryLanguage || headerLanguage || bodyLanguage
        
        let resolvedLanguage = null
        let languageSource = 'default'
        
        // Validate requested language
        if (requestedLanguage) {
          const validation = this.validateLanguageCode(requestedLanguage)
          
          if (validation.valid) {
            resolvedLanguage = validation.normalized || requestedLanguage
            languageSource = queryLanguage ? 'query' : (headerLanguage ? 'header' : 'body')
            this.metrics.languageValidations++
          } else {
            logger.warn('Invalid language code detected', {
              language: requestedLanguage,
              reason: validation.reason,
              requestId,
              userAgent: req.headers['user-agent'],
              ip: req.ip
            })
            
            // Try to detect from Accept-Language header
            resolvedLanguage = this.detectLanguageFromAcceptHeader(req.headers['accept-language'])
            languageSource = 'auto-detected'
          }
        }
        
        // Fallback to auto-detection
        if (!resolvedLanguage) {
          resolvedLanguage = this.detectLanguageFromAcceptHeader(req.headers['accept-language']) || 'en'
          languageSource = 'auto-detected'
        }
        
        // Set resolved language in request
        req.language = resolvedLanguage
        req.languageSource = languageSource
        
        // Handle user language preference updates
        if (req.currentUser?.id) {
          try {
            const currentUserLanguage = await this.getUserLanguagePreference(req.currentUser.id)
            
            if (currentUserLanguage !== resolvedLanguage && resolvedLanguage !== 'en') {
              // Update user preference asynchronously
              setImmediate(async () => {
                await this.updateUserLanguagePreference(
                  req.currentUser.id,
                  resolvedLanguage,
                  requestId
                )
              })
            }
            
            // Add user's current language preference to request
            req.userLanguagePreference = currentUserLanguage
          } catch (error) {
            logger.error('Failed to handle user language preference', {
              userId: req.currentUser.id,
              requestId,
              error: error.message
            })
          }
        }
        
        // Add language metadata to response headers
        res.set({
          'X-Language': resolvedLanguage,
          'X-Language-Source': languageSource,
          'X-Supported-Languages': Array.from(this.supportedLanguages).join(',')
        })
        
        // Security logging for suspicious language requests
        if (requestedLanguage && !this.validateLanguageCode(requestedLanguage).valid) {
          const securityHash = this.generateSecurityHash({
            language: requestedLanguage,
            userAgent: req.headers['user-agent'],
            ip: req.ip
          })
          
          logger.warn('Suspicious language request detected', {
            requestedLanguage,
            resolvedLanguage,
            securityHash,
            requestId,
            userAgent: req.headers['user-agent'],
            ip: req.ip
          })
        }
        
        // Performance tracking
        const processingTime = performance.now() - startTime
        this.metrics.averageProcessingTime = 
          (this.metrics.averageProcessingTime + processingTime) / 2
        
        logger.debug('Language processing completed', {
          requestedLanguage,
          resolvedLanguage,
          languageSource,
          processingTime: `${processingTime.toFixed(2)}ms`,
          requestId
        })
        
        next()
      } catch (error) {
        this.metrics.errors++
        const processingTime = performance.now() - startTime
        
        logger.error('CheckLanguageMiddleware error', {
          error: error.message,
          stack: error.stack,
          processingTime: `${processingTime.toFixed(2)}ms`,
          requestId,
          userAgent: req.headers['user-agent'],
          ip: req.ip
        })
        
        // Set default language on error
        req.language = 'en'
        req.languageSource = 'error-fallback'
        
        next(error)
      }
    }
  }

  // Cleanup method for graceful shutdown
  async cleanup() {
    try {
      this.languageCache.flushAll()
      this.userLanguageCache.flushAll()
      this.updateRateLimit.flushAll()
      
      logger.info(`${this.constructor.name} cleanup completed`)
    } catch (error) {
      logger.error(`${this.constructor.name} cleanup failed:`, error)
    }
  }

  // Health check method
  getHealthStatus() {
    return {
      status: 'healthy',
      metrics: this.metrics,
      cacheStats: {
        languageCache: this.languageCache.getStats(),
        userLanguageCache: this.userLanguageCache.getStats(),
        updateRateLimit: this.updateRateLimit.getStats()
      },
      supportedLanguagesCount: this.supportedLanguages.size,
      uptime: process.uptime()
    }
  }
}

module.exports = { CheckLanguageMiddleware }
