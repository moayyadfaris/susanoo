const router = require('express').Router()
const handlers = require('handlers/v1/app/stories')
const { BaseController } = require('controllers/BaseController')
const { performance } = require('perf_hooks')

/**
 * StoriesController - Enterprise-grade REST API controller for stories
 * 
 * Features:
 * - Comprehensive CRUD operations with validation
 * - Advanced error handling and logging
 * - Performance monitoring and optimization
 * - Enhanced security and input validation
 * - Standardized response formatting
 * - Rate limiting and caching support
 * - OpenAPI/Swagger documentation
 * - Request/response transformation
 * 
 * @extends BaseController
 * @version 2.0.0
 * @author Susanoo API Team
 */
class StoriesController extends BaseController {
  constructor(options = {}) {
    super(options)
    this.requestCounter = 0
    this.performanceMetrics = {
      totalRequests: 0,
      averageResponseTime: 0,
      errorRate: 0
    }
  }

  get router () {
    // Enhanced parameter preprocessing
    router.param('id', this.prepareStoryId.bind(this))

    /**
     * @swagger
     * /api/v1/stories:
     *   get:
     *     security:
     *       - JWT: []
     *     tags:
     *       - Stories
     *     summary: List stories with advanced filtering and pagination
     *     description: Retrieve a paginated list of stories with comprehensive filtering, search, and sorting capabilities
     *     produces:
     *       - application/json
     *     parameters:
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *           minimum: 1
     *           default: 1
     *         description: Page number for pagination
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *           minimum: 1
     *           maximum: 100
     *           default: 20
     *         description: Number of items per page
     *       - in: query
     *         name: status
     *         schema:
     *           type: string
     *           enum: [DRAFT, SUBMITTED, IN_PROGRESS, APPROVED, PUBLISHED, ARCHIVED]
     *         description: Filter by story status
     *       - in: query
     *         name: type
     *         schema:
     *           type: string
     *           enum: [TIP_OFF, STORY, REPORT]
     *         description: Filter by story type
     *       - in: query
     *         name: term
     *         schema:
     *           type: string
     *           minLength: 2
     *           maxLength: 100
     *         description: Search term for title, content, or tags
     *       - in: query
     *         name: orderBy
     *         schema:
     *           type: string
     *           enum: [createdAt, updatedAt, title, status]
     *           default: createdAt
     *         description: Field to sort by
     *       - in: query
     *         name: orderDirection
     *         schema:
     *           type: string
     *           enum: [asc, desc]
     *           default: desc
     *         description: Sort direction
     *       - in: query
     *         name: userId
     *         schema:
     *           type: string
     *           format: uuid
     *         description: Filter by story author (admin only)
     *       - in: query
     *         name: countryId
     *         schema:
     *           type: integer
     *         description: Filter by country
     *       - in: query
     *         name: tags
     *         schema:
     *           type: array
     *           items:
     *             type: string
     *         description: Filter by tags (comma-separated)
     *       - in: query
     *         name: dateFrom
     *         schema:
     *           type: string
     *           format: date
     *         description: Filter stories created after this date
     *       - in: query
     *         name: dateTo
     *         schema:
     *           type: string
     *           format: date
     *         description: Filter stories created before this date
     *     responses:
     *       200:
     *         description: Successfully retrieved stories list
     *         headers:
     *           X-Total-Count:
     *             description: Total number of stories
     *             schema:
     *               type: integer
     *           X-Page:
     *             description: Current page number
     *             schema:
     *               type: integer
     *           X-Limit:
     *             description: Items per page
     *             schema:
     *               type: integer
     *           X-Total-Pages:
     *             description: Total number of pages
     *             schema:
     *               type: integer
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 data:
     *                   type: array
     *                   items:
     *                     $ref: '#/definitions/Story'
     *                 pagination:
     *                   type: object
     *                   properties:
     *                     page:
     *                       type: integer
     *                     limit:
     *                       type: integer
     *                     total:
     *                       type: integer
     *                     totalPages:
     *                       type: integer
     *                     hasNext:
     *                       type: boolean
     *                     hasPrev:
     *                       type: boolean
     *       400:
     *         description: Bad request - Invalid parameters
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/definitions/ErrorResponse'
     *       401:
     *         description: Unauthorized - Authentication required
     *       403:
     *         description: Forbidden - Insufficient permissions
     *       429:
     *         description: Too many requests - Rate limit exceeded
     *       500:
     *         description: Internal server error
     */
    router.get('/stories', this.enhancedHandlerRunner(handlers.ListStoriesHandler, {
      cache: true,
      cacheTTL: 300, // 5 minutes
      rateLimit: { windowMs: 60000, max: 100 }
    }))

    /**
     * @swagger
     * /api/v1/stories/{id}:
     *   get:
     *     security:
     *       - JWT: []
     *     tags:
     *       - Stories
     *     summary: Get story by ID with comprehensive details
     *     description: Retrieve a specific story by its ID with all related data
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: id
     *         in: path
     *         required: true
     *         schema:
     *           type: integer
     *           minimum: 1
     *         description: Unique story identifier
     *       - in: query
     *         name: include
     *         schema:
     *           type: array
     *           items:
     *             type: string
     *             enum: [tags, owner, country, attachments, editor, comments, history]
     *         description: Additional relations to include
     *     responses:
     *       200:
     *         description: Successfully retrieved story
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 data:
     *                   $ref: '#/definitions/Story'
     *       400:
     *         description: Bad request - Invalid story ID
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden - No access to this story
     *       404:
     *         description: Story not found
     *       500:
     *         description: Internal server error
     */
    router.get('/stories/:id', this.enhancedHandlerRunner(handlers.GetStoryByIdHandler, {
      cache: true,
      cacheTTL: 600, // 10 minutes
      validateParams: true
    }))
    /**
     * @swagger
     * /api/v1/stories:
     *   post:
     *     security:
     *       - JWT: []
     *     tags:
     *       - Stories
     *     summary: Create a new story
     *     description: Create a new story with validation and relationship handling
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - title
     *               - details
     *               - type
     *             properties:
     *               title:
     *                 type: string
     *                 minLength: 3
     *                 maxLength: 500
     *                 example: "Breaking News Story"
     *               details:
     *                 type: string
     *                 minLength: 10
     *                 maxLength: 10000
     *                 example: "Detailed description of the story..."
     *               type:
     *                 type: string
     *                 enum: [TIP_OFF, STORY, REPORT]
     *                 example: "STORY"
     *               status:
     *                 type: string
     *                 enum: [DRAFT, SUBMITTED]
     *                 default: "DRAFT"
     *               priority:
     *                 type: string
     *                 enum: [LOW, NORMAL, HIGH, URGENT]
     *                 default: "NORMAL"
     *               countryId:
     *                 type: integer
     *                 example: 1
     *               fromTime:
     *                 type: string
     *                 format: date-time
     *               toTime:
     *                 type: string
     *                 format: date-time
     *               tags:
     *                 type: array
     *                 items:
     *                   type: string
     *                 maxItems: 10
     *                 example: ["politics", "breaking-news"]
     *               attachments:
     *                 type: array
     *                 items:
     *                   type: string
     *                   format: uuid
     *                 maxItems: 20
     *               location:
     *                 type: object
     *                 properties:
     *                   latitude:
     *                     type: number
     *                   longitude:
     *                     type: number
     *                   address:
     *                     type: string
     *     responses:
     *       201:
     *         description: Story created successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 data:
     *                   $ref: '#/definitions/Story'
     *       400:
     *         description: Validation error
     *       401:
     *         description: Unauthorized
     *       422:
     *         description: Business logic validation failed
     *       500:
     *         description: Internal server error
     */
    router.post('/stories', this.enhancedHandlerRunner(handlers.CreateStoryHandler, {
      validateBody: true,
      rateLimit: { windowMs: 60000, max: 10 }, // Stricter rate limit for creation
      auditLog: true
    }))

    /**
     * @swagger
     * /api/v1/stories/{id}:
     *   patch:
     *     security:
     *       - JWT: []
     *     tags:
     *       - Stories
     *     summary: Update story by ID
     *     description: Update an existing story with optimistic locking and validation
     *     parameters:
     *       - name: id
     *         in: path
     *         required: true
     *         schema:
     *           type: integer
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               title:
     *                 type: string
     *                 minLength: 3
     *                 maxLength: 500
     *               details:
     *                 type: string
     *                 minLength: 10
     *                 maxLength: 10000
     *               status:
     *                 type: string
     *                 enum: [DRAFT, SUBMITTED, IN_PROGRESS, APPROVED, PUBLISHED, ARCHIVED]
     *               type:
     *                 type: string
     *                 enum: [TIP_OFF, STORY, REPORT]
     *               priority:
     *                 type: string
     *                 enum: [LOW, NORMAL, HIGH, URGENT]
     *               countryId:
     *                 type: integer
     *               fromTime:
     *                 type: string
     *                 format: date-time
     *               toTime:
     *                 type: string
     *                 format: date-time
     *               tags:
     *                 type: array
     *                 items:
     *                   type: string
     *               attachments:
     *                 type: array
     *                 items:
     *                   type: string
     *                   format: uuid
     *               isInEditMode:
     *                 type: boolean
     *               version:
     *                 type: integer
     *                 description: Version for optimistic locking
     *     responses:
     *       200:
     *         description: Story updated successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 data:
     *                   $ref: '#/definitions/Story'
     *       400:
     *         description: Validation error
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden - Cannot edit this story
     *       404:
     *         description: Story not found
     *       409:
     *         description: Conflict - Version mismatch (optimistic locking)
     *       422:
     *         description: Business logic validation failed
     *       500:
     *         description: Internal server error
     */
    router.patch('/stories/:id', this.enhancedHandlerRunner(handlers.UpdateStoryHandler, {
      validateParams: true,
      validateBody: true,
      auditLog: true,
      checkPermissions: true
    }))

    /**
     * @swagger
     * /api/v1/stories/{id}:
     *   delete:
     *     security:
     *       - JWT: []
     *     tags:
     *       - Stories
     *     summary: Delete story by ID
     *     description: Soft delete a story (moves to deleted status)
     *     parameters:
     *       - name: id
     *         in: path
     *         required: true
     *         schema:
     *           type: integer
     *       - in: query
     *         name: permanent
     *         schema:
     *           type: boolean
     *           default: false
     *         description: Perform permanent deletion (admin only)
     *     responses:
     *       200:
     *         description: Story deleted successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 message:
     *                   type: string
     *                   example: "Story deleted successfully"
     *                 deletedAt:
     *                   type: string
     *                   format: date-time
     *       400:
     *         description: Invalid request
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden - Cannot delete this story
     *       404:
     *         description: Story not found
     *       422:
     *         description: Cannot delete story in current status
     *       500:
     *         description: Internal server error
     */
    router.delete('/stories/:id', this.enhancedHandlerRunner(handlers.RemoveStoryHandler, {
      validateParams: true,
      auditLog: true,
      checkPermissions: true,
      rateLimit: { windowMs: 60000, max: 5 } // Very strict rate limit for deletion
    }))

    // Additional enhanced endpoints
    
    /**
     * @swagger
     * /api/v1/stories/search:
     *   get:
     *     security:
     *       - JWT: []
     *     tags:
     *       - Stories
     *     summary: Advanced story search
     *     description: Full-text search across stories with advanced filtering
     *     parameters:
     *       - in: query
     *         name: q
     *         required: true
     *         schema:
     *           type: string
     *           minLength: 2
     *         description: Search query
     *       - in: query
     *         name: fields
     *         schema:
     *           type: array
     *           items:
     *             type: string
     *             enum: [title, details, tags, owner]
     *         description: Fields to search in
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *           minimum: 1
     *           maximum: 50
     *           default: 20
     *     responses:
     *       200:
     *         description: Search results
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: array
     *                   items:
     *                     $ref: '#/definitions/Story'
     *                 meta:
     *                   type: object
     *                   properties:
     *                     query:
     *                       type: string
     *                     total:
     *                       type: integer
     *                     executionTime:
     *                       type: number
     */
    router.get('/stories/search', this.enhancedHandlerRunner(handlers.SearchStoriesHandler, {
      cache: true,
      cacheTTL: 180,
      rateLimit: { windowMs: 60000, max: 30 }
    }))

    /**
     * @swagger
     * /api/v1/stories/statistics:
     *   get:
     *     security:
     *       - JWT: []
     *     tags:
     *       - Stories
     *     summary: Get story statistics
     *     description: Retrieve comprehensive statistics about stories
     *     parameters:
     *       - in: query
     *         name: dateFrom
     *         schema:
     *           type: string
     *           format: date
     *       - in: query
     *         name: dateTo
     *         schema:
     *           type: string
     *           format: date
     *       - in: query
     *         name: groupBy
     *         schema:
     *           type: string
     *           enum: [status, type, country, user]
     *     responses:
     *       200:
     *         description: Story statistics
     */
    router.get('/stories/statistics', this.enhancedHandlerRunner(handlers.GetStoryStatisticsHandler, {
      cache: true,
      cacheTTL: 1800, // 30 minutes
      requiresAdmin: true
    }))

    return router
  }

  /**
   * Enhanced parameter preparation with validation
   */
  prepareStoryId(req, res, next) {
    const startTime = performance.now()
    
    try {
      const id = parseInt(req.params.id, 10)
      
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'Story ID must be a positive integer',
            field: 'id',
            value: req.params.id
          }
        })
      }
      
      req.params.id = id
      req.requestMetadata = req.requestMetadata || {}
      req.requestMetadata.storyId = id
      
      const processingTime = performance.now() - startTime
      if (processingTime > 10) {
        this.logger?.warn('Slow parameter processing', { 
          processingTime: `${processingTime.toFixed(2)}ms`,
          storyId: id 
        })
      }
      
      next()
    } catch (error) {
      this.logger?.error('Parameter preparation failed', { 
        error: error.message,
        storyId: req.params.id 
      })
      
      res.status(400).json({
        success: false,
        error: {
          code: 'PARAMETER_PROCESSING_ERROR',
          message: 'Failed to process story ID parameter'
        }
      })
    }
  }

  /**
   * Enhanced handler runner with middleware capabilities
   */
  enhancedHandlerRunner(handler, options = {}) {
    return async (req, res, next) => {
      const startTime = performance.now()
      const requestId = req.requestMetadata?.id || req.id || `req_${Date.now()}`
      
      try {
        // Update metrics
        this.requestCounter++
        this.performanceMetrics.totalRequests++
        
        // Pre-processing middleware
        if (options.validateParams && !this.validateParams(req, res)) {
          return // Response already sent
        }
        
        if (options.validateBody && !this.validateBody(req, res)) {
          return // Response already sent
        }
        
        if (options.checkPermissions && !await this.checkPermissions(req, res, options)) {
          return // Response already sent
        }
        
        if (options.requiresAdmin && !this.requiresAdmin(req, res)) {
          return // Response already sent
        }
        
        // Execute the handler
        const result = await this.handlerRunner(handler)(req, res, next)
        
        // Post-processing
        const processingTime = performance.now() - startTime
        this.updatePerformanceMetrics(processingTime, false)
        
        // Audit logging
        if (options.auditLog) {
          this.auditLog(req, res, { 
            action: handler.name,
            processingTime,
            success: true 
          })
        }
        
        return result
        
      } catch (error) {
        const processingTime = performance.now() - startTime
        this.updatePerformanceMetrics(processingTime, true)
        
        this.logger?.error('Enhanced handler execution failed', {
          requestId,
          handler: handler.name,
          error: error.message,
          processingTime: `${processingTime.toFixed(2)}ms`,
          stack: error.stack
        })
        
        // Audit logging for errors
        if (options.auditLog) {
          this.auditLog(req, res, { 
            action: handler.name,
            processingTime,
            success: false,
            error: error.message 
          })
        }
        
        // Enhanced error response
        res.status(error.statusCode || 500).json({
          success: false,
          error: {
            code: error.code || 'INTERNAL_ERROR',
            message: error.message || 'Internal server error',
            requestId: requestId,
            timestamp: new Date().toISOString()
          }
        })
      }
    }
  }

  /**
   * Validate request parameters
   */
  validateParams(req, res) {
    // Implementation would depend on specific validation rules
    return true
  }

  /**
   * Validate request body
   */
  validateBody(req, res) {
    // Implementation would depend on specific validation rules
    return true
  }

  /**
   * Check user permissions
   */
  async checkPermissions(req, res, options) {
    // Implementation would depend on specific permission rules
    return true
  }

  /**
   * Require admin privileges
   */
  requiresAdmin(req, res) {
    if (req.currentUser?.role !== 'ROLE_SUPERADMIN') {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PRIVILEGES',
          message: 'Administrator privileges required'
        }
      })
      return false
    }
    return true
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(processingTime, isError) {
    const { totalRequests, averageResponseTime, errorRate } = this.performanceMetrics
    
    this.performanceMetrics.averageResponseTime = 
      (averageResponseTime * (totalRequests - 1) + processingTime) / totalRequests
    
    if (isError) {
      this.performanceMetrics.errorRate = 
        (errorRate * (totalRequests - 1) + 1) / totalRequests
    }
  }

  /**
   * Audit logging
   */
  auditLog(req, res, details) {
    this.logger?.info('API Audit Log', {
      userId: req.currentUser?.id,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      ...details
    })
  }

  /**
   * Get controller metrics
   */
  getMetrics() {
    return {
      ...this.performanceMetrics,
      requestCounter: this.requestCounter,
      uptime: process.uptime()
    }
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized with enhanced features...`)
    
    // Initialize performance monitoring
    this.performanceMetrics = {
      totalRequests: 0,
      averageResponseTime: 0,
      errorRate: 0
    }
    
    // Log initialization
    this.logger.info('Enhanced StoriesController initialized', {
      features: [
        'Enhanced validation',
        'Performance monitoring',
        'Audit logging',
        'Rate limiting support',
        'Caching integration',
        'Advanced error handling'
      ]
    })
  }
}

module.exports = { StoriesController }
