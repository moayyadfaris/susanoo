const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule } = require('backend-core')
const joi = require('joi')
const { performance } = require('perf_hooks')
const { getStoryService } = require('services')

/**
 * ListStoriesHandler – Transport wrapper around StoryService.listStories.
 *
 * ### Features
 * - Delegates filtering, permissions, caching, and data shaping to StoryService
 * - Validates and documents accepted query parameters in-line
 * - Emits structured logs and metrics for cache hits, latency, and result counts
 *
 * ### How to use the API
 * - **Endpoint:** `GET /api/v1/stories`
 * - **Query parameters:** pagination (`page`, `limit`), sorting (`orderBy`), filters (`status`, `type`, `priority`, `countryId`, `tags`, `dateFrom`, `dateTo`), search (`term`), relation includes (`include`), cache control (`noCache`)
 * - **Authentication:** Bearer token; caller must hold the `stories:list` access tag
 * - **Response:** Returns sanitized stories array plus pagination metadata (`pagination`) and performance hints (`meta.cached`, `meta.orderBy`, etc.)
 *
 * The handler purposely remains thin so enterprise rules—rate limits, RBAC, duplicate suppression—live in StoryService.
 */
class ListStoriesHandler extends BaseHandler {
  static get accessTag () {
    return 'stories:list'
  }

  static get validationRules () {
    return {
      query: {
        ...this.baseQueryParams,
        page: new RequestRule(new Rule({
          validator: v => this.validateNumericParam(v, { min: 1, max: 1000, name: 'Page', allowFallback: true }),
          description: 'Page number: integer between 1 and 1000'
        }), { required: false }),
        limit: new RequestRule(new Rule({
          validator: v => this.validateNumericParam(v, { min: 1, max: 100, name: 'Limit', allowFallback: true }),
          description: 'Items per page: integer between 1 and 100'
        }), { required: false }),
        orderBy: new RequestRule(new Rule({
          validator: v => this.validateOrderBy(v),
          description: 'Sort order: { field: "createdAt|updatedAt|title|status|priority", direction: "asc|desc" }'
        }), { required: false }),
        status: new RequestRule(new Rule({
          validator: v => this.validateEnumFilter(v, ['SUBMITTED', 'DRAFT', 'IN_PROGRESS', 'ARCHIVED', 'PUBLISHED', 'APPROVED', 'ASSIGNED', 'PENDING', 'FOR_REVIEW_SE', 'EXPIRED'], 'status'),
          description: 'Story status filter'
        }), { required: false }),
        type: new RequestRule(new Rule({
          validator: v => this.validateEnumFilter(v, ['TIP_OFF', 'STORY', 'REPORT'], 'type'),
          description: 'Story type filter'
        }), { required: false }),
        priority: new RequestRule(new Rule({
          validator: v => this.validateEnumFilter(v, ['LOW', 'NORMAL', 'HIGH', 'URGENT'], 'priority'),
          description: 'Story priority filter'
        }), { required: false }),
        term: new RequestRule(new Rule({
          validator: v => this.validateTerm(v),
          description: 'Search term: 2-100 characters, alphanumeric with basic punctuation'
        }), { required: false }),
        countryId: new RequestRule(new Rule({
          validator: v => this.validateNumericParam(v, { min: 1, name: 'Country ID' }),
          description: 'Country ID filter'
        }), { required: false }),
        userId: new RequestRule(new Rule({
          validator: v => {
            try {
              joi.assert(v, joi.string().uuid())
              return true
            } catch (e) {
              return `User ID must be a valid UUID: ${e.message}`
            }
          },
          description: 'User ID filter (admin only)'
        }), { required: false }),
        dateFrom: new RequestRule(new Rule({
          validator: v => this.validateIsoDate(v, 'dateFrom'),
          description: 'ISO start date filter'
        }), { required: false }),
        dateTo: new RequestRule(new Rule({
          validator: v => this.validateIsoDate(v, 'dateTo'),
          description: 'ISO end date filter'
        }), { required: false }),
        tags: new RequestRule(new Rule({
          validator: v => this.validateTags(v),
          description: 'Tag filters: comma-separated string or array, max 10 tags'
        }), { required: false }),
        include: new RequestRule(new Rule({
          validator: v => this.validateIncludes(v, ['tags', 'owner', 'country', 'attachments', 'categories', 'editor', 'stats']),
          description: 'Additional relations to include'
        }), { required: false }),
        noCache: new RequestRule(new Rule({
          validator: v => this.validateBooleanLike(v, 'noCache'),
          description: 'Bypass service cache'
        }), { required: false })
      }
    }
  }

  static async run (req) {
    const startTime = performance.now()
    const { query, currentUser } = req
    const requestId = req.requestMetadata?.id || `req_${Date.now()}`

    try {
      const storyService = getStoryService()
      const serviceResult = await storyService.listStories(query, {
        currentUser,
        requestId,
        ip: req.ip,
        userAgent: typeof req.get === 'function' ? req.get('User-Agent') : undefined
      })

      this.logRequest(req, 'success', performance.now() - startTime, {
        resultCount: serviceResult?.data?.length || 0,
        cached: serviceResult?.meta?.cached
      })

      const response = this.result({
        data: serviceResult.data,
        headers: serviceResult.headers
      })

      if (serviceResult.pagination) {
        response.pagination = serviceResult.pagination
      }

      if (serviceResult.meta) {
        response.meta = serviceResult.meta
      }

      return response

    } catch (error) {
      const processingTime = performance.now() - startTime

      this.logger.error('ListStoriesHandler failed', {
        requestId,
        error: error.message,
        processingTime: `${processingTime.toFixed(2)}ms`,
        userId: currentUser?.id,
        query: JSON.stringify(query),
        stack: error.stack
      })

      this.logRequest(req, 'error', processingTime, { error: error.message })

      throw error
    }
  }

  static logRequest(req, type, processingTime, additionalData = {}) {
    const userAgent = (typeof req.get === 'function') ? req.get('User-Agent') :
      req.headers?.['user-agent'] || req.userAgent || 'unknown'
    const ip = req.ip || req.requestMetadata?.ip || req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'

    const logData = {
      handler: 'ListStoriesHandler',
      type,
      processingTime: `${processingTime.toFixed(2)}ms`,
      userId: req.currentUser?.id,
      ip,
      userAgent,
      query: JSON.stringify(req.query),
      ...additionalData
    }

    if (type === 'error') {
      this.logger.error('Story list request failed', logData)
    } else if (type === 'cache_hit') {
      this.logger.debug('Story list cache hit', logData)
    } else {
      this.logger.info('Story list request', logData)
    }
  }

  static validateNumericParam(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, name, allowFallback = false }) {
    if (value === undefined || value === null || value === '') return true
    const num = Number(value)
    if (!Number.isInteger(num)) {
      return `${name} must be an integer`
    }
    if (num < min) {
      return allowFallback ? true : `${name} must be greater than or equal to ${min}`
    }
    if (num > max) {
      return `${name} must be less than or equal to ${max}`
    }
    return true
  }

  static validateOrderBy(value) {
    if (value === undefined || value === null || value === '') return true
    try {
      const parsed = typeof value === 'string' ? value.trim() : value
      if (typeof parsed === 'string' && parsed.includes(':')) {
        const [field, direction] = parsed.split(':')
        if (!field) return 'Invalid orderBy field'
        if (!['asc', 'desc'].includes(direction)) return 'Invalid orderBy direction'
        return true
      }
      if (typeof parsed === 'object') {
        const result = joi.object({
          field: joi.string().min(1).max(50).required(),
          direction: joi.string().valid('asc', 'desc').required()
        }).validate(parsed)
        return result.error ? result.error.message : true
      }
      return 'orderBy must be in the format field:direction'
    } catch (error) {
      return `Invalid orderBy value: ${error.message}`
    }
  }

  static validateEnumFilter(value, allowedValues, name) {
    if (value === undefined || value === null || value === '') return true
    const values = Array.isArray(value) ? value : value.toString().split(',').map(v => v.trim())
    const invalid = values.filter(v => !allowedValues.includes(v))
    if (invalid.length) {
      return `Invalid ${name} value(s): ${invalid.join(', ')}`
    }
    return true
  }

  static validateTerm(value) {
    if (value === undefined || value === null || value === '') return true
    if (typeof value !== 'string') return 'Search term must be a string'
    const trimmed = value.trim()
    if (trimmed.length < 2 || trimmed.length > 100) {
      return 'Search term must be between 2 and 100 characters'
    }
    if (!/^[\w\s\-.,!?()]+$/.test(trimmed)) {
      return 'Search term contains invalid characters'
    }
    return true
  }

  static validateIsoDate(value, label) {
    if (value === undefined || value === null || value === '') return true
    const { error } = joi.date().iso().validate(value)
    if (error) {
      return `${label} must be a valid ISO date: ${error.message}`
    }
    return true
  }

  static validateTags(value) {
    if (value === undefined || value === null || value === '') return true
    try {
      const tags = Array.isArray(value) ? value : value.toString().split(',').map(tag => tag.trim())
      joi.assert(tags, joi.array().items(joi.string().trim().min(2).max(50)).max(10))
      return true
    } catch (error) {
      return `Tags validation failed: ${error.message}`
    }
  }

  static validateIncludes(value, allowed) {
    if (value === undefined || value === null || value === '') return true
    const includes = Array.isArray(value) ? value : value.toString().split(',').map(v => v.trim())
    return includes.every(inc => allowed.includes(inc)) || 'Invalid include value(s)'
  }

  static validateBooleanLike(value, name) {
    if (value === undefined || value === null || value === '') return true
    if (typeof value === 'boolean') return true
    if (typeof value === 'string' && ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'].includes(value.toLowerCase())) return true
    return `${name} must be a boolean value`
  }
}

module.exports = ListStoriesHandler
