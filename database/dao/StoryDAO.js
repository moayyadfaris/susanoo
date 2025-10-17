const { BaseDAO, assert, ErrorWrapper } = require('backend-core')
const { roles } = require('config')
const { performance } = require('perf_hooks')

/**
 * Enhanced StoryDAO - Enterprise-grade data access layer for stories
 * 
 * Features:
 * - Comprehensive CRUD operations with validation
 * - Advanced querying with performance optimization
 * - Transaction support for data integrity
 * - Enhanced error handling and logging
 * - Soft delete and audit trail support
 * - Performance monitoring and caching integration
 * - Relationship management with eager loading
 * - Search and filtering capabilities
 * 
 * @extends BaseDAO
 * @version 2.0.0
 * @author Susanoo API Team
 */
class StoryDAO extends BaseDAO {
  static get tableName () {
    return 'stories'
  }

  /**
   * Enhanced relation mappings with optimized queries
   */
  static get relationMappings () {
    return {
      // Many-to-many relationship with tags
      tags: {
        relation: BaseDAO.ManyToManyRelation,
        modelClass: `${__dirname}/TagDAO`,
        join: {
          from: 'stories.id',
          through: {
            from: 'story_tags.storyId',
            to: 'story_tags.tagId'
          },
          to: 'tags.id'
        }
      },
      
      categories: {
        relation: BaseDAO.ManyToManyRelation,
        modelClass: `${__dirname}/CategoryDAO`,
        join: {
          from: 'stories.id',
          through: {
            from: 'story_categories.storyId',
            to: 'story_categories.categoryId'
          },
          to: 'categories.id'
        }
      },
      
      // Optimized reporter relationship with minimal fields
      reporter: {
        relation: BaseDAO.HasOneRelation,
        modelClass: `${__dirname}/UserDAO`,
        filter: query => query.select('users.id', 'users.name', 'users.profileImageId')
          .where('users.role', roles.user)
          .where('users.deletedAt', null),
        join: {
          from: 'stories.userId',
          to: 'users.id'
        }
      },
      
      // Enhanced attachments relationship
      attachments: {
        relation: BaseDAO.ManyToManyRelation,
        modelClass: `${__dirname}/AttachmentDAO`,
        join: {
          from: 'stories.id',
          through: {
            from: 'story_attachments.storyId',
            to: 'story_attachments.attachmentId'
          },
          to: 'attachments.id'
        }
      },
      
      // Optimized owner relationship
      owner: {
        relation: BaseDAO.BelongsToOneRelation,
        filter: query => query.select('id', 'name', 'role', 'profileImageId', 'email')
          .where('deletedAt', null),
        modelClass: `${__dirname}/UserDAO`,
        join: {
          from: 'stories.userId',
          to: 'users.id'
        }
      },
      
      // Parent story relationship for hierarchical stories
      parentStory: {
        relation: BaseDAO.BelongsToOneRelation,
        modelClass: `${__dirname}/StoryDAO`,
        join: {
          from: 'stories.parentId',
          to: 'stories.id'
        }
      },
      
      // Child stories relationship
      childStories: {
        relation: BaseDAO.HasManyRelation,
        modelClass: `${__dirname}/StoryDAO`,
        join: {
          from: 'stories.id',
          to: 'stories.parentId'
        }
      },
      
      
      // Editor relationship for stories in edit mode
      editor: {
        relation: BaseDAO.HasOneRelation,
        modelClass: `${__dirname}/EditorDAO`,
        join: {
          from: 'stories.id',
          to: 'editors.storyId'
        }
      }
    }
  }

  /**
   * Enhanced JSON formatting with optimizations
   */
  $formatJson (json) {
    json = super.$formatJson(json)
    
    // Remove sensitive internal fields
    delete json.reporterId
    delete json.parentId
    delete json.deletedAt
    delete json.deletedBy
    
    // Format timestamps consistently
    if (json.createdAt) {
      json.createdAt = new Date(json.createdAt).toISOString()
      json.updatedAt = new Date(json.updatedAt).toISOString()
    }
    
    if (json.fromTime) {
      json.fromTime = new Date(json.fromTime).toISOString()
    }
    
    if (json.toTime) {
      json.toTime = new Date(json.toTime).toISOString()
    }
    
    // Include editor information if available
    if (this.editor) {
      json.editor = this.editor.user
    }
    
    // Add computed properties
    json.isExpired = json.toTime ? new Date(json.toTime) < new Date() : false
    json.duration = json.fromTime && json.toTime ? 
      Math.abs(new Date(json.toTime) - new Date(json.fromTime)) / (1000 * 60 * 60 * 24) : null
    
    return json
  }

  /**
   * Enhanced story creation with validation and transaction support
   * @param {Object} storyData - Story data to create
   * @param {Object} options - Options including transaction
   * @returns {Promise<Object>} Created story with relations
   */
  static async create (storyData, options = {}) {
    assert.object(storyData, { required: true })
    
    const startTime = performance.now()
    const trx = options.transaction
    
    try {
      // Validate required fields
      if (!storyData.title || !storyData.userId) {
        throw new ErrorWrapper({
          code: 'VALIDATION_ERROR',
          message: 'Title and userId are required for story creation'
        })
      }
      
      // Set default values
      const defaultData = {
        status: 'DRAFT',
        type: 'STORY',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...storyData
      }
      
      const query = trx ? this.query(trx) : this.query()
      
      const story = await query
        .insertGraph(defaultData, { 
          unrelate: true, 
          allowRefs: true,
          relate: true
        })
        .withGraphFetched('[tags, attachments, owner]')
      
      // Log performance
      const executionTime = performance.now() - startTime
      if (executionTime > 1000) {
        console.warn(`Slow story creation: ${executionTime.toFixed(2)}ms`)
      }
      
      return story
    } catch (error) {
      console.error('Story creation failed:', error)
      throw error
    }
  }

  /**
   * Enhanced story update with optimistic locking
   * @param {Object} storyData - Story data to update
   * @param {Object} options - Options including transaction
   * @returns {Promise<Object>} Updated story with relations
   */
  static async update (storyData, options = {}) {
    assert.object(storyData, { required: true })
    assert.integer(storyData.id, { required: true })
    
    const trx = options.transaction
    const hasExpectedVersion = Object.prototype.hasOwnProperty.call(options, 'expectedVersion')
    const expectedVersionRaw = hasExpectedVersion ? options.expectedVersion : null
    const expectedVersion = expectedVersionRaw !== null && expectedVersionRaw !== undefined
      ? parseInt(expectedVersionRaw, 10)
      : null

    if (expectedVersion !== null && Number.isNaN(expectedVersion)) {
      throw new ErrorWrapper({
        code: 'INVALID_VERSION',
        message: 'Expected version must be a positive integer',
        statusCode: 400
      })
    }

    const updateData = {
      ...storyData,
      updatedAt: new Date()
    }
    
    try {
      if (expectedVersion !== null) {
        const versionQueryBase = trx ? this.query(trx) : this.query()
        let versionBuilder = versionQueryBase
          .findById(updateData.id)
          .select('id', 'version')

        if (trx && typeof versionBuilder.forUpdate === 'function') {
          versionBuilder = versionBuilder.forUpdate()
        }

        const currentRecord = await versionBuilder

        if (!currentRecord) {
          throw new ErrorWrapper({
            code: 'NOT_FOUND',
            message: 'Story not found for update',
            statusCode: 404
          })
        }

        const parsedCurrentVersion = parseInt(currentRecord.version, 10)
        const currentVersion = Number.isNaN(parsedCurrentVersion) || parsedCurrentVersion < 1
          ? 1
          : parsedCurrentVersion
        if (currentVersion !== expectedVersion) {
          throw new ErrorWrapper({
            code: 'VERSION_CONFLICT',
            message: 'Story has been modified by another user. Please refresh and try again.',
            statusCode: 409,
            details: {
              expectedVersion,
              currentVersion
            }
          })
        }

        const nextVersion = currentVersion + 1
        const providedVersion = updateData.version !== undefined && updateData.version !== null
          ? parseInt(updateData.version, 10)
          : null
        updateData.version = !providedVersion || Number.isNaN(providedVersion) || providedVersion <= currentVersion
          ? nextVersion
          : providedVersion
      }

      const query = trx ? this.query(trx) : this.query()
      
      const story = await query
        .upsertGraph(updateData, { 
          unrelate: true, 
          allowRefs: true,
          relate: true,
          noUpdate: ['createdAt', 'userId'] // Protect immutable fields
        })
        .withGraphFetched('[editor, tags, parentStory, attachments, owner]')
      
      if (!story) {
        throw new ErrorWrapper({
          code: 'NOT_FOUND',
          message: 'Story not found for update'
        })
      }
      
      return story
    } catch (error) {
      console.error('Story update failed:', error)
      throw error
    }
  }

  /**
   * Enhanced story listing with advanced filtering and performance optimization
   * @param {Object} params - Query parameters
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Paginated story results
   */
  static async getList (params = {}) {
    const { 
      page = 1, 
      limit = 20, 
      filter = {}, 
      orderBy = { field: 'createdAt', direction: 'desc' }, 
      filterIn, 
      term,
      includeDeleted = false 
    } = params

    assert.integer(page, { required: true, min: 1 })
    assert.integer(limit, { required: true, min: 1, max: 100 })
    assert.object(filter, { required: true })
    
    const startTime = performance.now()
    
    try {
      const query = this.query()
        .select(this.raw('DISTINCT stories.*'))

      this.applyQueryFilters(query, filter)
      this.applyQueryWhereIn(query, filterIn)
      
      // Soft delete handling
      if (!includeDeleted) {
        query.whereNull('stories.deletedAt')
      }
      
      // Advanced filtering
      // Enhanced search
      if (term) {
        query.where(builder => {
          if (isNaN(term)) {
            // Text search across multiple fields
            query.joinRelated('[tags, owner]')
            builder
              .whereRaw('LOWER(stories.title) LIKE ?', `%${term.toLowerCase()}%`)
              .orWhereRaw('LOWER(stories.details) LIKE ?', `%${term.toLowerCase()}%`)
              .orWhereRaw('LOWER(tags.name) LIKE ?', `%${term.toLowerCase()}%`)
              .orWhereRaw('LOWER(owner.name) LIKE ?', `%${term.toLowerCase()}%`)
          } else {
            // Numeric search by ID
            builder.where('stories.id', term)
          }
        })
      }
      
      // Optimized ordering
      query.orderBy(`stories.${orderBy.field}`, orderBy.direction)
      
      // Pagination with eager loading
      const result = await query
        .page(page - 1, limit)
        .withGraphFetched('[tags, owner.[profileImage], editor.[user]]')
        .modifyGraph('owner', builder => {
          builder.select('id', 'name', 'email', 'role', 'profileImageId')
        })
      
      // Performance monitoring
      const executionTime = performance.now() - startTime
      if (executionTime > 2000) {
        console.warn(`Slow story list query: ${executionTime.toFixed(2)}ms`, { params })
      }
      
      if (!result.results.length) {
        return this.emptyPageResponse()
      }
      
      return {
        results: result.results,
        total: result.total,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.total / limit),
        hasNext: page < Math.ceil(result.total / limit),
        hasPrev: page > 1
      }
    } catch (error) {
      console.error('Story list query failed:', error)
      throw error
    }
  }

  /**
   * Enhanced story retrieval by ID with comprehensive relations
   * @param {number} id - Story ID
   * @param {string} relations - Relations to include
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Story with relations
   */
  static async getByID (id, relations = '[tags, owner, attachments]', options = {}) {
    assert.integer(id, { required: true })

    const { relationExpression, includedRelations, queryOptions } = this.normalizeStoryFetchConfig(relations, options)

    try {
      const trx = queryOptions.transaction
      const query = trx ? this.query(trx) : this.query()

      query.findById(id)

      if (relationExpression) {
        query.withGraphFetched(relationExpression)
      }

      if (!queryOptions.includeDeleted) {
        query.whereNull(`${this.tableName}.deletedAt`)
      }

      if (includedRelations.owner) {
        query.modifyGraph('owner', builder => {
          builder.select('id', 'name', 'email', 'role', 'profileImageId')
        })
      }

      if (includedRelations.attachments) {
        query.modifyGraph('attachments', builder => {
          builder.where('deletedAt', null)
        })
      }

      const story = await query

      if (!story) {
        throw new ErrorWrapper({
          code: 'NOT_FOUND',
          message: 'Story not found'
        })
      }

      return story
    } catch (error) {
      console.error('Story retrieval failed:', error)
      throw error
    }
  }

  /**
   * Enhanced story details with comprehensive relations
   * @param {number} id - Story ID
   * @param {string} relations - Relations to include
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Complete story details
   */
  static async getStoryDetails (id, relations = '[tags, owner.[profileImage], attachments, categories, editor.[user], parentStory, childStories]', options = {}) {
    assert.integer(id, { required: true })

    const { relationExpression, includedRelations, queryOptions } = this.normalizeStoryFetchConfig(relations, options)

    try {
      const trx = queryOptions.transaction
      const query = trx ? this.query(trx) : this.query()

      query.findById(id)

      if (relationExpression) {
        query.withGraphFetched(relationExpression)
      }

      if (!queryOptions.includeDeleted) {
        query.whereNull(`${this.tableName}.deletedAt`)
      }

      if (includedRelations.owner) {
        query.modifyGraph('owner', builder => {
          builder.select('id', 'name', 'email', 'role', 'profileImageId')
        })
      }

      if (includedRelations.attachments) {
        query.modifyGraph('attachments', builder => {
          builder.where('deletedAt', null)
        })
      }

      const story = await query

      if (!story) {
        throw this.errorEmptyResponse()
      }

      // Add computed fields
      story.isExpired = story.toTime ? new Date(story.toTime) < new Date() : false
      story.canEdit = !story.isExpired && story.status !== 'PUBLISHED'

      return story
    } catch (error) {
      console.error('Story details retrieval failed:', error)
      throw error
    }
  }

  /**
   * Normalize relations/configuration for story fetching to support both legacy
   * relation-expression strings and the newer include options objects.
   * @param {string|Array|Object} relationsOrConfig
   * @param {Object} options
   * @returns {{ relationExpression: string|null, includedRelations: Object, queryOptions: Object }}
   */
  static normalizeStoryFetchConfig (relationsOrConfig, options = {}) {
    const defaultExpression = '[tags, owner.[profileImage], attachments, categories, editor.[user], parentStory, childStories]'
    const baseIncluded = {
      owner: false,
      attachments: false,
      tags: false,
      categories: false,
      editor: false,
      parentStory: false,
      childStories: false,
      reporter: false
    }

    const queryOptions = { ...options }
    let relationExpression = defaultExpression

    const normalizeBoolean = value => {
      if (typeof value === 'boolean') return value
      if (typeof value === 'string') {
        const normalized = value.toLowerCase()
        if (['true', '1', 'yes', 'y'].includes(normalized)) return true
        if (['false', '0', 'no', 'n'].includes(normalized)) return false
      }
      return Boolean(value)
    }

    const applyIncludedFlags = expression => {
      const flags = { ...baseIncluded }
      if (!expression) {
        return flags
      }

      const normalized = expression.replace(/[[\]\s]/g, '')
      flags.owner = normalized.includes('owner')
      flags.attachments = normalized.includes('attachments')
      flags.tags = normalized.includes('tags')
      flags.categories = normalized.includes('categories')
      flags.editor = normalized.includes('editor')
      flags.parentStory = normalized.includes('parentStory')
      flags.childStories = normalized.includes('childStories')
      flags.reporter = normalized.includes('reporter')
      return flags
    }

    const buildExpressionFromArray = relationList => {
      const cleaned = relationList
        .map(part => (part || '').toString().trim())
        .filter(Boolean)
      if (!cleaned.length) {
        return null
      }
      return `[${[...new Set(cleaned)].join(', ')}]`
    }

    if (typeof relationsOrConfig === 'string') {
      relationExpression = relationsOrConfig
    } else if (Array.isArray(relationsOrConfig)) {
      relationExpression = buildExpressionFromArray(relationsOrConfig)
    } else if (relationsOrConfig && typeof relationsOrConfig === 'object') {
      const mapping = [
        { key: 'includeTags', relation: 'tags' },
        { key: 'includeUser', relation: 'owner.[profileImage]' },
        { key: 'includeOwner', relation: 'owner.[profileImage]' },
        { key: 'includeAttachments', relation: 'attachments' },
        { key: 'includeCategories', relation: 'categories' },
        { key: 'includeEditor', relation: 'editor.[user]' },
        { key: 'includeParentStory', relation: 'parentStory' },
        { key: 'includeChildStories', relation: 'childStories' },
        { key: 'includeReporter', relation: 'reporter' }
      ]

      const relationsList = []
      mapping.forEach(({ key, relation }) => {
        if (normalizeBoolean(relationsOrConfig[key])) {
          relationsList.push(relation)
        }
      })

      relationExpression = buildExpressionFromArray(relationsList) || defaultExpression

      if (Object.prototype.hasOwnProperty.call(relationsOrConfig, 'includeDeleted')) {
        queryOptions.includeDeleted = normalizeBoolean(relationsOrConfig.includeDeleted)
      }

      if (relationsOrConfig.transaction && !queryOptions.transaction) {
        queryOptions.transaction = relationsOrConfig.transaction
      }
    } else if (relationsOrConfig == null) {
      relationExpression = defaultExpression
    }

    const includedRelations = applyIncludedFlags(relationExpression || '')

    return {
      relationExpression,
      includedRelations,
      queryOptions
    }
  }

  /**
   * Apply standard where filters to a query builder, supporting comparison operators.
   * @param {Object} query
   * @param {Object} filters
   */
  static applyQueryFilters (query, filters = {}) {
    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
      return
    }

    Object.entries(filters).forEach(([rawColumn, value]) => {
      if (value === undefined || value === null) {
        return
      }

      const { column, operator } = this.parseFilterKey(rawColumn)

      if (Array.isArray(value)) {
        if (value.length) {
          query.whereIn(column, value)
        }
        return
      }

      if (operator) {
        query.where(column, operator, value)
      } else {
        query.where(column, value)
      }
    })
  }

  /**
   * Apply whereIn filters supporting legacy structures ({ key, value }) and maps.
   * @param {Object} query
   * @param {Object|Array} filterIn
   */
  static applyQueryWhereIn (query, filterIn) {
    if (!filterIn) {
      return
    }

    if (Array.isArray(filterIn)) {
      filterIn.forEach(entry => {
        if (entry && entry.key && Array.isArray(entry.value) && entry.value.length) {
          query.whereIn(entry.key, entry.value)
        }
      })
      return
    }

    if (typeof filterIn === 'object') {
      if (filterIn.key && Array.isArray(filterIn.value) && filterIn.value.length) {
        query.whereIn(filterIn.key, filterIn.value)
        return
      }

      Object.entries(filterIn).forEach(([column, values]) => {
        if (!Array.isArray(values) || !values.length) {
          return
        }
        query.whereIn(column.trim(), values)
      })
    }
  }

  /**
   * Parse a filter key into column and optional comparison operator.
   * @param {string} rawColumn
   * @returns {{column: string, operator: string|null}}
   */
  static parseFilterKey (rawColumn) {
    if (!rawColumn || typeof rawColumn !== 'string') {
      return { column: rawColumn, operator: null }
    }

    const comparatorRegex = /(.*?)(?:\s*)(>=|<=|>|<|!=)$/
    const match = comparatorRegex.exec(rawColumn)

    if (match) {
      return {
        column: match[1].trim(),
        operator: match[2]
      }
    }

    return {
      column: rawColumn.trim(),
      operator: null
    }
  }

  /**
   * Enhanced stories requests list with advanced filtering
   * @param {Object} params - Query parameters
   * @param {Object} user - Current user context
   * @param {string} relations - Relations to include
   * @returns {Promise<Object>} Paginated story requests
   */
  static async getStoriesRequestsList (params = {}, user, relations = '[tags, owner, attachments]') {
    const { 
      page = 1, 
      limit = 20, 
      filter = {}, 
      filterIn = {}, 
      orderBy = { field: 'createdAt', direction: 'desc' }, 
      term 
    } = params

    assert.integer(page, { required: true })
    assert.integer(limit, { required: true })
    assert.object(filter, { required: true })
    
    try {
      const query = this.query()

      this.applyQueryFilters(query, filter)
      this.applyQueryWhereIn(query, filterIn)
      query.whereNull('deletedAt')
      
      // Enhanced search
      if (term) {
        query.where(builder => {
          if (isNaN(term)) {
            query.joinRelated('[tags, owner]')
            builder
              .whereRaw('LOWER(stories.title) LIKE ?', `%${term.toLowerCase()}%`)
              .orWhereRaw('LOWER(stories.details) LIKE ?', `%${term.toLowerCase()}%`)
              .orWhereRaw('LOWER(tags.name) LIKE ?', `%${term.toLowerCase()}%`)
              .orWhereRaw('LOWER(owner.name) LIKE ?', `%${term.toLowerCase()}%`)
          } else {
            builder.where('stories.id', term)
          }
        })
      }
      
      // Apply user-specific filters based on role
      if (user.role !== 'ROLE_SUPERADMIN') {
        query.where('stories.userId', user.id)
      }
      
      query.orderBy(`stories.${orderBy.field}`, orderBy.direction)
      
      const result = await query
        .page(page - 1, limit)
        .withGraphFetched(relations)
      
      if (!result.results.length) {
        return this.emptyPageResponse()
      }
      
      return {
        results: result.results,
        total: result.total,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.total / limit)
      }
    } catch (error) {
      console.error('Stories requests list query failed:', error)
      throw error
    }
  }

  /**
   * Enhanced web story listing with advanced search and filtering
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Paginated web stories
   */
  static async getListWeb (params = {}) {
    const { 
      page = 1, 
      limit = 20, 
      filter = {}, 
      orderBy = { field: 'createdAt', direction: 'desc' }, 
      filterIn, 
      term, 
      editorId 
    } = params

    assert.integer(page, { required: true })
    assert.integer(limit, { required: true })
    assert.object(filter, { required: true })
    
    try {
      const query = this.query()
        .distinct('stories.id')
        .select('stories.*')
        .whereNull('stories.deletedAt')
        .whereNot('stories.status', 'DELETED')
      
      // Enhanced search functionality
      if (term) {
        if (isNaN(term)) {
          query.joinRelated('[tags, owner]')
          query.where(builder =>
            builder
              .whereRaw('LOWER(stories.title) LIKE ?', `%${term.toLowerCase()}%`)
              .orWhereRaw('LOWER(stories.details) LIKE ?', `%${term.toLowerCase()}%`)
              .orWhereRaw('LOWER(tags.name) LIKE ?', `%${term.toLowerCase()}%`)
              .orWhereRaw('LOWER(owner.name) LIKE ?', `%${term.toLowerCase()}%`)
          )
        } else {
          query.where('stories.id', term)
        }
      }
      
      // Editor-specific filtering
      if (editorId) {
        query.joinRelation('editor')
        query.where('editor.userId', editorId)
      }
      
      // Complex status filtering for edit mode
      if (filter.isInEditMode && filterIn?.status) {
        const statusFilter = filterIn.status
        query.where(builder =>
          builder.whereIn('stories.status', statusFilter).orWhere('stories.isInEditMode', true)
        )
        
        if (statusFilter.includes('IN_PROGRESS')) {
          query.joinRelation('editor')
        }
        
        if (statusFilter.includes('SUBMITTED')) {
          query.leftJoinRelated('editor')
          query.where('editor.id', null)
        }
        
        delete filter.isInEditMode
        delete filterIn.status
      }
      
      // Apply remaining filters
      if (filterIn) {
        Object.keys(filterIn).forEach(key => {
          query.whereIn(`stories.${key}`, filterIn[key])
        })
      }
      
      query.where(filter)
      query.orderBy(`stories.${orderBy.field}`, orderBy.direction)
      
      const result = await query
        .page(page - 1, limit)
        .withGraphFetched('[tags, editor, owner.[profileImage]]')
        .groupBy('stories.id')
      
      if (!result.results.length) {
        return this.emptyPageResponse()
      }
      
      return {
        results: result.results,
        total: result.total,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.total / limit)
      }
    } catch (error) {
      console.error('Web stories list query failed:', error)
      throw error
    }
  }

  /**
   * Soft delete story with audit trail
   * @param {number} id - Story ID
   * @param {string} userId - User performing the deletion
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Deletion result
   */
  static async softDelete (id, userId, options = {}) {
    assert.integer(id, { required: true })
    assert.string(userId, { required: true })
    
    const trx = options.transaction
    
    try {
      const query = trx ? this.query(trx) : this.query()
      
      const result = await query
        .findById(id)
        .patch({
          deletedAt: new Date(),
          deletedBy: userId,
          status: 'DELETED',
          updatedAt: new Date()
        })
      
      if (!result) {
        throw new ErrorWrapper({
          code: 'NOT_FOUND',
          message: 'Story not found for deletion'
        })
      }
      
      return { success: true, deletedAt: new Date() }
    } catch (error) {
      console.error('Story soft deletion failed:', error)
      throw error
    }
  }

  /**
   * Restore soft deleted story
   * @param {number} id - Story ID
   * @param {string} status - Status to restore to
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Restoration result
   */
  static async restore (id, status = 'DRAFT', options = {}) {
    assert.integer(id, { required: true })
    
    const trx = options.transaction
    
    try {
      const query = trx ? this.query(trx) : this.query()
      
      const result = await query
        .findById(id)
        .patch({
          deletedAt: null,
          deletedBy: null,
          status: status,
          updatedAt: new Date()
        })
      
      if (!result) {
        throw new ErrorWrapper({
          code: 'NOT_FOUND',
          message: 'Story not found for restoration'
        })
      }
      
      return { success: true, restoredAt: new Date() }
    } catch (error) {
      console.error('Story restoration failed:', error)
      throw error
    }
  }

  /**
   * Get expired stories by timespan with enhanced filtering
   * @param {number} days - Number of days for expiration check
   * @returns {Promise<Array>} Expired stories
   */
  static async getExpiredStoriesByTimespan (days = 30) {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)
      
      return await this.query()
        .where('toTime', '<', new Date())
        .whereNull('parentId')
        .where('status', 'SUBMITTED')
        .whereNull('deletedAt')
        .withGraphFetched('[owner, tags]')
        .orderBy('toTime', 'asc')
    } catch (error) {
      console.error('Get expired stories failed:', error)
      throw error
    }
  }

  /**
   * Get expired stories with enhanced metadata
   * @returns {Promise<Array>} Expired stories
   */
  static async getExpiredStories () {
    try {
      return await this.query()
        .whereNull('parentId')
        .where('status', 'EXPIRED')
        .whereNull('deletedAt')
        .withGraphFetched('[owner, tags]')
        .orderBy('updatedAt', 'desc')
    } catch (error) {
      console.error('Get expired stories failed:', error)
      throw error
    }
  }

  /**
   * Get reports by archived story with enhanced details
   * @param {number} parentId - Parent story ID
   * @returns {Promise<Array>} Related reports
   */
  static async getReportsByArchivedStory (parentId) {
    assert.integer(parentId, { required: true })
    
    try {
      return await this.query()
        .where('parentId', parentId)
        .where('status', 'SUBMITTED')
        .whereNull('deletedAt')
        .withGraphFetched('[owner, tags]')
        .orderBy('createdAt', 'desc')
    } catch (error) {
      console.error('Get reports by archived story failed:', error)
      throw error
    }
  }

  /**
   * Archive reports by deleted parent with transaction support
   * @param {number} parentId - Parent story ID
   * @param {Object} options - Options including transaction
   * @returns {Promise<number>} Number of archived reports
   */
  static async archiveReportsByDeleteParent (parentId, options = {}) {
    assert.integer(parentId, { required: true })
    
    const trx = options.transaction
    
    try {
      const query = trx ? this.query(trx) : this.query()
      
      const result = await query
        .patch({ 
          status: 'ARCHIVED',
          updatedAt: new Date()
        })
        .where('parentId', parentId)
        .whereNotIn('status', ['APPROVED', 'PUBLISHED'])
        .whereNull('deletedAt')
      
      return result
    } catch (error) {
      console.error('Archive reports by deleted parent failed:', error)
      throw error
    }
  }

  /**
   * Bulk update stories status with transaction support
   * @param {Array} storyIds - Array of story IDs
   * @param {string} status - New status
   * @param {Object} options - Options including transaction
   * @returns {Promise<number>} Number of updated stories
   */
  static async bulkUpdateStatus (storyIds, status, options = {}) {
    assert.array(storyIds, { required: true })
    assert.string(status, { required: true })
    
    const trx = options.transaction
    
    try {
      const query = trx ? this.query(trx) : this.query()
      
      const result = await query
        .patch({ 
          status: status,
          updatedAt: new Date()
        })
        .whereIn('id', storyIds)
        .whereNull('deletedAt')
      
      return result
    } catch (error) {
      console.error('Bulk update status failed:', error)
      throw error
    }
  }

  /**
   * Get story statistics with performance optimization
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Story statistics
   */
  static async getStatistics (filters = {}) {
    try {
      const baseQuery = this.query()
        .whereNull('deletedAt')
      
      if (filters.dateFrom) {
        baseQuery.where('createdAt', '>=', filters.dateFrom)
      }
      
      if (filters.dateTo) {
        baseQuery.where('createdAt', '<=', filters.dateTo)
      }
      
      if (filters.userId) {
        baseQuery.where('userId', filters.userId)
      }
      
      const [
        totalStories,
        statusCounts,
        typeCounts,
        recentStories
      ] = await Promise.all([
        // Total stories count
        baseQuery.clone().count('* as count').first(),
        
        // Status distribution
        baseQuery.clone()
          .select('status')
          .count('* as count')
          .groupBy('status'),
        
        // Type distribution
        baseQuery.clone()
          .select('type')
          .count('* as count')
          .groupBy('type'),
        
        // Recent stories count (last 7 days)
        baseQuery.clone()
          .where('createdAt', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          .count('* as count')
          .first()
      ])
      
      return {
        total: parseInt(totalStories.count),
        recent: parseInt(recentStories.count),
        byStatus: statusCounts.reduce((acc, item) => {
          acc[item.status] = parseInt(item.count)
          return acc
        }, {}),
        byType: typeCounts.reduce((acc, item) => {
          acc[item.type] = parseInt(item.count)
          return acc
        }, {})
      }
    } catch (error) {
      console.error('Get story statistics failed:', error)
      throw error
    }
  }

  /**
   * Search stories with full-text search capabilities
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  static async searchStories (searchTerm, options = {}) {
    assert.string(searchTerm, { required: true })
    
    const {
      limit = 50,
      includeDeleted = false,
      status = null,
      type = null
    } = options
    
    try {
      const query = this.query()
        .select('stories.*')
        .joinRelated('[tags, owner]')
        .where(builder => {
          builder
            .whereRaw('LOWER(stories.title) LIKE ?', `%${searchTerm.toLowerCase()}%`)
            .orWhereRaw('LOWER(stories.details) LIKE ?', `%${searchTerm.toLowerCase()}%`)
            .orWhereRaw('LOWER(tags.name) LIKE ?', `%${searchTerm.toLowerCase()}%`)
            .orWhereRaw('LOWER(owner.name) LIKE ?', `%${searchTerm.toLowerCase()}%`)
        })
      
      if (!includeDeleted) {
        query.whereNull('stories.deletedAt')
      }
      
      if (status) {
        query.where('stories.status', status)
      }
      
      if (type) {
        query.where('stories.type', type)
      }
      
      const results = await query
        .distinct('stories.id')
        .withGraphFetched('[tags, owner]')
        .limit(limit)
        .orderBy('stories.updatedAt', 'desc')
      
      return results
    } catch (error) {
      console.error('Story search failed:', error)
      throw error
    }
  }

  /**
   * Get trending stories based on activity
   * @param {Object} options - Options for trending calculation
   * @returns {Promise<Array>} Trending stories
   */
  static async getTrendingStories (options = {}) {
    const {
      limit = 10,
      days = 7,
      status = ['PUBLISHED', 'APPROVED']
    } = options
    
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)
      
      return await this.query()
        .whereIn('status', status)
        .where('createdAt', '>=', cutoffDate)
        .whereNull('deletedAt')
        .withGraphFetched('[tags, owner.[profileImage]]')
        .orderBy('updatedAt', 'desc')
        .limit(limit)
    } catch (error) {
      console.error('Get trending stories failed:', error)
      throw error
    }
  }
}

module.exports = StoryDAO
