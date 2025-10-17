/**
 * StoryService - Enterprise story management service layer
 *
 * Consolidates all business logic related to stories, including:
 * - Listing, searching, and filtering stories with caching
 * - Retrieving story details with permission and relation handling
 * - Creating stories with tag/attachment orchestration
 * - Updating stories with optimistic locking and validation
 * - Removing stories with soft/hard delete flows
 *
 * @version 2.0.0
 */

const BaseService = require('../BaseService')
const StoryDAO = require('../../database/dao/StoryDAO')
const UserDAO = require('../../database/dao/UserDAO')
const TagDAO = require('../../database/dao/TagDAO')
const StoryModel = require('../../models/StoryModel')
const { ErrorWrapper } = require('backend-core')
const { roles } = require('../../config')
const { ownerPolicy, isOwnerPolicy } = require('../../acl/policies')
const { redisClient: rootRedisClient } = require('../../handlers/RootProvider')
const { performance } = require('perf_hooks')
const StoryUtils = require('./StoryUtils')
const StoryAttachmentService = require('./StoryAttachmentService')

class StoryService extends BaseService {
  constructor(options = {}) {
    super(options)

    this.registerDependency('storyDAO', options.storyDAO || StoryDAO)
    this.registerDependency('userDAO', options.userDAO || UserDAO)
    this.registerDependency('tagDAO', options.tagDAO || TagDAO)

    const storyAttachmentService = options.storyAttachmentService || new StoryAttachmentService({
      storyAttachmentDAO: options.storyAttachmentDAO,
      attachmentDAO: options.attachmentDAO,
      storyDAO: options.storyDAO || StoryDAO,
      logger: this.logger
    })
    this.registerDependency('storyAttachmentService', storyAttachmentService)

    if (options.redisClient || rootRedisClient) {
      this.registerDependency('redisClient', options.redisClient || rootRedisClient)
    }

    this.config = {
      list: {
        defaultPage: 1,
        defaultLimit: 20,
        maxLimit: 100,
        defaultOrder: { field: 'createdAt', direction: 'desc' },
        orderableFields: ['id', 'createdAt', 'updatedAt', 'title', 'status', 'priority', 'toTime', 'fromTime']
      },
      caching: {
        enabled: true,
        ttl: 300, // 5 min
        bypassWhen: {
          includeStats: true,
          searchTerm: true,
          largeLimit: 50
        }
      },
      security: {
        restrictedTypes: ['REPORT', 'INTERNAL'],
        restrictedStatuses: ['PUBLISHED', 'APPROVED']
      },
      ...options.config
    }
  }

  /**
   * List stories with comprehensive filtering and caching
   * @param {Object} query - Sanitized query params
   * @param {Object} context - Operation context (currentUser, requestId, ip, userAgent)
   * @returns {Promise<Object>} Story list result
   */
  async listStories(query = {}, context = {}) {
    return this.executeOperation('listStories', async operationContext => {
      const currentUser = context.currentUser
      if (!currentUser) {
        throw new ErrorWrapper({
          code: 'USER_NOT_FOUND',
          message: 'Current user context missing',
          statusCode: 401
        })
      }

      const normalizedQuery = this.normalizeListQuery(query)
      const bypassCache = this.shouldBypassCache(normalizedQuery)
      const cacheKey = bypassCache ? null : this.generateCacheKey(normalizedQuery, currentUser)

      if (!bypassCache && cacheKey) {
        const cached = await this.getCachedResult(cacheKey)
        if (cached) {
          return {
            ...cached,
            meta: {
              ...cached.meta,
              cached: true
            }
          }
        }
      }

      const userDAO = this.getDependency('userDAO')
      const user = await userDAO.baseGetById(currentUser.id)
      if (!user) {
        throw new ErrorWrapper({
          code: 'USER_NOT_FOUND',
          message: 'Current user not found',
          statusCode: 401
        })
      }

      const queryParams = this.buildListQueryParams(normalizedQuery, user)

      const storyDAO = this.getDependency('storyDAO')
      const queryStart = performance.now()
      const data = await storyDAO.getStoriesRequestsList(queryParams, user, this.buildRelations(normalizedQuery.include))
      const queryTime = performance.now() - queryStart

      const transformed = this.transformStories(data, user, normalizedQuery)
      const response = this.buildListResponse(transformed, queryParams)
      response.meta.queryTime = `${queryTime.toFixed(2)}ms`

      if (!bypassCache && cacheKey && transformed.results.length > 0) {
        await this.cacheResult(cacheKey, response)
      }

      return response
    }, {
      userId: context.currentUser?.id,
      query
    })
  }

  /**
   * Retrieve a story by ID including relations and permissions
   * @param {number} storyId
   * @param {Object} query
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async getStoryById(storyId, query = {}, context = {}) {
    return this.executeOperation('getStoryById', async () => {
      if (!Number.isInteger(storyId) || storyId <= 0) {
        throw new ErrorWrapper({
          code: 'INVALID_STORY_ID',
          message: 'Invalid story ID provided',
          statusCode: 400
        })
      }

      const currentUser = context.currentUser
      if (!currentUser) {
        throw new ErrorWrapper({
          code: 'USER_NOT_FOUND',
          message: 'Current user context missing',
          statusCode: 401
        })
      }

      const includeOptions = this.buildIncludeOptions(query, currentUser)
      const storyDAO = this.getDependency('storyDAO')
      const story = await storyDAO.getStoryDetails(storyId, includeOptions)

      if (!story) {
        throw new ErrorWrapper({
          code: 'STORY_NOT_FOUND',
          message: 'Story not found',
          statusCode: 404
        })
      }

    if (story.deletedAt && !StoryUtils.parseBoolean(query.includeDeleted)) {
        throw new ErrorWrapper({
          code: 'STORY_NOT_FOUND',
          message: 'Story not found',
          statusCode: 404
        })
      }

      await this.checkStoryAccess(story, currentUser, query)

      return this.transformStoryResponse(story, currentUser, query)
    }, {
      storyId,
      query,
      userId: context.currentUser?.id
    })
  }

  /**
   * Create a new story with tags & attachments
   */
  async createStory(payload, context = {}) {
    return this.executeOperation('createStory', async operationContext => {
      const currentUser = context.currentUser
      if (!currentUser) {
        throw new ErrorWrapper({
          code: 'USER_NOT_FOUND',
          message: 'Current user context missing',
          statusCode: 401
        })
      }

      const userDAO = this.getDependency('userDAO')
      const user = await userDAO.baseGetById(currentUser.id)
      if (!user) {
        throw new ErrorWrapper({
          code: 'USER_NOT_FOUND',
          message: 'User not found or inactive',
          statusCode: 401
        })
      }

      const sanitizedPayload = this.sanitizeCreatePayload(payload)
      const storyDataDefaults = StoryModel.prepareForDatabase(sanitizedPayload, currentUser)
      storyDataDefaults.userId = currentUser.id

      await this.checkCreationPermissions(currentUser, storyDataDefaults)
      await this.enforceCreateRateLimit(currentUser)
      await this.checkDuplicateStory(storyDataDefaults, currentUser)

    const { storyData, tagsPrepared, attachmentsPrepared } = await this.prepareStoryCreation(storyDataDefaults, currentUser)

      const storyDAO = this.getDependency('storyDAO')
      const externalTransaction = Boolean(context.transaction)
      const transaction = context.transaction || await storyDAO.startTransaction()

      try {
        const createdStory = await storyDAO.create({
          ...storyData,
          tags: tagsPrepared,
          attachments: attachmentsPrepared
        }, { transaction })

        if (!externalTransaction) {
          await transaction.commit()
        }

        await this.postCreationProcessing(createdStory, currentUser)
        await this.clearRelatedCaches(currentUser.id, createdStory.type, createdStory.status)

        this.emit('story:created', {
          storyId: createdStory.id,
          userId: currentUser.id,
          status: createdStory.status,
          type: createdStory.type,
          context: operationContext
        })

        return StoryModel.sanitizeForAPI(createdStory, currentUser)
      } catch (error) {
        if (!externalTransaction && transaction) {
          try {
            await transaction.rollback()
          } catch (rollbackError) {
            this.logger.warn('Story creation rollback failed', {
              error: rollbackError.message
            })
          }
        }
        throw error
      }
    }, {
      userId: context.currentUser?.id,
      payload
    })
  }

  /**
   * Update story with optimistic locking
   */
  async updateStory(storyId, payload, context = {}) {
    return this.executeOperation('updateStory', async operationContext => {
      const currentUser = context.currentUser
      if (!currentUser) {
        throw new ErrorWrapper({
          code: 'USER_NOT_FOUND',
          message: 'Current user context missing',
          statusCode: 401
        })
      }

      const storyDAO = this.getDependency('storyDAO')
      const existingStory = await storyDAO.getStoryDetails(storyId, {
        includeUser: true,
        includeTags: true,
        includeAttachments: true,
        includeDeleted: true
      })

      if (!existingStory) {
        throw new ErrorWrapper({
          code: 'STORY_NOT_FOUND',
          message: 'Story not found',
          statusCode: 404
        })
      }

      if (existingStory.deletedAt) {
        throw new ErrorWrapper({
          code: 'STORY_DELETED',
          message: 'Cannot update deleted story',
          statusCode: 410
        })
      }

      const sanitizedPayload = this.sanitizeUpdatePayload(payload)

      await ownerPolicy(existingStory, currentUser)
      this.checkUpdatePermissions(existingStory, sanitizedPayload, currentUser)
      this.checkVersionConflicts(existingStory, sanitizedPayload)
      this.validateStatusTransition(existingStory, sanitizedPayload, currentUser)

      const externalTransaction = Boolean(context.transaction)
      const transaction = context.transaction || await storyDAO.startTransaction()

      try {
        const { updateData, expectedVersion } = await this.prepareStoryUpdate(existingStory, sanitizedPayload, currentUser, transaction)
        const sanitizedExisting = this.stripComputedProperties({ ...existingStory })
        const merged = Object.assign(sanitizedExisting, updateData)

        const updatedStory = await storyDAO.update(merged, {
          transaction,
          expectedVersion
        })

        if (!externalTransaction) {
          await transaction.commit()
        }

        await this.postUpdateProcessing(existingStory, updatedStory, currentUser)
        await this.clearRelatedCaches(currentUser.id, updatedStory.type, updatedStory.status)

        this.emit('story:updated', {
          storyId: updatedStory.id,
          userId: currentUser.id,
          previousStatus: existingStory.status,
          newStatus: updatedStory.status,
          context: operationContext
        })

        return StoryModel.sanitizeForAPI(updatedStory, currentUser)
      } catch (error) {
        if (!externalTransaction && transaction) {
          try {
            await transaction.rollback()
          } catch (rollbackError) {
            this.logger.warn('Story update rollback failed', {
              storyId,
              error: rollbackError.message
            })
          }
        }
        throw error
      }
    }, {
      storyId,
      payload,
      userId: context.currentUser?.id
    })
  }

  /**
   * Remove story (soft/hard delete)
   */
  async removeStory(storyId, query = {}, context = {}) {
    return this.executeOperation('removeStory', async operationContext => {
      const currentUser = context.currentUser
      if (!currentUser) {
        throw new ErrorWrapper({
          code: 'USER_NOT_FOUND',
          message: 'Current user context missing',
          statusCode: 401
        })
      }

      const storyDAO = this.getDependency('storyDAO')
      const story = await storyDAO.getStoryDetails(storyId, {
        includeUser: true,
        includeTags: true,
        includeAttachments: true,
        includeDeleted: true
      })

      if (!story) {
        throw new ErrorWrapper({
          code: 'STORY_NOT_FOUND',
          message: 'Story not found',
          statusCode: 404
        })
      }

      const permanent = StoryUtils.parseBoolean(query.permanent)

      await this.checkDeletionPermissions(story, currentUser, permanent)
      await this.validateDeletionRules(story, currentUser, query, permanent)

      const externalTransaction = Boolean(context.transaction)
      const transaction = context.transaction || await storyDAO.startTransaction()

      try {
        let result
        if (permanent) {
          await this.performPermanentDeletion(story, transaction)
          result = {
            deletionType: 'permanent',
            deletedAt: new Date(),
            canRecover: false
          }
        } else {
          await this.performSoftDeletion(story, currentUser, query, transaction)
          result = {
            deletionType: 'soft',
            deletedAt: new Date(),
            canRecover: true
          }
        }

        if (!externalTransaction) {
          await transaction.commit()
        }

        await this.postDeletionProcessing(story, currentUser, query)
        await this.clearRelatedCaches(currentUser.id, story.type, story.status)

        this.emit('story:deleted', {
          storyId: story.id,
          userId: currentUser.id,
          deletionType: permanent ? 'permanent' : 'soft',
          context: operationContext
        })

        return result
      } catch (error) {
        if (!externalTransaction && transaction) {
          try {
            await transaction.rollback()
          } catch (rollbackError) {
            this.logger.warn('Story deletion rollback failed', {
              storyId,
              error: rollbackError.message
            })
          }
        }
        throw error
      }
    }, {
      storyId,
      query,
      userId: context.currentUser?.id
    })
  }

  /* ------------------------------------------------------------------
   * Internal helper methods
   * ------------------------------------------------------------------ */

  normalizeListQuery(query = {}) {
    const normalized = { ...query }
    const cfg = this.config.list

    normalized.page = StoryUtils.parseIntOrDefault(normalized.page, cfg.defaultPage)
    normalized.limit = StoryUtils.parseIntOrDefault(normalized.limit, cfg.defaultLimit, cfg.maxLimit)
    normalized.orderBy = StoryUtils.parseOrderBy(normalized.orderBy || cfg.defaultOrder, cfg)
    normalized.include = StoryUtils.normalizeToArray(normalized.include)
    normalized.tags = StoryUtils.normalizeTags(normalized.tags)
    normalized.status = StoryUtils.normalizeFilterValue(normalized.status)
    normalized.type = StoryUtils.normalizeFilterValue(normalized.type)
    normalized.priority = StoryUtils.normalizeFilterValue(normalized.priority)

    if (normalized.countryId !== undefined) {
      normalized.countryId = StoryUtils.parseIntOrDefault(normalized.countryId, null)
    }

    if (normalized.term) {
      normalized.term = normalized.term.toString().trim().substring(0, 100)
      if (!normalized.term.length) delete normalized.term
    }

    normalized.noCache = StoryUtils.parseBoolean(normalized.noCache)

    StoryUtils.enforceDateRange(normalized.dateFrom, normalized.dateTo)

    return normalized
  }

  buildListQueryParams(query, user) {
    const params = {
      page: query.page,
      limit: query.limit,
      orderBy: query.orderBy,
      filter: {},
      filterIn: {},
      term: query.term
    }

    if (query.status) {
      if (Array.isArray(query.status)) {
        params.filterIn['stories.status'] = query.status
      } else {
        params.filter['stories.status'] = query.status
      }
    }

    if (query.type) {
      if (Array.isArray(query.type)) {
        params.filterIn['stories.type'] = query.type
      } else {
        params.filter['stories.type'] = query.type
      }
    }

    if (query.priority) {
      if (Array.isArray(query.priority)) {
        params.filterIn['stories.priority'] = query.priority
      } else {
        params.filter['stories.priority'] = query.priority
      }
    }

    if (query.countryId) {
      params.filter['stories.countryId'] = query.countryId
    }

    if (query.userId) {
      params.filter['stories.userId'] = query.userId
    } else if (user.role !== roles.superadmin) {
      params.filter['stories.userId'] = user.id
    }

    if (query.dateFrom) {
      params.filter['stories.createdAt >='] = new Date(query.dateFrom)
    }

    if (query.dateTo) {
      params.filter['stories.createdAt <='] = new Date(query.dateTo)
    }

    return params
  }

  transformStories(data, user, query) {
    if (!data.results || data.results.length === 0) {
      return {
        results: [],
        total: data.total || 0,
        page: query.page,
        limit: query.limit,
        totalPages: data.totalPages || 0,
        hasNext: false,
        hasPrev: query.page > 1
      }
    }

    const results = data.results.map(story => {
      const sanitized = StoryModel.sanitizeForAPI(story, user)
      if (query.include && query.include.includes('stats')) {
        sanitized.stats = StoryModel.getComputedProperties(story)
      }
      sanitized.attachments = this.formatAttachments(story.attachments)
      sanitized.categories = this.formatCategories(story.categories)
      return sanitized
    })

    return {
      results,
      total: data.total,
      page: data.page || query.page,
      limit: data.limit || query.limit,
      totalPages: data.totalPages || Math.ceil(data.total / query.limit),
      hasNext: data.hasNext || query.page < Math.ceil(data.total / query.limit),
      hasPrev: data.hasPrev || query.page > 1
    }
  }

  buildListResponse(data, queryParams) {
    const pagination = {
      page: data.page,
      limit: data.limit,
      total: data.total,
      totalPages: data.totalPages,
      hasNext: data.hasNext,
      hasPrev: data.hasPrev
    }

    return {
      data: data.results,
      headers: {
        'X-Total-Count': data.total,
        'X-Page': data.page,
        'X-Limit': data.limit,
        'X-Total-Pages': data.totalPages
      },
      pagination,
      meta: {
        cached: false,
        orderBy: queryParams.orderBy,
        filtersApplied: Object.keys(queryParams.filter).length + Object.keys(queryParams.filterIn).length,
        page: data.page,
        limit: data.limit
      }
    }
  }

  buildRelations(includes = []) {
    const baseRelations = ['tags', 'owner', 'attachments', 'categories']
    const availableRelations = {
      tags: 'tags',
      owner: 'owner.[profileImage]',
      country: 'country',
      attachments: 'attachments',
      categories: 'categories',
      editor: 'editor.[user]',
      stats: ''
    }

    const relations = [...baseRelations]
    includes.forEach(include => {
      if (availableRelations[include] && !relations.includes(availableRelations[include])) {
        relations.push(availableRelations[include])
      }
    })

    return `[${relations.filter(Boolean).join(', ')}]`
  }

  async getCachedResult(cacheKey) {
    if (!cacheKey || !this.dependencies.has('redisClient')) return null
    try {
      const redis = this.getDependency('redisClient')
      const cached = await redis.getKey(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }
    } catch (error) {
      this.logger.warn('StoryService cache retrieval failed', { cacheKey, error: error.message })
    }
    return null
  }

  async cacheResult(cacheKey, result) {
    if (!cacheKey || !this.dependencies.has('redisClient')) return
    try {
      const redis = this.getDependency('redisClient')
      await redis.setKey(cacheKey, JSON.stringify(result), this.config.caching.ttl)
    } catch (error) {
      this.logger.warn('StoryService cache store failed', { cacheKey, error: error.message })
    }
  }

  shouldBypassCache(query) {
    if (!this.dependencies.has('redisClient') || !this.config.caching.enabled) return true
    if (query.noCache) return true
    if (query.term && this.config.caching.bypassWhen.searchTerm) return true
    if (query.include && query.include.includes('stats') && this.config.caching.bypassWhen.includeStats) return true
    if (query.limit > this.config.caching.bypassWhen.largeLimit) return true
    return false
  }

  generateCacheKey(query, user) {
    const keyData = StoryUtils.sortObject({
      ...query,
      userId: user.id,
      userRole: user.role
    })
    delete keyData.noCache
    const keyString = JSON.stringify(keyData)
    return `stories:list:${Buffer.from(keyString).toString('base64').slice(0, 50)}`
  }

  buildIncludeOptions(query, currentUser) {
    const options = {
      includeUser: true,
      includeTags: true,
      includeAttachments: true
    }

    if (StoryUtils.parseBoolean(query.includeMetadata) && currentUser.role === roles.superadmin) {
      options.includeMetadata = true
      options.includeAuditLog = true
    }

    if (Array.isArray(query.include)) {
      query.include.forEach(include => {
        if (include === 'editor') {
          options.includeEditor = true
        }
      })
    }

    if (StoryUtils.parseBoolean(query.includeDeleted)) {
      options.includeDeleted = true
    }

    return options
  }

  async checkStoryAccess(story, currentUser, query) {
    const requiresOwnership = story.type !== 'STORY' ||
      story.status === 'DRAFT' ||
      story.isPrivate ||
      StoryUtils.parseBoolean(query.includePrivate)

    if (requiresOwnership) {
      await ownerPolicy(story, currentUser)
    }

    if (story.status === 'DELETED' && currentUser.role !== roles.superadmin) {
      throw new ErrorWrapper({
        code: 'STORY_ACCESS_DENIED',
        message: 'Access denied to deleted story',
        statusCode: 403
      })
    }

    if (this.config.security.restrictedTypes.includes(story.type) &&
        story.userId !== currentUser.id &&
        currentUser.role !== roles.superadmin) {
      throw new ErrorWrapper({
        code: 'STORY_ACCESS_DENIED',
        message: 'Access denied to this story type',
        statusCode: 403
      })
    }
  }

  transformStoryResponse(story, currentUser, query) {
    const format = query.format || 'full'
    let transformed = StoryModel.sanitizeForAPI(story, currentUser)

    switch (format) {
      case 'minimal':
        transformed = this.getMinimalFormat(transformed)
        break
      case 'summary':
        transformed = this.getSummaryFormat(transformed)
        break
      case 'full':
      default:
        break
    }

    const computed = StoryModel.getComputedProperties(story)
    transformed = { ...transformed, ...computed }
    transformed.attachments = this.formatAttachments(story.attachments)
    transformed.categories = this.formatCategories(story.categories)
    return transformed
  }

  formatCategories(categories = []) {
    if (!Array.isArray(categories)) return []
    return categories.map(category => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      isActive: category.isActive
    }))
  }

  formatAttachments(attachments = []) {
    if (!Array.isArray(attachments)) return []
    return attachments.map(attachment => ({
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      path: attachment.path,
      category: attachment.category,
      securityStatus: attachment.securityStatus,
      createdAt: attachment.createdAt,
      updatedAt: attachment.updatedAt
    }))
  }

  getMinimalFormat(story) {
    return {
      id: story.id,
      title: story.title,
      status: story.status,
      type: story.type,
      priority: story.priority,
      createdAt: story.createdAt,
      updatedAt: story.updatedAt
    }
  }

  getSummaryFormat(story) {
    const minimal = this.getMinimalFormat(story)
    return {
      ...minimal,
      details: story.details?.substring(0, 200) + (story.details?.length > 200 ? '...' : ''),
      userId: story.userId,
      user: story.user ? {
        id: story.user.id,
        name: story.user.name,
        username: story.user.username
      } : null,
      tagsCount: story.tags?.length || 0,
      attachmentsCount: story.attachments?.length || 0
    }
  }

  async prepareStoryCreation(payload, currentUser) {
    const tagDAO = this.getDependency('tagDAO')
    const storyData = { ...payload }

    if (storyData.location) {
      storyData.latitude = storyData.location.latitude
      storyData.longitude = storyData.location.longitude
      storyData.address = storyData.location.address
      storyData.city = storyData.location.city
      storyData.region = storyData.location.region
      delete storyData.location
    }

    let tagsPrepared = []
    if (storyData.tags && storyData.tags.length > 0) {
      tagsPrepared = await tagDAO.prepareStoryTagsInsertion(storyData.tags, currentUser.id)
    }

    const storyAttachmentService = this.getDependency('storyAttachmentService')

    let attachmentsPrepared = []
    if (storyData.attachments && storyData.attachments.length > 0) {
      attachmentsPrepared = await storyAttachmentService.prepareAttachmentGraph(storyData.attachments)
    }

    return { storyData, tagsPrepared, attachmentsPrepared }
  }

  async prepareStoryUpdate(existingStory, payload, currentUser, transaction) {
    const updateData = { ...payload }
    const expectedVersion = payload.expectedVersion !== undefined ? payload.expectedVersion : null
    const currentVersion = parseInt(existingStory.version, 10) || 1

    if (updateData.tags !== undefined) {
      const tagDAO = this.getDependency('tagDAO')
      const normalizedTags = StoryUtils.normalizeTags(updateData.tags)
      updateData.tags = normalizedTags && normalizedTags.length > 0
        ? await tagDAO.prepareStoryTagsInsertion(normalizedTags, currentUser.id, { transaction })
        : []
    }

    if (updateData.attachments !== undefined) {
      const storyAttachmentService = this.getDependency('storyAttachmentService')
      updateData.attachments = updateData.attachments && updateData.attachments.length > 0
        ? await storyAttachmentService.prepareAttachmentGraph(updateData.attachments, { transaction })
        : []
    }

    if (updateData.location) {
      updateData.latitude = updateData.location.latitude
      updateData.longitude = updateData.location.longitude
      updateData.address = updateData.location.address
      updateData.city = updateData.location.city
      updateData.region = updateData.location.region
      delete updateData.location
    }

    updateData.id = existingStory.id
    updateData.updatedAt = new Date()
    updateData.version = currentVersion + 1
    updateData.lastModifiedBy = currentUser.id
    delete updateData.expectedVersion

    const validation = StoryModel.validateBusinessRules({
      ...existingStory,
      ...updateData,
      currentStatus: existingStory.status
    })
    if (!validation.isValid) {
      throw new ErrorWrapper({
        code: 'BUSINESS_VALIDATION_FAILED',
        message: `Business validation failed: ${validation.errors.join(', ')}`,
        statusCode: 422,
        details: validation.errors
      })
    }

    return { updateData, expectedVersion }
  }

  validateStatusTransition(existingStory, payload, currentUser) {
    if (!payload.status) return

    const currentStatus = existingStory.status
    const newStatus = payload.status

    const allowedTransitions = {
      'DRAFT': ['SUBMITTED', 'DRAFT'],
      'SUBMITTED': ['ASSIGNED', 'DRAFT', 'REJECTED'],
      'ASSIGNED': ['IN_PROGRESS', 'SUBMITTED'],
      'IN_PROGRESS': ['FOR_REVIEW_SE', 'ASSIGNED'],
      'FOR_REVIEW_SE': ['APPROVED', 'IN_PROGRESS', 'REJECTED'],
      'APPROVED': ['PUBLISHED'],
      'PUBLISHED': ['ARCHIVED'],
      'REJECTED': ['DRAFT'],
      'ARCHIVED': []
    }

    if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
      throw new ErrorWrapper({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot change status from ${currentStatus} to ${newStatus}`,
        statusCode: 422,
        details: {
          currentStatus,
          requestedStatus: newStatus,
          allowedStatuses: allowedTransitions[currentStatus] || []
        }
      })
    }

    if (this.config.security.restrictedStatuses.includes(newStatus) && currentUser.role !== roles.superadmin) {
      throw new ErrorWrapper({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Cannot set status to ${newStatus}`,
        statusCode: 403
      })
    }
  }

  stripComputedProperties(target) {
    const computedFields = [
      'isExpired',
      'timeRemaining',
      'duration',
      'ageInDays',
      'daysSinceUpdate',
      'urgencyLevel',
      'progressPercentage',
      'canEdit',
      'canDelete',
      'canArchive',
      'canRestore',
      'isStale',
      'requiresAttention',
      'permissions'
    ]

    computedFields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(target, field)) {
        delete target[field]
      }
    })

    return target
  }

  sanitizeCreatePayload(payload = {}) {
    return StoryUtils.sanitizeTextFields(payload, [
      { key: 'title', maxLength: 500 },
      { key: 'details', maxLength: 10000 }
    ])
  }

  sanitizeUpdatePayload(payload = {}) {
    const sanitized = StoryUtils.sanitizeTextFields(payload, [
      { key: 'title', maxLength: 500 },
      { key: 'details', maxLength: 10000 }
    ])

    if (sanitized.expectedVersion !== undefined && sanitized.expectedVersion !== null) {
      const parsedVersion = parseInt(sanitized.expectedVersion, 10)
      if (Number.isNaN(parsedVersion) || parsedVersion < 1) {
        throw new ErrorWrapper({
          code: 'INVALID_VERSION',
          message: 'expectedVersion must be a positive integer',
          statusCode: 400
        })
      }
      sanitized.expectedVersion = parsedVersion
    }

    Object.keys(sanitized).forEach(key => {
      if (sanitized[key] === undefined) {
        delete sanitized[key]
      }
    })

    return sanitized
  }

  async checkCreationPermissions(currentUser, storyData) {
    const restrictedTypes = this.config.security?.restrictedTypes || []
    if (storyData.type && restrictedTypes.includes(storyData.type) && currentUser.role !== roles.superadmin) {
      throw new ErrorWrapper({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Cannot create stories of type ${storyData.type}`,
        statusCode: 403
      })
    }

    const restrictedStatuses = this.config.security?.restrictedStatuses || []
    if (storyData.status && restrictedStatuses.includes(storyData.status) && currentUser.role !== roles.superadmin) {
      throw new ErrorWrapper({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Cannot create stories with status ${storyData.status}`,
        statusCode: 403
      })
    }
  }

  async enforceCreateRateLimit(currentUser) {
    if (!this.dependencies.has('redisClient')) return

    try {
      const redis = this.getDependency('redisClient')
      const rateKey = `story_create_rate:${currentUser.id}`
      const currentCountRaw = await redis.getKey(rateKey)
      const currentCount = parseInt(currentCountRaw || '0', 10)
      const maxCreationsPerHour = currentUser.role === roles.superadmin ? 100 : 10

      if (currentCount >= maxCreationsPerHour) {
        this.emit('story:rate_limited', {
          userId: currentUser.id,
          currentCount,
          maxCreationsPerHour
        })
        throw new ErrorWrapper({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many story creation attempts. Please try again later.',
          statusCode: 429
        })
      }

      await redis.setKey(rateKey, currentCount + 1, 3600)
    } catch (error) {
      if (error instanceof ErrorWrapper) {
        throw error
      }
      this.logger.warn('Story creation rate limit check failed', { error: error.message })
    }
  }

  async checkDuplicateStory(storyData, currentUser) {
    try {
      const storyDAO = this.getDependency('storyDAO')
      const recentStories = await storyDAO.query()
        .where('userId', currentUser.id)
        .where('title', storyData.title)
        .where('createdAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .whereNull('deletedAt')
        .limit(1)

      if (recentStories.length > 0) {
        this.emit('story:duplicate_detected', {
          userId: currentUser.id,
          existingStoryId: recentStories[0].id,
          title: storyData.title
        })
        throw new ErrorWrapper({
          code: 'DUPLICATE_STORY',
          message: 'A story with the same title was recently created',
          statusCode: 409,
          details: { existingStoryId: recentStories[0].id }
        })
      }
    } catch (error) {
      if (error.code === 'DUPLICATE_STORY') {
        throw error
      }
      this.logger.warn('Story duplicate check failed', { error: error.message })
    }
  }

  async postCreationProcessing(story, user) {
    try {
      if (story.status === 'SUBMITTED') {
        this.logger.info('Story submission notification', {
          storyId: story.id,
          userId: user.id,
          title: story.title
        })
      }

      this.logger.debug('Story indexed for search', { storyId: story.id })
    } catch (error) {
      this.logger.warn('Post-creation processing failed', {
        storyId: story.id,
        error: error.message
      })
    }
  }

  checkUpdatePermissions(existingStory, updateData, currentUser) {
    const restrictedFields = ['type', 'parentId']
    const hasRestrictedUpdate = restrictedFields.some(field => Object.prototype.hasOwnProperty.call(updateData, field))

    if (hasRestrictedUpdate && currentUser.role !== roles.superadmin) {
      throw new ErrorWrapper({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Cannot update restricted fields',
        statusCode: 403
      })
    }

    if (updateData.status) {
      const restrictedStatuses = this.config.security?.restrictedStatuses || []
      if (restrictedStatuses.includes(updateData.status) && currentUser.role !== roles.superadmin) {
        throw new ErrorWrapper({
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Cannot set status to ${updateData.status}`,
          statusCode: 403
        })
      }
    }
  }

  checkVersionConflicts(existingStory, updateData) {
    if (updateData.expectedVersion !== undefined && updateData.expectedVersion !== null) {
      const currentVersion = parseInt(existingStory.version, 10) || 0
      if (currentVersion !== updateData.expectedVersion) {
        throw new ErrorWrapper({
          code: 'VERSION_CONFLICT',
          message: 'Story has been modified by another user. Please refresh and try again.',
          statusCode: 409,
          details: {
            currentVersion,
            expectedVersion: updateData.expectedVersion
          }
        })
      }
    }
  }

  async postUpdateProcessing(existingStory, updatedStory, currentUser) {
    try {
      if (existingStory.status !== updatedStory.status) {
        this.logger.info('Story status change', {
          storyId: updatedStory.id,
          fromStatus: existingStory.status,
          toStatus: updatedStory.status,
          userId: currentUser.id
        })
      }

      if (existingStory.title !== updatedStory.title || existingStory.details !== updatedStory.details) {
        this.logger.debug('Story content updated - reindexing', { storyId: updatedStory.id })
      }
    } catch (error) {
      this.logger.warn('Post-update processing failed', {
        storyId: updatedStory.id,
        error: error.message
      })
    }
  }

  async checkDeletionPermissions(story, currentUser, permanent) {
    await isOwnerPolicy(story, currentUser)

    if (permanent && currentUser.role !== roles.superadmin) {
      throw new ErrorWrapper({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only super admins can permanently delete stories',
        statusCode: 403
      })
    }

    if (story.deletedAt && !permanent) {
      throw new ErrorWrapper({
        code: 'STORY_ALREADY_DELETED',
        message: 'Story is already deleted',
        statusCode: 410
      })
    }
  }

  async validateDeletionRules(story, currentUser, query, permanent) {
    const deletableStatuses = ['DRAFT', 'REJECTED', 'DELETED']

    if (!deletableStatuses.includes(story.status) && currentUser.role !== roles.superadmin && !permanent) {
      throw new ErrorWrapper({
        code: 'INVALID_STORY_STATUS',
        message: `Cannot delete story with status ${story.status}. Only ${deletableStatuses.join(', ')} stories can be deleted.`,
        statusCode: 422,
        details: {
          currentStatus: story.status,
          deletableStatuses
        }
      })
    }

    await this.checkDependentRelationships(story, query)

    if (story.status === 'PUBLISHED' && !query.reason && !permanent) {
      throw new ErrorWrapper({
        code: 'DELETION_REASON_REQUIRED',
        message: 'Deletion reason is required for published stories',
        statusCode: 422
      })
    }
  }

  async checkDependentRelationships(story, query) {
    try {
      const storyDAO = this.getDependency('storyDAO')
      const childStories = await storyDAO.query()
        .where('parentId', story.id)
        .whereNull('deletedAt')
        .limit(1)

      if (childStories.length > 0 && !StoryUtils.parseBoolean(query.permanent)) {
        throw new ErrorWrapper({
          code: 'HAS_DEPENDENT_STORIES',
          message: 'Cannot delete story that has child stories. Delete child stories first or use permanent deletion.',
          statusCode: 422,
          details: { hasChildStories: true }
        })
      }
    } catch (error) {
      if (error.code && error.statusCode) {
        throw error
      }
      this.logger.warn('Story dependency check failed', {
        storyId: story.id,
        error: error.message
      })
    }
  }

  async postDeletionProcessing(story, currentUser, query) {
    try {
      this.logger.info('Story deletion processed', {
        storyId: story.id,
        deletionType: StoryUtils.parseBoolean(query.permanent) ? 'permanent' : 'soft',
        userId: currentUser.id
      })
    } catch (error) {
      this.logger.warn('Post-deletion processing failed', {
        storyId: story.id,
        error: error.message
      })
    }
  }

  async performSoftDeletion(story, currentUser, query, transaction) {
    const storyDAO = this.getDependency('storyDAO')
    const updateData = {
      status: 'DELETED',
      deletedAt: new Date(),
      deletedBy: currentUser.id,
      deletionReason: query.reason || 'User requested deletion',
      version: (story.version || 1) + 1,
      updatedAt: new Date()
    }

    await storyDAO.baseUpdate(story.id, updateData, { transaction })
  }

  async performPermanentDeletion(story, transaction) {
    const storyDAO = this.getDependency('storyDAO')
    await this.deleteRelatedRecords(story.id, transaction)
    await storyDAO.query(transaction).deleteById(story.id)
  }

  async deleteRelatedRecords(storyId, transaction) {
    const storyDAO = this.getDependency('storyDAO')
    try {
      await storyDAO.relatedQuery('tags', transaction)
        .for(storyId)
        .delete()

      await storyDAO.relatedQuery('attachments', transaction)
        .for(storyId)
        .delete()
    } catch (error) {
      this.logger.warn('Failed to delete some related records', {
        storyId,
        error: error.message
      })
    }
  }

  async clearRelatedCaches(userId, type, status) {
    try {
      this.logger.debug('Related story caches cleared', {
        userId,
        type,
        status
      })
    } catch (error) {
      this.logger.warn('Cache clearing failed', { error: error.message })
    }
  }
}

module.exports = StoryService
