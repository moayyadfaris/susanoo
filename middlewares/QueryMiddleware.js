const { BaseMiddleware, ErrorWrapper, errorCodes } = require('backend-core')
const logger = require('../util/logger')
const crypto = require('crypto')

/**
 * Enhanced Query Middleware with comprehensive query processing and validation
 */
class QueryMiddleware extends BaseMiddleware {
  constructor(options = {}) {
    super(options)
    
    // Configuration with defaults
    this.config = {
      // Language settings
      supportedLanguages: options.supportedLanguages || ['ar', 'en'],
      defaultLanguage: options.defaultLanguage || 'en',
      
      // Pagination settings
      defaultPage: options.defaultPage || 0,
      defaultLimit: options.defaultLimit || 10,
      maxLimit: options.maxLimit || 1000,
      minLimit: options.minLimit || 1,
      
      // Sorting settings
      defaultSortField: options.defaultSortField || 'createdAt',
      defaultSortDirection: options.defaultSortDirection || 'desc',
      allowedSortDirections: ['asc', 'desc'],
      
      // Filtering settings
      maxFilterDepth: options.maxFilterDepth || 3,
      allowedFilterOperators: options.allowedFilterOperators || [
        'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'like', 'regex'
      ],
      
      // Security settings
      enableSanitization: options.enableSanitization !== false,
      enableValidation: options.enableValidation !== false,
      
      // Metadata settings
      addProcessingMetadata: options.addProcessingMetadata || false, // Disabled by default
      
      // Performance settings
      enableCaching: options.enableCaching || false,
      enableCompression: options.enableCompression || false,
      enableLogging: options.enableLogging !== false
    }
  }
  
  async init() {
    logger.debug(`${this.constructor.name} initialized with config:`, {
      supportedLanguages: this.config.supportedLanguages,
      defaultLanguage: this.config.defaultLanguage,
      maxLimit: this.config.maxLimit,
      enableSanitization: this.config.enableSanitization,
      enableValidation: this.config.enableValidation
    })
  }

  handler() {
    return async (req, res, next) => {
      const startTime = Date.now()
      
      try {
        // Generate request ID for tracking
        req.queryProcessingId = this.generateRequestId()
        
        // Process request headers
        await this.processHeaders(req)
        
        // Process and validate query parameters
        await this.processQueryParameters(req)
        
        // Apply security measures
        await this.applySecurity(req)
        
        // Log request processing if enabled
        if (this.config.enableLogging) {
          this.logQueryProcessing(req, Date.now() - startTime)
        }
        
        next()
      } catch (error) {
        this.handleError(error, req, next, Date.now() - startTime)
      }
    }
  }
  
  /**
   * Processes request headers including language validation
   */
  async processHeaders(req) {
    // Process language header
    const acceptLanguage = req.headers['Language'] || 
                          req.headers['language'] || 
                          req.headers['accept-language']
    
    if (acceptLanguage) {
      const language = this.parseLanguage(acceptLanguage)
      
      if (!this.config.supportedLanguages.includes(language)) {
        throw new ErrorWrapper({
          ...errorCodes.BAD_REQUEST,
          message: `Invalid language '${language}'. Supported languages: [${this.config.supportedLanguages.join(', ')}]`,
          context: {
            provided: language,
            supported: this.config.supportedLanguages
          }
        })
      }
      
      req.language = language
    } else {
      req.language = this.config.defaultLanguage
    }
    
    // Process other important headers
    req.userAgent = req.headers['user-agent'] || 'unknown'
    req.deviceType = req.headers['device-type'] || 'unknown'
    req.clientVersion = req.headers['client-version'] || null
  }
  
  /**
   * Processes and validates query parameters
   */
  async processQueryParameters(req) {
    if (req.method === 'GET') {
      // Process pagination
      const pagination = this.processPagination(req.query)
      
      // Process sorting
      const sorting = this.processSorting(req.query)
      
      // Process filtering
      const filtering = await this.processFiltering(req.query)
      
      // Process search
      const search = this.processSearch(req.query)
      
      // Process field selection
      const fields = this.processFields(req.query)
      
      // Process includes
      const includes = this.processIncludes(req.query)
      
      // Sanitize all query parameters
      let sanitizedQuery = req.query
      if (this.config.enableSanitization) {
        sanitizedQuery = this.sanitizeQuery(req.query)
      }
      
      // Merge processed parameters using Object.assign to ensure proper prototype
      const processedQuery = Object.assign({}, {
        ...sanitizedQuery,
        ...pagination,
        ...sorting,
        ...filtering,
        ...search,
        ...fields,
        ...includes
      })
      
      // Add metadata only if enabled
      if (this.config.addProcessingMetadata) {
        processedQuery._processed = true
        processedQuery._processingId = req.queryProcessingId
        processedQuery._timestamp = Date.now()
      }
      
      // Clean up legacy parameters
      this.cleanupLegacyParameters(processedQuery)
      
      // Safely replace query - handle getter-only property
      try {
        // Try direct assignment first
        req.query = processedQuery
      } catch (error) {
        // If direct assignment fails, use Object.defineProperty
        try {
          Object.defineProperty(req, 'query', {
            value: processedQuery,
            writable: true,
            enumerable: true,
            configurable: true
          })
        } catch (defineError) {
          // Last resort: modify existing query object in place
          if (typeof req.query === 'object' && req.query !== null) {
            // Clear existing properties
            Object.keys(req.query).forEach(key => {
              delete req.query[key]
            })
            // Copy new properties
            Object.assign(req.query, processedQuery)
          }
        }
      }
      
    } else {
      // For non-GET requests, still sanitize query if present
      if (this.config.enableSanitization && req.query) {
        const sanitizedQuery = this.sanitizeQuery(req.query)
        const finalQuery = Object.assign({}, sanitizedQuery)
        
        try {
          // Try direct assignment first
          req.query = finalQuery
        } catch (error) {
          // If direct assignment fails, use Object.defineProperty
          try {
            Object.defineProperty(req, 'query', {
              value: finalQuery,
              writable: true,
              enumerable: true,
              configurable: true
            })
          } catch (defineError) {
            // Last resort: modify existing query object in place
            if (typeof req.query === 'object' && req.query !== null) {
              // Clear existing properties
              Object.keys(req.query).forEach(key => {
                delete req.query[key]
              })
              // Copy new properties
              Object.assign(req.query, finalQuery)
            }
          }
        }
      }
    }
  }
  
  /**
   * Processes pagination parameters
   */
  processPagination(query) {
    let page = parseInt(query.page, 10)
    let limit = parseInt(query.limit, 10)
    let offset = parseInt(query.offset, 10)
    
    // Validate and set defaults
    if (isNaN(page) || page < 0) {
      page = this.config.defaultPage
    }
    
    if (isNaN(limit) || limit < this.config.minLimit || limit > this.config.maxLimit) {
      limit = this.config.defaultLimit
    }
    
    if (isNaN(offset) || offset < 0) {
      offset = page * limit
    }
    
    return { page, limit, offset }
  }
  
  /**
   * Processes sorting parameters
   */
  processSorting(query) {
    let orderBy = {
      field: this.config.defaultSortField,
      direction: this.config.defaultSortDirection
    }
    
    // Handle legacy parameters
    if (query.orderByField || query.orderByDirection) {
      orderBy.field = query.orderByField || orderBy.field
      orderBy.direction = query.orderByDirection || orderBy.direction
    }
    
    // Handle modern orderBy parameter
    if (query.orderBy) {
      if (typeof query.orderBy === 'string') {
        // Parse "field:direction" format
        const parts = query.orderBy.split(':')
        if (parts.length === 2) {
          orderBy.field = parts[0].trim()
          orderBy.direction = parts[1].trim()
        }
      } else if (typeof query.orderBy === 'object') {
        orderBy = { ...orderBy, ...query.orderBy }
      }
    }
    
    // Handle sort parameter (array of sort criteria)
    let sort = null
    if (query.sort) {
      if (Array.isArray(query.sort)) {
        sort = query.sort.map(s => this.parseSortCriteria(s))
      } else if (typeof query.sort === 'string') {
        sort = [this.parseSortCriteria(query.sort)]
      }
    }
    
    // Validate direction
    if (!this.config.allowedSortDirections.includes(orderBy.direction)) {
      orderBy.direction = this.config.defaultSortDirection
    }
    
    const result = { orderBy }
    if (sort) result.sort = sort
    
    return result
  }
  
  /**
   * Processes filtering parameters
   */
  async processFiltering(query) {
    let filter = {}
    
    if (query.filter) {
      if (typeof query.filter === 'string') {
        try {
          filter = JSON.parse(query.filter)
        } catch (error) {
          throw new ErrorWrapper({
            ...errorCodes.BAD_REQUEST,
            message: 'Invalid filter format. Must be valid JSON.',
            context: { filter: query.filter, error: error.message }
          })
        }
      } else if (typeof query.filter === 'object') {
        filter = query.filter
      }
      
      // Validate filter structure
      this.validateFilterStructure(filter)
    }
    
    return { filter }
  }
  
  /**
   * Processes search parameters
   */
  processSearch(query) {
    const result = {}
    
    if (query.search && typeof query.search === 'string') {
      result.search = query.search.trim()
      
      // Validate search length
      if (result.search.length === 0 || result.search.length > 255) {
        throw new ErrorWrapper({
          ...errorCodes.BAD_REQUEST,
          message: 'Search query must be between 1 and 255 characters.',
          context: { searchLength: result.search.length }
        })
      }
    }
    
    if (query.searchFields) {
      if (Array.isArray(query.searchFields)) {
        result.searchFields = query.searchFields.filter(f => typeof f === 'string' && f.trim())
      } else if (typeof query.searchFields === 'string') {
        result.searchFields = query.searchFields.split(',').map(f => f.trim()).filter(f => f)
      }
    }
    
    return result
  }
  
  /**
   * Processes field selection parameters
   */
  processFields(query) {
    const result = {}
    
    if (query.fields) {
      if (Array.isArray(query.fields)) {
        result.fields = query.fields.filter(f => typeof f === 'string' && f.trim())
      } else if (typeof query.fields === 'string') {
        result.fields = query.fields.split(',').map(f => f.trim()).filter(f => f)
      }
    }
    
    if (query.select) {
      // Alias for fields
      if (!result.fields) {
        result.fields = Array.isArray(query.select) 
          ? query.select.filter(f => typeof f === 'string' && f.trim())
          : query.select.split(',').map(f => f.trim()).filter(f => f)
      }
    }
    
    return result
  }
  
  /**
   * Processes include parameters for related data
   */
  processIncludes(query) {
    const result = {}
    
    if (query.include) {
      if (Array.isArray(query.include)) {
        result.include = query.include.filter(i => typeof i === 'string' && i.trim())
      } else if (typeof query.include === 'string') {
        result.include = query.include.split(',').map(i => i.trim()).filter(i => i)
      }
    }
    
    if (query.with) {
      // Alias for include
      if (!result.include) {
        result.include = Array.isArray(query.with)
          ? query.with.filter(i => typeof i === 'string' && i.trim())
          : query.with.split(',').map(i => i.trim()).filter(i => i)
      }
    }
    
    return result
  }
  
  /**
   * Applies security measures to the request
   */
  async applySecurity(req) {
    // Add security headers
    req.securityContext = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.userAgent,
      timestamp: Date.now(),
      method: req.method,
      path: req.path
    }
  }
  
  /**
   * Parses language from Accept-Language header
   */
  parseLanguage(acceptLanguage) {
    // Handle "en-US, en;q=0.9, ar;q=0.8" format
    const languages = acceptLanguage.split(',')
      .map(lang => lang.split(';')[0].trim().toLowerCase())
      .map(lang => lang.split('-')[0]) // Extract primary language
    
    // Return first supported language
    for (const lang of languages) {
      if (this.config.supportedLanguages.includes(lang)) {
        return lang
      }
    }
    
    // If no supported language found, return the first part of the first language
    return languages[0] || this.config.defaultLanguage
  }
  
  /**
   * Parses sort criteria from string
   */
  parseSortCriteria(sortString) {
    if (typeof sortString !== 'string') return null
    
    const parts = sortString.split(':')
    return {
      field: parts[0].trim(),
      direction: parts[1] ? parts[1].trim() : 'asc'
    }
  }
  
  /**
   * Validates filter structure and depth
   */
  validateFilterStructure(filter, depth = 0) {
    if (depth > this.config.maxFilterDepth) {
      throw new ErrorWrapper({
        ...errorCodes.BAD_REQUEST,
        message: `Filter depth exceeds maximum allowed depth of ${this.config.maxFilterDepth}`,
        context: { maxDepth: this.config.maxFilterDepth, currentDepth: depth }
      })
    }
    
    if (typeof filter !== 'object' || filter === null) {
      return
    }
    
    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Check for filter operators
        const operators = Object.keys(value)
        const invalidOperators = operators.filter(op => 
          !this.config.allowedFilterOperators.includes(op)
        )
        
        if (invalidOperators.length > 0) {
          throw new ErrorWrapper({
            ...errorCodes.BAD_REQUEST,
            message: `Invalid filter operators: [${invalidOperators.join(', ')}]. Allowed: [${this.config.allowedFilterOperators.join(', ')}]`,
            context: { invalidOperators, allowedOperators: this.config.allowedFilterOperators }
          })
        }
        
        // Recursively validate nested objects
        this.validateFilterStructure(value, depth + 1)
      }
    }
  }
  
  /**
   * Sanitizes query parameters to prevent injection attacks
   */
  sanitizeQuery(query) {
    if (typeof query !== 'object' || query === null) {
      return query
    }
    
    const sanitized = Array.isArray(query) ? [] : {}
    
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') {
        // Basic HTML/script sanitization
        sanitized[key] = value
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/<[^>]*>/g, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+=/gi, '')
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeQuery(value)
      } else {
        sanitized[key] = value
      }
    }
    
    return sanitized
  }
  
  /**
   * Cleans up legacy query parameters
   */
  cleanupLegacyParameters(query) {
    const legacyParams = ['orderByField', 'orderByDirection']
    legacyParams.forEach(param => {
      if (query[param]) {
        delete query[param]
      }
    })
  }
  
  /**
   * Generates unique request ID
   */
  generateRequestId() {
    return crypto.randomBytes(8).toString('hex')
  }
  
  /**
   * Logs query processing information
   */
  logQueryProcessing(req, processingTime) {
    logger.debug('Query processing completed', {
      requestId: req.queryProcessingId,
      method: req.method,
      url: req.url,
      language: req.language,
      processingTime: `${processingTime}ms`,
      queryParams: Object.keys(req.query).length,
      hasFilter: !!req.query.filter && Object.keys(req.query.filter || {}).length > 0,
      hasSearch: !!req.query.search,
      pagination: {
        page: req.query.page,
        limit: req.query.limit
      }
    })
  }
  
  /**
   * Handles errors during query processing
   */
  handleError(error, req, next, processingTime) {
    logger.error('Query processing failed', {
      requestId: req.queryProcessingId,
      method: req.method,
      url: req.url,
      processingTime: `${processingTime}ms`,
      error: error.message,
      stack: error.stack
    })
    
    next(error)
  }
}

module.exports = { QueryMiddleware }