const { assert, BaseDAO } = require('backend-core')
const UserModel = require('../../models/UserModel')

class UserDAO extends BaseDAO {
  static get tableName () {
    return 'users'
  }

  static get jsonAttributes () {
    return ['refreshTokensMap']
  }

  static get relationMappings () {
    return {
      stories: {
        relation: BaseDAO.HasManyRelation,
        modelClass: `${__dirname}/StoryDAO`,
        join: {
          from: 'users.id',
          to: 'stories.userId'
        }
      },
      interests: {
        relation: BaseDAO.ManyToManyRelation,
        modelClass: `${__dirname}/InterestDAO`,
        join: {
          from: 'users.id',
          through: {
            // persons_movies is the join table.
            from: 'user_interests.userId',
            to: 'user_interests.interestId'
          },
          to: 'interests.id'
        }
      },
      country: {
        relation: BaseDAO.BelongsToOneRelation,
        filter: query => query.select('id', 'name'),
        modelClass: `${__dirname}/CountryDAO`,
        join: {
          from: 'users.countryId',
          to: 'countries.id'
        }
      },
      profileImage: {
        relation: BaseDAO.BelongsToOneRelation,
        modelClass: `${__dirname}/AttachmentDAO`,
        join: {
          from: 'users.profileImageId',
          to: 'attachments.id'
        }
      }
    }
  }

  /**
   * ------------------------------
   * @HOOKS
   * ------------------------------
   */
  $formatJson (json) {
    json = super.$formatJson(json)

    // delete sensitive data from all queries
    delete json.passwordHash
    delete json.emailConfirmToken
    delete json.resetPasswordToken
    delete json.newEmail
    delete json.resetPasswordCode
    delete json.resetPasswordOTP
    delete json.verifyCode
    delete json.updatedAt
    // delete json.role
    delete json.isVerified
    delete json.isConfirmedRegistration
    delete json.createdAt
    delete json.profileImageId
    delete json.newMobileNumber
    // delete json.updateToken
    // delete json.email

    return json
  }

  /**
   * ------------------------------
   * @METHODS
   * ------------------------------
   */

  static create (data) {
    assert.object(data, { required: true })
    assert.string(data.passwordHash, { notEmpty: true })

    return this.query().insert(data)
  };

  static async getByEmail (email, throwError = true) {
    assert.validate(email, UserModel.schema.email, { required: true })
    const data = await this.query().where({ email }).first()
    if (throwError) {
      if (!data) throw this.errorEmptyResponse()
    }
    return data
  }

  static async getByMobileNumber (mobileNumber, throwError) {
    assert.validate(mobileNumber, UserModel.schema.mobileNumber, { required: true })

    const data = await this.query().where({ mobileNumber }).first()
    if (throwError) {
      if (!data) throw this.errorEmptyResponse()
    }
    return data
  }

  static async getByEmailOrMobileNumber (emailOrMobileNumber, throwError = true) {
    if (emailOrMobileNumber.includes('@')) {
      return await this.getByEmail(emailOrMobileNumber, throwError)
    } else {
      return await this.getByMobileNumber(emailOrMobileNumber, throwError)
    }
  }

  static async getUserById (id, eagerList = null) {
    assert.validate(id, UserModel.schema.id, { required: true })

    const query = this.query().where({ id }).first()

    if (eagerList) {
      query.withGraphFetched(eagerList)
    }
    const data = await query.first()
    if (!data) throw this.errorEmptyResponse()
    // delete sensitive data from current user
    delete data.passwordHash
    delete data.updateToken
    delete data.resetPasswordToken
    delete data.resetPasswordCode
    delete data.resetPasswordOTP
    delete data.verifyCode
    delete data.newEmail
    delete data.createdAt
    delete data.updatedAt
    delete data.isConfirmedRegistration
    // delete data.mobileCountryId
    return data
  }

  /**
   * @description check email availability in DB.
   * @param email
   * @returns {Promise<boolean>}
   */
  static async isEmailExist (email) {
    assert.validate(email, UserModel.schema.email, { required: true })

    const data = await this.query().where({ email }).first()
    return Boolean(data)
  }

  /**
   * @description check phone number availability in DB.
   * @param email
   * @returns {Promise<boolean>}
   */
  static async isMobileNumberExist (mobileNumber) {
    assert.validate(mobileNumber, UserModel.schema.mobileNumber, { required: true })

    const data = await this.query().where({ mobileNumber }).first()
    return Boolean(data)
  }

  static async checkEmailAvailability (email) {
    assert.validate(email, UserModel.schema.email, { required: true })

    const data = await this.query().where({ email }).first()
    return { available: !data }
  }

  static async getUsers ({ page, limit, filter, orderBy, term, interests, filterIn } = {}, relations, select = []) {
    assert.integer(page, { required: true })
    assert.integer(limit, { required: true })
    assert.object(filter, { required: true })
    assert.integer(filter.userId)
    const query = this.query().where({ ...filter })
    if (term) {
      query.whereRaw('LOWER(users.name) LIKE ?', '%' + term.toLowerCase() + '%')
    }
    if (interests) {
      query.joinRelation('interests')
      query.whereIn('interests.id', interests)
    }
    if (filterIn) {
      Object.keys(filterIn).forEach(function (item) {
        query.whereIn(item, filterIn[item])
      })
    }

    query.withGraphFetched(relations)
    
    // Apply security filtering - don't select sensitive fields
    if (!select || select.length === 0) {
      const sensitiveFields = [
        'passwordHash', 'emailConfirmToken', 'resetPasswordToken', 
        'newEmail', 'resetPasswordCode', 'resetPasswordOTP', 'verifyCode',
        'updateToken'
      ]
      
      const allColumns = ['id', 'name', 'bio', 'role', 'email', 'mobileNumber', 'isVerified', 
        'isActive', 'countryId', 'deviceId', 'preferredLanguage', 
        'isConfirmedRegistration', 'createdAt', 'updatedAt', 'newMobileNumber',
        'profileImageId', 'lastLogoutAt']
      
      const safeColumns = allColumns.filter(col => !sensitiveFields.includes(col))
      query.select(safeColumns)
    } else {
      query.select(select)
    }
    
    query.orderBy(orderBy.field, orderBy.direction).page(page, limit)
    let data = await query
    if (!data.results.length) return this.emptyPageResponse()
    return data
  }

  /**
   * Enhanced user listing with comprehensive filtering and search
   * 
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number (0-based)
   * @param {number} params.limit - Records per page
   * @param {string} params.search - Search term for name, email, username
   * @param {Object} params.filter - Filter conditions
   * @param {Array} params.fields - Fields to select
   * @param {Array} params.include - Relations to include
   * @param {string} params.orderByField - Field to sort by
   * @param {string} params.orderByDirection - Sort direction (asc/desc)
   * @returns {Promise<{results: Array, total: number}>}
   */
  static async getAdvancedList(params = {}) {
    // Build base query without includes for counting
    let countQuery = this.buildAdvancedQuery({ ...params, include: undefined })
    countQuery = countQuery.clearSelect().clearOrder().count('* as total').first()
    
    // Build the full query with includes
    let query = this.buildAdvancedQuery(params)
    
    // Execute both queries in parallel
    const [results, countResult] = await Promise.all([
      query,
      countQuery
    ])

    const total = parseInt(countResult.total) || 0

    return {
      results: results || [],
      total
    }
  }

  /**
   * Build advanced query with filtering, search, sorting, and includes
   */
  static buildAdvancedQuery(params) {
    let query = this.query()

    // Apply search functionality
    if (params.search) {
      query = this.applySearch(query, params.search)
    }

    // Apply filters
    if (params.filter && Object.keys(params.filter).length > 0) {
      query = this.applyAdvancedFilters(query, params.filter)
    }

    // Apply field selection with security filtering
    if (params.fields && params.fields.length > 0) {
      // Filter out sensitive fields
      const sensitiveFields = [
        'passwordHash', 'emailConfirmToken', 'resetPasswordToken', 
        'newEmail', 'resetPasswordCode', 'resetPasswordOTP', 'verifyCode',
        'updateToken'
      ]
      const safeFields = params.fields.filter(field => !sensitiveFields.includes(field))
      // Always include id for relations
      const fieldsToSelect = [...new Set(['id', ...safeFields])]
      query = query.select(fieldsToSelect.map(field => `users.${field}`))
    } else {
      // If no specific fields requested, select all fields except sensitive ones
      const sensitiveFields = [
        'passwordHash', 'emailConfirmToken', 'resetPasswordToken', 
        'newEmail', 'resetPasswordCode', 'resetPasswordOTP', 'verifyCode',
        'updateToken'
      ]
      
      // Get all column names and exclude sensitive ones - based on actual migration
      const allColumns = ['id', 'name', 'bio', 'role', 'email', 'mobileNumber', 'isVerified', 
        'isActive', 'countryId', 'deviceId', 'preferredLanguage', 
        'isConfirmedRegistration', 'createdAt', 'updatedAt', 'newMobileNumber',
        'profileImageId', 'lastLogoutAt']
      
      const safeColumns = allColumns.filter(col => !sensitiveFields.includes(col))
      query = query.select(safeColumns.map(col => `users.${col}`))
    }

    // Apply includes/relations
    if (params.include && params.include.length > 0) {
      query = this.applyIncludes(query, params.include)
    }

    // Apply sorting
    if (params.orderByField && params.orderByDirection) {
      query = query.orderBy(params.orderByField, params.orderByDirection)
    }

    // Apply pagination
    if (params.page !== undefined && params.limit) {
      const offset = params.page * params.limit
      query = query.offset(offset).limit(params.limit)
    }

    return query
  }

  /**
   * Apply search functionality across multiple fields
   */
  static applySearch(query, searchTerm) {
    const searchPattern = `%${searchTerm.toLowerCase()}%`
    
    return query.where(builder => {
      builder
        .whereRaw('LOWER(name) LIKE ?', [searchPattern])
        .orWhereRaw('LOWER(email) LIKE ?', [searchPattern])
    })
  }

  /**
   * Apply advanced filter conditions to the query
   */
  static applyAdvancedFilters(query, filters) {
    Object.entries(filters).forEach(([key, value]) => {
      switch (key) {
        case 'name':
          const nameTerm = `%${value.toLowerCase()}%`
          query = query.whereRaw('LOWER(name) LIKE ?', [nameTerm])
          break
        
        case 'email':
          query = query.whereRaw('LOWER(email) LIKE ?', [`%${value.toLowerCase()}%`])
          break
        
        case 'role':
          query = query.where('role', value)
          break
        
        case 'mobileNumber':
          query = query.whereRaw('LOWER(mobileNumber) LIKE ?', [`%${value.toLowerCase()}%`])
          break
        
        case 'isActive':
        case 'isVerified':
          query = query.where(key, value)
          break
        
        case 'hasProfileImage':
          if (value) {
            query = query.whereNotNull('profileImageId')
          } else {
            query = query.whereNull('profileImageId')
          }
          break
        
        case 'createdAfter':
          query = query.where('createdAt', '>=', value)
          break
        
        case 'createdBefore':
          query = query.where('createdAt', '<=', value)
          break
        
        case 'updatedAfter':
          query = query.where('updatedAt', '>=', value)
          break
        
        case 'updatedBefore':
          query = query.where('updatedAt', '<=', value)
          break
      }
    })

    return query
  }

  /**
   * Apply include relations to the query
   */
  static applyIncludes(query, includes) {
    includes.forEach(include => {
      switch (include) {
        case 'profileImage':
          query = query.withGraphFetched('profileImage')
          break
        
        case 'interests':
          query = query.withGraphFetched('interests')
          break
        
        case 'stories':
          query = query.withGraphFetched('stories')
          break
        
        case 'country':
          query = query.withGraphFetched('country')
          break
      }
    })

    return query
  }

  /**
   * Get current user data with comprehensive related information
   * 
   * @param {string} userId - User ID
   * @param {Object} options - Options for data retrieval
   * @param {Array} options.include - Relations to include
   * @param {string} options.format - Response format
   * @param {boolean} options.includeHidden - Include hidden fields (for current user)
   * @returns {Promise<Object>} User data with related information
   */
  static async getCurrentUserData(userId, options = {}) {
    assert.validate(userId, UserModel.schema.id, { required: true })

    // Get base user data with appropriate field selection
    let userData = await this.getCurrentUserBase(userId, options)
    
    // Always load profile image and any additionally requested relations
    userData = await this.loadCurrentUserRelations(userData, options.include || [])

    return userData
  }

  /**
   * Get base current user data
   */
  static async getCurrentUserBase(userId) {
    const query = this.query().where({ id: userId }).first()

    // For current user, we can show more fields than public listings
    // but still exclude sensitive authentication fields
    const sensitiveFields = [
      'passwordHash', 'emailConfirmToken', 'resetPasswordToken', 
      'newEmail', 'resetPasswordCode', 'resetPasswordOTP', 'verifyCode',
      'updateToken'
    ]
    
    const userColumns = [
      'id', 'name', 'bio', 'role', 'email', 'mobileNumber', 'isVerified', 
      'isActive', 'countryId', 'deviceId', 'preferredLanguage', 
      'isConfirmedRegistration', 'createdAt', 'updatedAt', 'newMobileNumber',
      'profileImageId', 'lastLogoutAt'
    ]
    
    // Select all safe columns for current user
    const safeColumns = userColumns.filter(col => !sensitiveFields.includes(col))
    query.select(safeColumns)

    const userData = await query
    if (!userData) {
      throw this.errorEmptyResponse()
    }

    return userData
  }

  /**
   * Load related data for current user
   */
  static async loadCurrentUserRelations(userData, includes) {
    try {
      const loadPromises = []

      // Always load profile image for current user if they have one
      if (userData.profileImageId) {
        const AttachmentDAO = require('./AttachmentDAO')
        loadPromises.push(
          AttachmentDAO.query()
            .where({ id: userData.profileImageId })
            .first()
            .then(attachment => {
              if (attachment) {
                // Get the formatted attachment with virtual attributes
                userData.profileImage = {
                  id: attachment.id,
                  originalName: attachment.originalName,
                  mimeType: attachment.mimeType,
                  size: attachment.size,
                  url: attachment.fullPath(), // Full URL to the image
                  thumbnails: attachment.thumbnails(), // Available thumbnail sizes
                  streams: attachment.streams(), // Video streams if applicable
                  category: attachment.category,
                  createdAt: attachment.createdAt
                }
              }
            })
            .catch(() => {}) // Ignore errors for related data
        )
      }

      // Load country data
      if (includes.includes('country') && userData.countryId) {
        const CountryDAO = require('./CountryDAO')
        loadPromises.push(
          CountryDAO.query()
            .where({ id: userData.countryId })
            .select(['id', 'name', 'iso', 'phonecode'])
            .first()
            .then(country => {
              if (country) userData.country = country
            })
            .catch(() => {}) // Ignore errors for related data
        )
      }

      // Load user interests
      if (includes.includes('interests')) {
        loadPromises.push(
          this.query()
            .where({ id: userData.id })
            .withGraphFetched('interests')
            .first()
            .then(userWithInterests => {
              userData.interests = userWithInterests?.interests || []
            })
            .catch(() => {
              userData.interests = []
            })
        )
      }

      // Load user stories summary
      if (includes.includes('stories')) {
        const StoryDAO = require('./StoryDAO')
        loadPromises.push(
          Promise.all([
            StoryDAO.query().where({ userId: userData.id }).count('* as total').first(),
            StoryDAO.query()
              .where({ userId: userData.id })
              .orderBy('createdAt', 'desc')
              .limit(5)
              .select(['id', 'title', 'status', 'type', 'createdAt'])
          ]).then(([countResult, recentStories]) => {
            userData.storiesCount = parseInt(countResult.total) || 0
            userData.recentStories = recentStories || []
          }).catch(() => {
            userData.storiesCount = 0
            userData.recentStories = []
          })
        )
      }

      // Load active sessions
      if (includes.includes('sessions')) {
        const SessionDAO = require('./SessionDAO')
        loadPromises.push(
          SessionDAO.query()
            .where({ userId: userData.id })
            .orderBy('createdAt', 'desc')
            .limit(10)
            .select(['id', 'createdAt', 'lastUsedAt', 'deviceInfo', 'ipAddress'])
            .then(sessions => {
              userData.activeSessions = sessions?.map(session => ({
                id: session.id,
                createdAt: session.createdAt,
                lastUsedAt: session.lastUsedAt || session.createdAt,
                deviceInfo: session.deviceInfo,
                ipAddress: session.ipAddress
              })) || []
            })
            .catch(() => {
              userData.activeSessions = []
            })
        )
      }

      // Load user settings
      if (includes.includes('settings')) {
        const SettingsDAO = require('./SettingsDAO')
        loadPromises.push(
          SettingsDAO.query()
            .where({ userId: userData.id })
            .then(settings => {
              userData.settings = settings || {}
            })
            .catch(() => {
              userData.settings = {}
            })
        )
      }

      // Load recent activity summary
      if (includes.includes('recentActivity')) {
        userData.recentActivity = {
          lastLoginAt: new Date().toISOString(),
          recentActions: [],
          activeSessionsCount: 1,
          lastPasswordChange: null,
          lastProfileUpdate: userData.updatedAt
        }
      }

      // Wait for all related data to load
      await Promise.all(loadPromises)

      return userData

    } catch {
      // Don't fail the main request if related data loading fails
      return userData
    }
  }

  /**
   * ===============================
   * ENTERPRISE USER METHODS
   * ===============================
   */

  /**
   * Format user data for API response with privacy controls and caching
   * @param {Object} userData - Raw user data
   * @param {Object} options - Formatting options
   * @returns {Object} Formatted user data
   */
  static async formatUserForAPI(userData, options = {}) {
    const {
      includePrivate = false,
      includeSensitive = false,
      format = 'standard',
      useCache = true
    } = options

    // Check cache first for formatted data
    const cacheKey = `user:formatted:${userData.id}:${format}:${includePrivate}:${includeSensitive}`
    
    if (useCache) {
      try {
        const { RedisClient } = require('../../clients')
        const cached = await RedisClient.get(cacheKey)
        if (cached) return JSON.parse(cached)
      } catch {
        // Continue without cache if Redis fails
      }
    }

    // Format user data directly (moved from UserModel to avoid circular dependency)
    const baseData = {
      id: userData.id,
      name: userData.name,
      bio: userData.bio,
      role: userData.role,
      isActive: userData.isActive,
      preferredLanguage: userData.preferredLanguage
    }

    // Add public fields based on format
    if (format === 'public') {
      const formatted = {
        id: userData.id,
        name: userData.name,
        bio: userData.bio,
        ...(userData.profileImage && { profileImage: userData.profileImage })
      }
      return formatted
    }

    // Add private fields if authorized
    if (includePrivate) {
      baseData.email = userData.email
      baseData.mobileNumber = userData.mobileNumber
      baseData.countryId = userData.countryId
      baseData.isVerified = userData.isVerified
    }

    // Add sensitive fields if authorized
    if (includeSensitive) {
      baseData.createdAt = userData.createdAt
      baseData.lastLogoutAt = userData.lastLogoutAt
      baseData.acceptedTermsAt = userData.acceptedTermsAt
      baseData.acceptedPrivacyAt = userData.acceptedPrivacyAt
    }

    // Add sanitized metadata if requested
    if (userData.metadata) {
      const sanitized = { ...userData.metadata }
      
      // Remove sensitive information
      delete sanitized.registrationIp
      delete sanitized.deviceFingerprint
      delete sanitized.sessionTokens
      
      // Keep only safe metadata
      const safeFields = ['registrationMethod', 'deviceType', 'appVersion', 'registrationDate']
      const filtered = {}
      
      safeFields.forEach(field => {
        if (sanitized[field]) filtered[field] = sanitized[field]
      })
      
      if (Object.keys(filtered).length > 0) {
        baseData.metadata = filtered
      }
    }

    const formatted = baseData

    // Load additional relations if needed
    if (format !== 'public' && userData.id) {
      try {
        const fullUserData = await this.query()
          .findById(userData.id)
          .withGraphFetched('[country, profileImage]')

        if (fullUserData) {
          if (fullUserData.country) formatted.country = fullUserData.country
          if (fullUserData.profileImage) formatted.profileImage = fullUserData.profileImage
        }
      } catch {
        // Continue without relations if loading fails
      }
    }

    // Cache the result for 5 minutes
    if (useCache) {
      try {
        const { RedisClient } = require('../../clients')
        await RedisClient.setex(cacheKey, 300, JSON.stringify(formatted))
      } catch {
        // Continue without caching if Redis fails
      }
    }

    return formatted
  }

  /**
   * Generate comprehensive user analytics with database context
   * @param {string} userId - User ID
   * @param {Object} options - Analytics options
   * @returns {Object} Enhanced analytics summary
   */
  static async generateUserAnalytics(userId, options = {}) {
    const { includeActivity = true, includeEngagement = true, useCache = true } = options
    
    // Check cache first
    const cacheKey = `user:analytics:${userId}:${includeActivity}:${includeEngagement}`
    
    if (useCache) {
      try {
        const { RedisClient } = require('../../clients')
        const cached = await RedisClient.get(cacheKey)
        if (cached) return JSON.parse(cached)
      } catch {
        // Continue without cache
      }
    }

    // Get user data with relations
    const userData = await this.query()
      .findById(userId)
      .withGraphFetched('[country, interests, stories]')

    if (!userData) {
      throw this.errorEmptyResponse()
    }

    // Calculate base analytics directly (moved from UserModel)
    const registrationDate = new Date(userData.createdAt)
    const daysSinceRegistration = Math.floor((Date.now() - registrationDate.getTime()) / (1000 * 60 * 60 * 24))
    
    // Calculate profile completeness
    const UserModel = require('../../models/UserModel')
    const profileMetrics = UserModel.calculateProfileCompleteness(userData)
    const securityMetrics = UserModel.assessAccountSecurity(userData)
    const engagementLevel = UserModel.calculateEngagementLevel(userData)

    const baseAnalytics = {
      accountAge: {
        days: daysSinceRegistration,
        months: Math.floor(daysSinceRegistration / 30),
        isNewUser: daysSinceRegistration < 7
      },
      profileMetrics,
      securityMetrics,
      engagementLevel,
      summary: {
        status: userData.isActive ? 'active' : 'inactive',
        verified: userData.isVerified,
        compliant: userData.acceptedTermsAt && userData.acceptedPrivacyAt
      }
    }

    // Add database-driven metrics
    const enhancedAnalytics = { ...baseAnalytics }

    if (includeActivity) {
      // Add activity metrics from database
      enhancedAnalytics.activityMetrics = {
        storiesCount: userData.stories ? userData.stories.length : 0,
        interestsCount: userData.interests ? userData.interests.length : 0,
        lastLoginDate: userData.lastLogoutAt,
        profileUpdateCount: await this.getProfileUpdateCount(userId)
      }
    }

    if (includeEngagement) {
      // Add engagement metrics
      enhancedAnalytics.engagementMetrics = {
        profileViews: await this.getProfileViewCount(userId),
        socialConnections: await this.getSocialConnectionCount(userId),
        contentInteractions: await this.getContentInteractionCount(userId)
      }
    }

    // Cache for 10 minutes
    if (useCache) {
      try {
        const { RedisClient } = require('../../clients')
        await RedisClient.setex(cacheKey, 600, JSON.stringify(enhancedAnalytics))
      } catch {
        // Continue without caching
      }
    }

    return enhancedAnalytics
  }

  /**
   * Validate user GDPR compliance with database context
   * @param {string} userId - User ID
   * @returns {Object} GDPR compliance status with actions
   */
  static async validateUserGDPRCompliance(userId) {
    const userData = await this.query()
      .findById(userId)
      .select(['id', 'createdAt', 'acceptedPrivacyAt', 'isActive', 'lastLogoutAt', 'metadata'])

    if (!userData) {
      throw this.errorEmptyResponse()
    }

    // Validate GDPR compliance directly (moved from UserModel to avoid circular dependency)
    const checks = {
      consentGiven: userData.acceptedPrivacyAt !== null,
      dataMinimization: this.checkDataMinimization(userData),
      retentionCompliance: this.checkRetentionCompliance(userData),
      rightToErasure: userData.isActive || userData.deletedAt !== null
    }

    const compliant = Object.values(checks).every(Boolean)

    const compliance = {
      compliant,
      checks,
      actions: compliant ? [] : this.getGDPRActions(checks)
    }

    // Add database-specific compliance checks
    const enhancedCompliance = { ...compliance }

    // Check for data retention compliance across related tables
    if (compliance.compliant) {
      try {
        const dataRetentionChecks = await this.checkDataRetentionCompliance(userId)
        enhancedCompliance.checks.dataRetention = dataRetentionChecks.compliant
        
        if (!dataRetentionChecks.compliant) {
          enhancedCompliance.compliant = false
          enhancedCompliance.actions.push(...dataRetentionChecks.actions)
        }
      } catch {
        // Continue with basic compliance if detailed checks fail
      }
    }

    return enhancedCompliance
  }

  /**
   * Search users with advanced filtering and caching
   * @param {Object} criteria - Search criteria
   * @returns {Object} Search results with metadata
   */
  static async searchUsers(criteria = {}) {
    const {
      query = '',
      role = null,
      isActive = null,
      isVerified = null,
      country = null,
      registrationDateFrom = null,
      registrationDateTo = null,
      lastActivityFrom = null,
      lastActivityTo = null,
      page = 0,
      limit = 20,
      orderBy = 'createdAt',
      orderDirection = 'desc',
      useCache = true
    } = criteria

    // Create cache key from search criteria
    const cacheKey = `user:search:${Buffer.from(JSON.stringify(criteria)).toString('base64')}`

    if (useCache) {
      try {
        const { RedisClient } = require('../../clients')
        const cached = await RedisClient.get(cacheKey)
        if (cached) return JSON.parse(cached)
      } catch {
        // Continue without cache
      }
    }

    // Build search query
    let searchQuery = this.query()

    // Text search across name, email
    if (query) {
      searchQuery = searchQuery.where(builder => {
        builder
          .whereILike('name', `%${query}%`)
          .orWhereILike('email', `%${query}%`)
      })
    }

    // Apply filters
    if (role !== null) searchQuery = searchQuery.where('role', role)
    if (isActive !== null) searchQuery = searchQuery.where('isActive', isActive)
    if (isVerified !== null) searchQuery = searchQuery.where('isVerified', isVerified)
    if (country !== null) searchQuery = searchQuery.where('countryId', country)

    // Date range filters
    if (registrationDateFrom) {
      searchQuery = searchQuery.where('createdAt', '>=', registrationDateFrom)
    }
    if (registrationDateTo) {
      searchQuery = searchQuery.where('createdAt', '<=', registrationDateTo)
    }
    if (lastActivityFrom) {
      searchQuery = searchQuery.where('lastLogoutAt', '>=', lastActivityFrom)
    }
    if (lastActivityTo) {
      searchQuery = searchQuery.where('lastLogoutAt', '<=', lastActivityTo)
    }

    // Add relations and pagination
    const results = await searchQuery
      .withGraphFetched('[country]')
      .orderBy(orderBy, orderDirection)
      .page(page, limit)

    // Format results
    const formattedResults = {
      users: results.results,
      pagination: {
        page,
        limit,
        total: results.total,
        pages: Math.ceil(results.total / limit)
      },
      searchCriteria: criteria
    }

    // Cache results for 2 minutes
    if (useCache) {
      try {
        const { RedisClient } = require('../../clients')
        await RedisClient.setex(cacheKey, 120, JSON.stringify(formattedResults))
      } catch {
        // Continue without caching
      }
    }

    return formattedResults
  }

  /**
   * Get user trust metrics with database context
   * @param {string} userId - User ID
   * @returns {Object} Trust metrics and recommendations
   */
  static async getUserTrustMetrics(userId) {
    const userData = await this.query()
      .findById(userId)
      .withGraphFetched('[stories, interests, country]')

    if (!userData) {
      throw this.errorEmptyResponse()
    }

    // Use UserUtils for trust calculation
    const UserUtils = require('../../helpers/common/UserUtils')
    const trustScore = UserUtils.calculateTrustScore(userData)

    // Add database-driven trust factors
    const enhancedTrust = { ...trustScore }
    
    enhancedTrust.databaseFactors = {
      contentCreated: userData.stories ? userData.stories.length : 0,
      profileInteractions: await this.getProfileInteractionCount(userId),
      communityEngagement: await this.getCommunityEngagementScore(userId),
      reportCount: await this.getUserReportCount(userId)
    }

    // Adjust trust score based on database factors
    if (enhancedTrust.databaseFactors.reportCount > 0) {
      enhancedTrust.score = Math.max(0, enhancedTrust.score - (enhancedTrust.databaseFactors.reportCount * 10))
      enhancedTrust.factors.push('Account has reports against it')
    }

    if (enhancedTrust.databaseFactors.contentCreated > 5) {
      enhancedTrust.score = Math.min(100, enhancedTrust.score + 5)
      enhancedTrust.factors.push('Active content creator')
    }

    return enhancedTrust
  }

  /**
   * ===============================
   * PRIVATE HELPER METHODS
   * ===============================
   */

  /**
   * Get profile update count for user
   * @private
   */
  static async getProfileUpdateCount(/* userId */) {
    // This would require an audit log table - placeholder for now
    return 0
  }

  /**
   * Get profile view count
   * @private
   */
  static async getProfileViewCount(/* userId */) {
    // This would require a profile views table - placeholder for now
    return 0
  }

  /**
   * Get social connection count
   * @private
   */
  static async getSocialConnectionCount(/* userId */) {
    // This would require a connections/followers table - placeholder for now
    return 0
  }

  /**
   * Get content interaction count
   * @private
   */
  static async getContentInteractionCount(/* userId */) {
    // This would require an interactions table - placeholder for now
    return 0
  }

  /**
   * Check data retention compliance across tables
   * @private
   */
  static async checkDataRetentionCompliance(userId) {
    try {
      // Check if user has been inactive for too long
      const userData = await this.query()
        .findById(userId)
        .select(['createdAt', 'lastLogoutAt', 'isActive'])

      const accountAge = Date.now() - new Date(userData.createdAt).getTime()
      const threeYears = 3 * 365 * 24 * 60 * 60 * 1000

      if (accountAge > threeYears && !userData.isActive && !userData.lastLogoutAt) {
        return {
          compliant: false,
          actions: ['Consider archiving or deleting inactive account data']
        }
      }

      return { compliant: true, actions: [] }
    } catch {
      return { compliant: true, actions: [] }
    }
  }

  /**
   * Get profile interaction count
   * @private
   */
  static async getProfileInteractionCount(/* userId */) {
    // Placeholder - would require interaction tracking
    return 0
  }

  /**
   * Get community engagement score
   * @private
   */
  static async getCommunityEngagementScore(/* userId */) {
    // Placeholder - would require engagement metrics
    return 0
  }

  /**
   * Get user report count
   * @private
   */
  static async getUserReportCount(/* userId */) {
    // Placeholder - would require a reports table
    return 0
  }

  /**
   * Check data minimization compliance (moved from UserModel)
   * @private
   */
  static checkDataMinimization(userData) {
    // Check if we're not storing excessive personal data
    const essentialFields = ['id', 'name', 'email', 'mobileNumber', 'countryId', 'role', 'isActive', 'isVerified']
    const userFields = Object.keys(userData)
    const excessiveFields = userFields.filter(field => !essentialFields.includes(field) && userData[field] !== null)
    
    return excessiveFields.length < 10 // Reasonable limit
  }

  /**
   * Check retention compliance (moved from UserModel)
   * @private
   */
  static checkRetentionCompliance(userData) {
    if (!userData.createdAt) return false
    
    const accountAge = Date.now() - new Date(userData.createdAt).getTime()
    const threeYears = 3 * 365 * 24 * 60 * 60 * 1000
    
    // If account is over 3 years old and inactive, it should be reviewed
    if (accountAge > threeYears && !userData.isActive && !userData.lastLogoutAt) {
      return false
    }
    
    return true
  }

  /**
   * Get GDPR compliance actions (moved from UserModel)
   * @private
   */
  static getGDPRActions(checks) {
    const actions = []
    
    if (!checks.consentGiven) {
      actions.push('Obtain explicit consent for data processing')
    }
    if (!checks.dataMinimization) {
      actions.push('Review and minimize stored personal data')
    }
    if (!checks.retentionCompliance) {
      actions.push('Review data retention and consider archival/deletion')
    }
    
    return actions
  }
}

module.exports = UserDAO
3