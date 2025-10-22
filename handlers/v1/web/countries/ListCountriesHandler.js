const { ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const { getCountryService } = require('../../../../services')
const logger = require('../../../../util/logger')

/**
 * WebListCountriesHandler - Lists countries with enterprise metadata.
 *
 * Features:
 * - Delegates filtering, search, and pagination to `CountryService.searchCountries`, keeping the handler thin.
 * - Normalizes query params (fields, filter, orderBy) and supports optional cache bypass via `noCache=true`.
 * - Emits structured logs with correlation identifiers and returns rich metadata (`meta.pagination`, `meta.criteria`).
 *
 * Usage:
 * - Endpoint: `GET /api/v1/web/countries`
 * - Access tag: `web#countries:list`
 * - Query params (examples):
 *   - `search=can`: fuzzy match on `name/nicename/iso`.
 *   - `filter={"continent":"Europe","isActive":true}`.
 *   - `fields=iso,name,currencyCode`.
 *   - `page=0&limit=50&orderBy=name:asc&noCache=true`.
 */
class ListCountriesHandler extends BaseHandler {
  static get accessTag() {
    return 'web#countries:list'
  }

  static get validationRules() {
    return {
      query: {
        ...this.baseQueryParams
      }
    }
  }

  static async run(ctx) {
    const countryService = getCountryService()

    if (!countryService) {
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Country service not available',
        layer: 'WebListCountriesHandler.run'
      })
    }

    const normalizedQuery = this.normalizeQuery(ctx.query)

    const criteria = {}
    if (normalizedQuery.search) criteria.search = normalizedQuery.search
    if (normalizedQuery.filter) criteria.filter = normalizedQuery.filter
    if (normalizedQuery.fields) criteria.fields = normalizedQuery.fields

    const options = {
      page: normalizedQuery.page,
      limit: normalizedQuery.limit,
      format: normalizedQuery.format || 'full',
      useCache: normalizedQuery.noCache === true ? false : true
    }

    if (normalizedQuery.orderByField) {
      options.orderByField = normalizedQuery.orderByField
      options.orderByDirection = normalizedQuery.orderByDirection || 'asc'
    }

    const logContext = {
      handler: 'WebListCountriesHandler',
      requestId: ctx.requestId,
      ip: ctx.ip,
      userId: ctx.currentUser?.id
    }

    try {
      const serviceResult = await countryService.searchCountries(criteria, options)

      logger.info('Web countries listed', {
        ...logContext,
        resultCount: serviceResult.results?.length || 0,
        total: serviceResult.total,
        cached: serviceResult.metadata?.cached
      })

      return this.result({
        data: serviceResult.results,
        headers: {
          'X-Total-Count': serviceResult.total ?? 0
        },
        meta: {
          total: serviceResult.total ?? 0,
          pagination: serviceResult.pagination,
          criteria: serviceResult.metadata
        }
      })
    } catch (error) {
      logger.error('Web countries listing failed', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Unable to fetch countries',
        layer: 'WebListCountriesHandler.run',
        meta: {
          originalError: error.message
        }
      })
    }
  }

  static normalizeQuery(rawQuery = {}) {
    const normalized = { ...rawQuery }

    normalized.page = this.parseInt(normalized.page, 0)
    normalized.limit = this.parseInt(normalized.limit, 50)

    if (typeof normalized.fields === 'string') {
      normalized.fields = normalized.fields
        .split(',')
        .map(field => field.trim())
        .filter(Boolean)
      if (!normalized.fields.length) {
        normalized.fields = undefined
      }
    } else if (!Array.isArray(normalized.fields)) {
      normalized.fields = undefined
    } else if (!normalized.fields.length) {
      normalized.fields = undefined
    }

    if (typeof normalized.filter === 'string') {
      try {
        normalized.filter = JSON.parse(normalized.filter)
      } catch {
        normalized.filter = undefined
      }
    } else if (typeof normalized.filter !== 'object' || normalized.filter === null) {
      normalized.filter = undefined
    }

    if (typeof normalized.orderBy === 'string') {
      const [field, direction] = normalized.orderBy.split(':')
      if (field && ['asc', 'desc'].includes((direction || '').toLowerCase())) {
        normalized.orderByField = field
        normalized.orderByDirection = direction.toLowerCase()
      }
    } else if (typeof normalized.orderBy === 'object' && normalized.orderBy !== null) {
      const { field, direction } = normalized.orderBy
      if (field && ['asc', 'desc'].includes((direction || '').toLowerCase())) {
        normalized.orderByField = field
        normalized.orderByDirection = direction.toLowerCase()
      }
    }

    normalized.noCache = this.parseBoolean(normalized.noCache)

    return normalized
  }

  static parseInt(value, defaultValue) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue
  }

  static parseBoolean(value) {
    if (value === undefined || value === null) return undefined
    if (typeof value === 'boolean') return value
    const normalized = value.toString().toLowerCase()
    if (['true', '1', 'yes'].includes(normalized)) return true
    if (['false', '0', 'no'].includes(normalized)) return false
    return undefined
  }
}

module.exports = ListCountriesHandler
