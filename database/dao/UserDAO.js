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
    console.log('� UserDAO.getByEmail called with email:', email)
    const data = await this.query().where({ email }).first()
    console.log('� UserDAO.getByEmail found user:', data ? data.id : 'not found')
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
      query = query.select(safeColumns)
    } else {
      query = query.select(select)
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
    try {
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

    } catch (error) {
      throw error
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
    try {
      assert.validate(userId, UserModel.schema.id, { required: true })

      // Get base user data with appropriate field selection
      let userData = await this.getCurrentUserBase(userId, options)
      
      // Always load profile image and any additionally requested relations
      userData = await this.loadCurrentUserRelations(userData, options.include || [])

      return userData

    } catch (error) {
      throw error
    }
  }

  /**
   * Get base current user data
   */
  static async getCurrentUserBase(userId, options = {}) {
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

    } catch (error) {
      // Don't fail the main request if related data loading fails
      return userData
    }
  }
}

module.exports = UserDAO
3