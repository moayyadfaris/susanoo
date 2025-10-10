const EnterpriseBaseDAO = require('../../core/lib/EnterpriseBaseDAO')
const EnterpriseBaseModel = require('../../core/lib/EnterpriseBaseModel')
const EnterpriseEncryption = require('../../core/lib/EnterpriseEncryption')
const EnterpriseCacheService = require('../../core/lib/EnterpriseCacheService')
const logger = require('../../util/logger')

/**
 * EnterpriseUserDAO - Enhanced User DAO with enterprise features
 * 
 * Features:
 * - Field-level encryption for PII
 * - Multi-level caching
 * - Audit trails and soft deletes
 * - GDPR compliance utilities
 * - Performance optimization
 * - Advanced validation
 * - Query monitoring
 * 
 * @extends EnterpriseBaseDAO
 * @version 1.0.0
 */
class EnterpriseUserDAO extends EnterpriseBaseDAO {
  static get tableName() {
    return 'users'
  }

  static get jsonAttributes() {
    return ['metadata', 'deviceFingerprint']
  }

  /**
   * PII fields that need encryption
   */
  static get piiFields() {
    return ['email', 'newEmail', 'mobileNumber', 'newMobileNumber', 'name']
  }

  /**
   * Fields to include in search hash for encrypted fields
   */
  static get searchableFields() {
    return ['email', 'mobileNumber']
  }

  static get relationMappings() {
    return {
      stories: {
        relation: EnterpriseBaseDAO.HasManyRelation,
        modelClass: `${__dirname}/EnterpriseStoryDAO`,
        join: {
          from: 'users.id',
          to: 'stories.userId'
        },
        filter: (query) => query.whereNull('stories.deletedAt')
      },
      
      interests: {
        relation: EnterpriseBaseDAO.ManyToManyRelation,
        modelClass: `${__dirname}/InterestDAO`,
        join: {
          from: 'users.id',
          through: {
            from: 'user_interests.userId',
            to: 'user_interests.interestId'
          },
          to: 'interests.id'
        },
        filter: (query) => query.whereNull('interests.deletedAt')
      },
      
      country: {
        relation: EnterpriseBaseDAO.BelongsToOneRelation,
        filter: (query) => query.select('id', 'name'),
        modelClass: `${__dirname}/CountryDAO`,
        join: {
          from: 'users.countryId',
          to: 'countries.id'
        }
      },
      
      profileImage: {
        relation: EnterpriseBaseDAO.BelongsToOneRelation,
        modelClass: `${__dirname}/EnterpriseAttachmentDAO`,
        join: {
          from: 'users.profileImageId',
          to: 'attachments.id'
        },
        filter: (query) => query.whereNull('attachments.deletedAt')
      },
      
      sessions: {
        relation: EnterpriseBaseDAO.HasManyRelation,
        modelClass: `${__dirname}/EnterpriseSessionDAO`,
        join: {
          from: 'users.id',
          to: 'sessions.userId'
        },
        filter: (query) => query.whereNull('sessions.deletedAt').where('sessions.isActive', true)
      }
    }
  }

  /**
   * Initialize enterprise services
   */
  static initialize(config = {}) {
    this.encryption = new EnterpriseEncryption(config.encryption)
    this.cacheService = new EnterpriseCacheService(config.cache)
    
    // Register cache warming strategies
    this._registerCacheWarmingStrategies()
    
    logger.info('EnterpriseUserDAO initialized with enterprise features')
  }

  /**
   * Enhanced JSON formatting with decryption
   */
  $formatJson(json) {
    json = super.$formatJson(json)
    
    // Decrypt PII fields for display
    if (this.constructor.encryption) {
      json = this.constructor.encryption.decryptPIIFields(json, this.constructor.piiFields)
    }
    
    // Remove sensitive audit fields unless explicitly requested
    if (!this.constructor.includeAuditFields) {
      delete json.passwordHash
      delete json.emailConfirmToken
      delete json.resetPasswordToken
      delete json.resetPasswordCode
      delete json.resetPasswordOTP
      delete json.verifyCode
      delete json.updateToken
      delete json.newEmail
      delete json.newMobileNumber
      delete json.createdBy
      delete json.updatedBy
      delete json.deletedBy
      delete json.version
    }
    
    // Add computed fields
    json.isProfileComplete = this._isProfileComplete(json)
    json.accountAge = this._calculateAccountAge(json.createdAt)
    
    return json
  }

  /**
   * Enhanced creation with encryption and caching
   */
  static async create(data, userId = null, options = {}) {
    try {
      // Validate data
      const validationResult = await EnterpriseBaseModel.validateWithContext(data, {
        operation: 'create',
        userId
      })
      
      if (!validationResult.isValid) {
        throw new Error(`Validation failed: ${JSON.stringify(validationResult.errors)}`)
      }
      
      // Use sanitized and normalized data
      const processedData = { ...validationResult.normalizedData }
      
      // Encrypt PII fields
      if (this.encryption) {
        processedData = this.encryption.encryptPIIFields(processedData, this.piiFields)
        
        // Create search hashes for encrypted fields
        for (const field of this.searchableFields) {
          if (processedData[field]) {
            processedData[`${field}_hash`] = this.encryption.createSearchableHash(processedData[field])
          }
        }
      }
      
      // Generate referral code if not provided
      if (!processedData.referralCode) {
        processedData.referralCode = this._generateReferralCode()
      }
      
      // Add audit context
      const auditContext = {
        user: { id: userId },
        ip: options.ip,
        userAgent: options.userAgent
      }
      
      // Create user
      const user = await this.query()
        .context(auditContext)
        .insertGraph(processedData, {
          unrelate: true,
          allowRefs: true
        })
      
      // Cache the new user
      if (this.cacheService) {
        await this._cacheUser(user)
      }
      
      // Log user creation
      logger.info('User created successfully', {
        userId: user.id,
        email: user.email ? '***@' + user.email.split('@')[1] : null,
        auditContext
      })
      
      return user
      
    } catch (error) {
      logger.error('User creation failed', {
        error: error.message,
        data: this._sanitizeLogData(data)
      })
      throw error
    }
  }

  /**
   * Enhanced user retrieval with caching
   */
  static async getByIdWithCache(id, options = {}) {
    const cacheKey = `user:${id}`
    
    if (this.cacheService && !options.skipCache) {
      const cachedUser = await this.cacheService.get(cacheKey, { namespace: 'users' })
      if (cachedUser) {
        logger.debug('User retrieved from cache', { userId: id })
        return cachedUser
      }
    }
    
    try {
      const query = this.query().where({ id }).first()
      
      if (options.withRelations) {
        query.withGraphFetched(options.withRelations)
      }
      
      const user = await query
      
      if (!user) {
        throw this.errorEmptyResponse()
      }
      
      // Cache the user
      if (this.cacheService && user) {
        await this._cacheUser(user)
      }
      
      return user
      
    } catch (error) {
      logger.error('User retrieval failed', { userId: id, error: error.message })
      throw error
    }
  }

  /**
   * Enhanced email lookup with encrypted field search
   */
  static async getByEmail(email, throwError = true) {
    if (!email) {
      if (throwError) throw this.errorEmptyResponse()
      return null
    }
    
    const cacheKey = `user:email:${email}`
    
    if (this.cacheService) {
      const cachedUser = await this.cacheService.get(cacheKey, { namespace: 'users' })
      if (cachedUser) {
        return cachedUser
      }
    }
    
    try {
      let query
      
      // If encryption is enabled, search by hash
      if (this.encryption) {
        const emailHash = this.encryption.createSearchableHash(email)
        query = this.query().where({ email_hash: emailHash }).first()
      } else {
        query = this.query().where({ email }).first()
      }
      
      const user = await query
      
      if (throwError && !user) {
        throw this.errorEmptyResponse()
      }
      
      // Cache the user
      if (this.cacheService && user) {
        await this._cacheUser(user)
        await this.cacheService.set(cacheKey, user, 3600, { namespace: 'users' })
      }
      
      return user
      
    } catch (error) {
      logger.error('User email lookup failed', {
        email: email ? '***@' + email.split('@')[1] : null,
        error: error.message
      })
      if (throwError) throw error
      return null
    }
  }

  /**
   * Enhanced mobile number lookup
   */
  static async getByMobileNumber(mobileNumber, throwError = true) {
    if (!mobileNumber) {
      if (throwError) throw this.errorEmptyResponse()
      return null
    }
    
    const cacheKey = `user:mobile:${mobileNumber}`
    
    if (this.cacheService) {
      const cachedUser = await this.cacheService.get(cacheKey, { namespace: 'users' })
      if (cachedUser) {
        return cachedUser
      }
    }
    
    try {
      let query
      
      // If encryption is enabled, search by hash
      if (this.encryption) {
        const mobileHash = this.encryption.createSearchableHash(mobileNumber)
        query = this.query().where({ mobileNumber_hash: mobileHash }).first()
      } else {
        query = this.query().where({ mobileNumber }).first()
      }
      
      const user = await query
      
      if (throwError && !user) {
        throw this.errorEmptyResponse()
      }
      
      // Cache the user
      if (this.cacheService && user) {
        await this._cacheUser(user)
        await this.cacheService.set(cacheKey, user, 3600, { namespace: 'users' })
      }
      
      return user
      
    } catch (error) {
      logger.error('User mobile lookup failed', {
        mobile: mobileNumber ? '***' + mobileNumber.slice(-4) : null,
        error: error.message
      })
      if (throwError) throw error
      return null
    }
  }

  /**
   * Enhanced update with encryption and cache invalidation
   */
  static async updateWithEncryption(id, data, userId = null, options = {}) {
    try {
      // Get current user for optimistic locking
      const currentUser = await this.findByIdWithAudit(id)
      if (!currentUser) {
        throw this.errorEmptyResponse()
      }
      
      // Validate update data
      const validationResult = await EnterpriseBaseModel.validateWithContext(data, {
        operation: 'update',
        userId,
        currentData: currentUser
      })
      
      if (!validationResult.isValid) {
        throw new Error(`Validation failed: ${JSON.stringify(validationResult.errors)}`)
      }
      
      const processedData = { ...validationResult.normalizedData }
      
      // Encrypt PII fields if changed
      if (this.encryption) {
        for (const field of this.piiFields) {
          if (processedData[field] && processedData[field] !== currentUser[field]) {
            processedData[field] = this.encryption.encrypt(processedData[field])
            
            // Update search hash if it's a searchable field
            if (this.searchableFields.includes(field)) {
              processedData[`${field}_hash`] = this.encryption.createSearchableHash(processedData[field])
            }
          }
        }
      }
      
      // Update with audit context and optimistic locking
      const auditContext = {
        user: { id: userId },
        ip: options.ip,
        userAgent: options.userAgent
      }
      
      const updatedRows = await this.updateWithAudit(
        id,
        processedData,
        userId,
        currentUser.version,
        options.trx
      )
      
      if (updatedRows === 0) {
        throw new Error('Update failed - record may have been modified by another user')
      }
      
      // Invalidate caches
      if (this.cacheService) {
        await this._invalidateUserCaches(id, currentUser)
      }
      
      // Get updated user
      const updatedUser = await this.getByIdWithCache(id, { skipCache: true })
      
      logger.info('User updated successfully', {
        userId: id,
        changedFields: Object.keys(processedData),
        updatedBy: userId
      })
      
      return updatedUser
      
    } catch (error) {
      logger.error('User update failed', {
        userId: id,
        error: error.message,
        data: this._sanitizeLogData(data)
      })
      throw error
    }
  }

  /**
   * GDPR compliance - anonymize user data
   */
  static async anonymizeUserData(id, userId = null, options = {}) {
    try {
      const user = await this.findByIdWithAudit(id)
      if (!user) {
        throw this.errorEmptyResponse()
      }
      
      // Create anonymized data
      let anonymizedData = {}
      
      if (this.encryption) {
        anonymizedData = this.encryption.anonymizePIIFields(user, this.piiFields)
      } else {
        anonymizedData = EnterpriseBaseModel.anonymizePIIData(user)
      }
      
      // Add GDPR metadata
      anonymizedData.metadata = {
        ...user.metadata,
        gdpr_anonymized: true,
        anonymized_at: new Date().toISOString(),
        anonymized_by: userId,
        original_user_id: id
      }
      
      // Update user with anonymized data
      const result = await this.updateWithEncryption(id, anonymizedData, userId, options)
      
      // Invalidate all user caches
      if (this.cacheService) {
        await this._invalidateUserCaches(id, user)
      }
      
      logger.info('User data anonymized for GDPR compliance', {
        userId: id,
        anonymizedBy: userId,
        timestamp: anonymizedData.metadata.anonymized_at
      })
      
      return result
      
    } catch (error) {
      logger.error('User anonymization failed', {
        userId: id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Get user statistics with caching
   */
  static async getUserStats(id) {
    const cacheKey = `user:stats:${id}`
    
    if (this.cacheService) {
      const cachedStats = await this.cacheService.get(cacheKey, { namespace: 'user_stats' })
      if (cachedStats) {
        return cachedStats
      }
    }
    
    try {
      const stats = await this.query()
        .select(
          this.query().raw('COUNT(stories.id) as story_count'),
          this.query().raw('COUNT(DISTINCT story_tags.tagId) as unique_tags'),
          this.query().raw('AVG(CASE WHEN stories.status = \'PUBLISHED\' THEN 1 ELSE 0 END) * 100 as publish_rate')
        )
        .leftJoin('stories', 'users.id', 'stories.userId')
        .leftJoin('story_tags', 'stories.id', 'story_tags.storyId')
        .where('users.id', id)
        .whereNull('users.deletedAt')
        .whereNull('stories.deletedAt')
        .groupBy('users.id')
        .first()
      
      // Cache stats for 30 minutes
      if (this.cacheService && stats) {
        await this.cacheService.set(cacheKey, stats, 1800, { namespace: 'user_stats' })
      }
      
      return stats || {
        story_count: 0,
        unique_tags: 0,
        publish_rate: 0
      }
      
    } catch (error) {
      logger.error('Failed to get user stats', { userId: id, error: error.message })
      throw error
    }
  }

  /**
   * Cache user data
   */
  static async _cacheUser(user) {
    if (!this.cacheService || !user) return
    
    const cachePromises = [
      this.cacheService.set(`user:${user.id}`, user, 3600, { namespace: 'users' })
    ]
    
    if (user.email) {
      cachePromises.push(
        this.cacheService.set(`user:email:${user.email}`, user, 3600, { namespace: 'users' })
      )
    }
    
    if (user.mobileNumber) {
      cachePromises.push(
        this.cacheService.set(`user:mobile:${user.mobileNumber}`, user, 3600, { namespace: 'users' })
      )
    }
    
    await Promise.allSettled(cachePromises)
  }

  /**
   * Invalidate user caches
   */
  static async _invalidateUserCaches(id, oldUserData = null) {
    if (!this.cacheService) return
    
    const invalidationPromises = [
      this.cacheService.delete(`user:${id}`, { namespace: 'users' }),
      this.cacheService.delete(`user:stats:${id}`, { namespace: 'user_stats' })
    ]
    
    if (oldUserData?.email) {
      invalidationPromises.push(
        this.cacheService.delete(`user:email:${oldUserData.email}`, { namespace: 'users' })
      )
    }
    
    if (oldUserData?.mobileNumber) {
      invalidationPromises.push(
        this.cacheService.delete(`user:mobile:${oldUserData.mobileNumber}`, { namespace: 'users' })
      )
    }
    
    await Promise.allSettled(invalidationPromises)
  }

  /**
   * Generate unique referral code
   */
  static _generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  /**
   * Check if profile is complete
   */
  static _isProfileComplete(userData) {
    const requiredFields = ['name', 'email', 'mobileNumber', 'countryId']
    return requiredFields.every(field => userData[field] && userData[field] !== '')
  }

  /**
   * Calculate account age in days
   */
  static _calculateAccountAge(createdAt) {
    if (!createdAt) return 0
    const now = new Date()
    const created = new Date(createdAt)
    return Math.floor((now - created) / (1000 * 60 * 60 * 24))
  }

  /**
   * Sanitize data for logging
   */
  static _sanitizeLogData(data) {
    const sanitized = { ...data }
    const sensitiveFields = ['passwordHash', 'email', 'mobileNumber', 'name']
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]'
      }
    }
    
    return sanitized
  }

  /**
   * Register cache warming strategies
   */
  static _registerCacheWarmingStrategies() {
    if (!this.cacheService) return
    
    // Popular users strategy
    this.cacheService.registerWarmingStrategy('popular_users', async (cache) => {
      const popularUsers = await this.query()
        .select('users.*')
        .leftJoin('stories', 'users.id', 'stories.userId')
        .whereNull('users.deletedAt')
        .where('users.isActive', true)
        .groupBy('users.id')
        .orderByRaw('COUNT(stories.id) DESC')
        .limit(100)
      
      for (const user of popularUsers) {
        await this._cacheUser(user)
      }
      
      logger.debug('Popular users cache warmed', { count: popularUsers.length })
    })
    
    // Recent active users strategy
    this.cacheService.registerWarmingStrategy('recent_active_users', async (cache) => {
      const recentUsers = await this.query()
        .whereNull('deletedAt')
        .where('isActive', true)
        .where('updatedAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .orderBy('updatedAt', 'desc')
        .limit(50)
      
      for (const user of recentUsers) {
        await this._cacheUser(user)
      }
      
      logger.debug('Recent active users cache warmed', { count: recentUsers.length })
    })
  }
}

module.exports = EnterpriseUserDAO