const joi = require('joi')
const { Rule, RequestRule, assert } = require('backend-core')
const crypto = require('crypto')
const appLogger = require('../util/logger')

class BaseHandler {
  /**
   * Shared application logger for static handler methods
   * Handlers commonly implement static methods (e.g., run), so expose
   * a static logger that proxies to the app-wide logger instance.
   */
  static get logger () {
    return appLogger
  }

  /**
   * Enhanced base query parameters with comprehensive validation
   */
  static get baseQueryParams() {
    return {
      // Pagination parameters
      page: new RequestRule(new Rule({
        validator: v => {
          const num = parseInt(v, 10)
          return Number.isInteger(num) && num >= 0 && num <= 10000
        },
        description: 'Number; min: 0, max: 10000; Page number for pagination'
      })),
      
      limit: new RequestRule(new Rule({
        validator: v => {
          const num = parseInt(v, 10)
          const allowedLimits = [1, 2, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 200, 500]
          return Number.isInteger(num) && allowedLimits.includes(num)
        },
        description: 'Number; Allowed values: [1, 2, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 200, 500]'
      })),
      
      offset: new RequestRule(new Rule({
        validator: v => {
          const num = parseInt(v, 10)
          return Number.isInteger(num) && num >= 0 && num <= 100000
        },
        description: 'Number; min: 0, max: 100000; Number of records to skip'
      })),
      
      // Sorting parameters
      orderBy: new RequestRule(new Rule({
        validator: v => {
          if (typeof v === 'string') {
            // Allow simple string format like "createdAt:desc"
            const parts = v.split(':')
            if (parts.length !== 2) return 'Invalid format. Use "field:direction"'
            const [field, direction] = parts
            if (!field || !['asc', 'desc'].includes(direction)) {
              return 'Invalid direction. Use "asc" or "desc"'
            }
            return true
          }
          
          if (typeof v === 'object') {
            const result = joi.object({
              field: joi.string().min(1).max(50).required(),
              direction: joi.string().valid('asc', 'desc').required()
            }).validate(v)
            return result.error ? result.error.message : true
          }
          
          return 'Must be string in format "field:direction" or object { field, direction }'
        },
        description: 'String or Object; Format: "field:direction" or { field: string, direction: "asc"|"desc" }'
      })),
      
      sort: new RequestRule(new Rule({
        validator: v => {
          if (typeof v === 'string') return v.length > 0 && v.length <= 100
          if (Array.isArray(v)) {
            return v.every(item => typeof item === 'string' && item.length > 0 && item.length <= 50)
          }
          return false
        },
        description: 'String or Array; Field name(s) for sorting'
      })),
      
      // Filtering parameters
      filter: new RequestRule(new Rule({
        validator: v => {
          if (typeof v !== 'object' || v === null) return false
          if (Array.isArray(v)) return false
          
          // Validate filter object structure
          const maxDepth = 3
          const validateDepth = (obj, depth = 0) => {
            if (depth > maxDepth) return false
            for (const key in obj) {
              if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (!validateDepth(obj[key], depth + 1)) return false
              }
            }
            return true
          }
          
          return validateDepth(v)
        },
        description: 'Object; Filter conditions (max depth: 3 levels)'
      })),
      
      // Search parameters
      search: new RequestRule(new Rule({
        validator: v => {
          if (typeof v !== 'string') return false
          return v.length >= 1 && v.length <= 255
        },
        description: 'String; Search query (1-255 characters)'
      })),
      
      searchFields: new RequestRule(new Rule({
        validator: v => {
          if (Array.isArray(v)) {
            return v.every(field => typeof field === 'string' && field.length > 0)
          }
          if (typeof v === 'string') {
            return v.split(',').every(field => field.trim().length > 0)
          }
          return false
        },
        description: 'String or Array; Fields to search in (comma-separated string or array)'
      })),
      
      // Data format parameters
      fields: new RequestRule(new Rule({
        validator: v => {
          if (typeof v === 'string') {
            const fields = v.split(',').map(f => f.trim())
            return fields.every(field => field.length > 0 && field.length <= 50)
          }
          if (Array.isArray(v)) {
            return v.every(field => typeof field === 'string' && field.length > 0 && field.length <= 50)
          }
          return false
        },
        description: 'String or Array; Specific fields to return (comma-separated or array)'
      })),
      
      include: new RequestRule(new Rule({
        validator: v => {
          if (typeof v === 'string') {
            return v.split(',').every(rel => rel.trim().length > 0)
          }
          if (Array.isArray(v)) {
            return v.every(rel => typeof rel === 'string' && rel.length > 0)
          }
          return false
        },
        description: 'String or Array; Related data to include (comma-separated or array)'
      })),
      
      // Utility parameters
      schema: new RequestRule(new Rule({
        validator: v => typeof v === 'boolean' || v === 'true' || v === 'false',
        description: 'Boolean; Return schema documentation instead of data'
      })),
      
      format: new RequestRule(new Rule({
        validator: v => ['json', 'csv', 'xml'].includes(v),
        description: 'String; Response format: json, csv, xml'
      })),
      
      timezone: new RequestRule(new Rule({
        validator: v => {
          try {
            // Basic timezone validation
            if (typeof v !== 'string') return false
            return /^[A-Z][a-z]+\/[A-Z][a-z_]+$/.test(v) || /^UTC[+-]\d{1,2}$/.test(v)
          } catch {
            return false
          }
        },
        description: 'String; Timezone for date formatting (e.g., America/New_York, UTC+5)'
      })),
      
      locale: new RequestRule(new Rule({
        validator: v => typeof v === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(v),
        description: 'String; Locale for formatting (e.g., en, en-US, fr-FR)'
      }))
    }
  }
  
  /**
   * Enhanced result builder with comprehensive validation and options
   */
  static result(result) {
    // Input validation
    if (!result || typeof result !== 'object') {
      throw new Error('Result must be a non-null object')
    }
    
    // Default values
    const defaults = {
      success: true,
      status: 200,
      message: null,
      data: null,
      cookies: [],
      headers: {},
      allowNullData: false,
      meta: {}
    }
    
    // Merge with defaults
    const response = { ...defaults, ...result }
    
    // Validation
    assert.boolean(response.success, { message: 'success must be boolean' })
    assert.integer(response.status, { min: 100, max: 599, message: 'status must be valid HTTP status code' })
    
    if (response.message !== null) {
      assert.string(response.message, { message: 'message must be string or null' })
    }
    
    if (response.cookies) {
      assert.array(response.cookies, { message: 'cookies must be array' })
      response.cookies.forEach((cookie, index) => {
        assert.object(cookie, { message: `cookie at index ${index} must be object` })
        assert.string(cookie.name, { required: true, message: `cookie at index ${index} must have name` })
      })
    }
    
    if (response.headers) {
      assert.object(response.headers, { message: 'headers must be object' })
    }
    
    // Add timestamp to meta if not present
    if (!response.meta.timestamp) {
      response.meta.timestamp = new Date().toISOString()
    }
    
    // Clean up response
    const cleanResponse = {
      success: response.success,
      status: response.status
    }
    
    if (response.message) cleanResponse.message = response.message
    if (response.cookies && response.cookies.length > 0) cleanResponse.cookies = response.cookies
    if (response.headers && Object.keys(response.headers).length > 0) cleanResponse.headers = response.headers
    if (response.data !== null || response.allowNullData) cleanResponse.data = response.data
    if (response.allowNullData) cleanResponse.allowNullData = response.allowNullData
    if (Object.keys(response.meta).length > 0) cleanResponse.meta = response.meta
    
    return cleanResponse
  }

  /**
   * Success response builder
   */
  static success(data = null, message = 'Operation completed successfully', options = {}) {
    return this.result({
      success: true,
      status: options.status || 200,
      message,
      data,
      ...options
    })
  }
  
  /**
   * Error response builder
   */
  static error(message = 'Operation failed', status = 400, data = null, options = {}) {
    return this.result({
      success: false,
      status,
      message,
      data,
      ...options
    })
  }
  
  /**
   * Created response builder
   */
  static created(data, message = 'Resource created successfully', options = {}) {
    return this.result({
      success: true,
      status: 201,
      message,
      data,
      ...options
    })
  }
  
  /**
   * Updated response builder
   */
  static updated(data, message = 'Resource updated successfully', options = {}) {
    return this.result({
      success: true,
      status: 200,
      message,
      data,
      ...options
    })
  }
  
  /**
   * Deleted response builder
   */
  static deleted(message = 'Resource deleted successfully', options = {}) {
    return this.result({
      success: true,
      status: 204,
      message,
      data: null,
      allowNullData: true,
      ...options
    })
  }
  
  /**
   * Not found response builder
   */
  static notFound(message = 'Resource not found', options = {}) {
    return this.result({
      success: false,
      status: 404,
      message,
      data: null,
      allowNullData: true,
      ...options
    })
  }
  
  /**
   * Unauthorized response builder
   */
  static unauthorized(message = 'Unauthorized access', options = {}) {
    return this.result({
      success: false,
      status: 401,
      message,
      data: null,
      allowNullData: true,
      ...options
    })
  }
  
  /**
   * Forbidden response builder
   */
  static forbidden(message = 'Access forbidden', options = {}) {
    return this.result({
      success: false,
      status: 403,
      message,
      data: null,
      allowNullData: true,
      ...options
    })
  }
  
  /**
   * Validation error response builder
   */
  static validationError(errors, message = 'Validation failed', options = {}) {
    return this.result({
      success: false,
      status: 422,
      message,
      data: { errors },
      ...options
    })
  }
  
  /**
   * Paginated response builder
   */
  static paginated(data, pagination, message = 'Data retrieved successfully', options = {}) {
    // Validate pagination object
    assert.object(pagination, { required: true })
    assert.integer(pagination.page, { min: 0, required: true })
    assert.integer(pagination.limit, { min: 1, required: true })
    assert.integer(pagination.total, { min: 0, required: true })
    
    const totalPages = Math.ceil(pagination.total / pagination.limit)
    const hasNext = pagination.page < totalPages - 1
    const hasPrev = pagination.page > 0
    
    return this.result({
      success: true,
      status: 200,
      message,
      data,
      meta: {
        pagination: {
          currentPage: pagination.page,
          totalPages,
          totalItems: pagination.total,
          itemsPerPage: pagination.limit,
          hasNext,
          hasPrev,
          nextPage: hasNext ? pagination.page + 1 : null,
          prevPage: hasPrev ? pagination.page - 1 : null
        }
      },
      ...options
    })
  }

  
  /**
   * Enhanced redirect response builder
   */
  static redirect(url, status = 302, options = {}) {
    assert.string(url, { required: true, notEmpty: true })
    assert.integer(status, { min: 300, max: 399 })
    
    // Validate URL format
    try {
      new URL(url)
    } catch {
      throw new Error('Invalid URL format')
    }
    
    return {
      redirect: {
        status,
        url
      },
      ...options
    }
  }
  
  /**
   * Utility: Parse pagination parameters
   */
  static parsePagination(query = {}) {
    const page = Math.max(0, parseInt(query.page, 10) || 0)
    const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 10))
    const offset = parseInt(query.offset, 10) || (page * limit)
    
    return { page, limit, offset }
  }
  
  /**
   * Utility: Parse sort parameters
   */
  static parseSort(query = {}) {
    let orderBy = []
    
    if (query.orderBy) {
      if (typeof query.orderBy === 'string') {
        const [field, direction = 'asc'] = query.orderBy.split(':')
        orderBy.push({ field: field.trim(), direction })
      } else if (typeof query.orderBy === 'object') {
        orderBy.push(query.orderBy)
      }
    }
    
    if (query.sort) {
      const sorts = Array.isArray(query.sort) ? query.sort : [query.sort]
      sorts.forEach(sort => {
        if (typeof sort === 'string') {
          const [field, direction = 'asc'] = sort.split(':')
          orderBy.push({ field: field.trim(), direction })
        }
      })
    }
    
    return orderBy.length > 0 ? orderBy : null
  }
  
  /**
   * Utility: Parse filter parameters
   */
  static parseFilter(query = {}) {
    if (!query.filter || typeof query.filter !== 'object') {
      return {}
    }
    
    // Sanitize filter object
    const sanitizeFilter = (obj) => {
      const sanitized = {}
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          sanitized[key] = sanitizeFilter(value)
        } else {
          sanitized[key] = value
        }
      }
      return sanitized
    }
    
    return sanitizeFilter(query.filter)
  }
  
  /**
   * Utility: Parse search parameters
   */
  static parseSearch(query = {}) {
    const search = query.search ? query.search.trim() : null
    let searchFields = []
    
    if (query.searchFields) {
      if (Array.isArray(query.searchFields)) {
        searchFields = query.searchFields
      } else if (typeof query.searchFields === 'string') {
        searchFields = query.searchFields.split(',').map(f => f.trim()).filter(f => f)
      }
    }
    
    return { search, searchFields: searchFields.length > 0 ? searchFields : null }
  }
  
  /**
   * Utility: Parse field selection
   */
  static parseFields(query = {}) {
    if (!query.fields) return null
    
    if (Array.isArray(query.fields)) {
      return query.fields.filter(f => typeof f === 'string' && f.trim())
    }
    
    if (typeof query.fields === 'string') {
      return query.fields.split(',').map(f => f.trim()).filter(f => f)
    }
    
    return null
  }
  
  /**
   * Utility: Parse include parameters
   */
  static parseInclude(query = {}) {
    if (!query.include) return null
    
    if (Array.isArray(query.include)) {
      return query.include.filter(i => typeof i === 'string' && i.trim())
    }
    
    if (typeof query.include === 'string') {
      return query.include.split(',').map(i => i.trim()).filter(i => i)
    }
    
    return null
  }
  
  /**
   * Utility: Parse all query parameters
   */
  static parseQuery(query = {}) {
    return {
      pagination: this.parsePagination(query),
      sort: this.parseSort(query),
      filter: this.parseFilter(query),
      search: this.parseSearch(query),
      fields: this.parseFields(query),
      include: this.parseInclude(query),
      format: query.format || 'json',
      timezone: query.timezone || 'UTC',
      locale: query.locale || 'en'
    }
  }
  
  /**
   * Error handling: Create error response
   */
  static createError(code, message, details = null, status = 400) {
    const error = new Error(message)
    error.code = code
    error.status = status
    error.details = details
    error.timestamp = new Date().toISOString()
    return error
  }
  
  /**
   * Validation: Validate required fields
   */
  static validateRequired(data, requiredFields = []) {
    const missing = []
    const invalid = []
    
    requiredFields.forEach(field => {
      if (!(field in data)) {
        missing.push(field)
      } else if (data[field] === null || data[field] === undefined || data[field] === '') {
        invalid.push(field)
      }
    })
    
    if (missing.length > 0 || invalid.length > 0) {
      const errors = []
      if (missing.length > 0) errors.push(`Missing required fields: ${missing.join(', ')}`)
      if (invalid.length > 0) errors.push(`Invalid required fields: ${invalid.join(', ')}`)
      
      throw this.createError('VALIDATION_ERROR', 'Required field validation failed', {
        missing,
        invalid,
        errors
      }, 422)
    }
    
    return true
  }
  
  /**
   * Security: Sanitize input
   */
  static sanitizeInput(input) {
    if (typeof input === 'string') {
      // Basic HTML entity encoding
      return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
    }
    
    if (typeof input === 'object' && input !== null) {
      const sanitized = Array.isArray(input) ? [] : {}
      for (const key in input) {
        sanitized[key] = this.sanitizeInput(input[key])
      }
      return sanitized
    }
    
    return input
  }
  
  /**
   * Security: Generate secure token
   */
  static generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex')
  }
  
  /**
   * Utility: Deep clone object
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj
    if (obj instanceof Date) return new Date(obj.getTime())
    if (Array.isArray(obj)) return obj.map(item => this.deepClone(item))
    
    const cloned = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = this.deepClone(obj[key])
      }
    }
    return cloned
  }
  
  /**
   * Utility: Format date with timezone
   */
  static formatDate(date, timezone = 'UTC', locale = 'en') {
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date(date))
    } catch {
      return new Date(date).toISOString()
    }
  }
  
  /**
   * Utility: Calculate execution time
   */
  static measureExecution(startTime) {
    const endTime = Date.now()
    return endTime - startTime
  }
}

module.exports = BaseHandler
