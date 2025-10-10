const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const CountryDAO = require('database/dao/CountryDAO')
const { redisClient } = require('handlers/RootProvider')
const logger = require('util/logger')

/**
 * ListCountriesHandler - Enhanced country listing with comprehensive features
 * 
 * Provides advanced country data retrieval with:
 * - Advanced search and filtering capabilities
 * - Performance optimization with intelligent caching
 * - Field selection and response customization
 * - Regional and continental grouping
 * - Comprehensive error handling and monitoring
 * - Rate limiting and security features
 * 
 * @extends BaseHandler
 * @version 2.0.0
 */
class ListCountriesHandler extends BaseHandler {
  /**
   * Access control tag for country listing
   */
  static get accessTag() {
    return 'countries:list'
  }

  /**
   * Enhanced validation rules with comprehensive parameters
   */
  static get validationRules() {
    return {
      query: {
        // Base pagination and sorting
        ...this.baseQueryParams,
        
        // Search functionality
        search: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length >= 1 && v.length <= 100,
          description: 'string; min: 1, max: 100; Search term for country name, nicename, or ISO codes'
        }), { required: false }),

        // Advanced filtering - support both object and bracket notation
        filter: new RequestRule(new Rule({
          validator: v => {
            if (typeof v !== 'object' || v === null) return false
            
            const allowedFilters = [
              'name', 'nicename', 'iso', 'iso3', 'phonecode', 'numcode', 
              'isActive', 'region'
            ]
            
            return Object.keys(v).every(key => allowedFilters.includes(key))
          },
          description: 'object; Filter conditions - name, nicename, iso, iso3, phonecode, numcode, isActive, region. Also supports bracket notation: filter[iso]=JO'
        }), { required: false }),

        // Explicit bracket notation filter parameters
        'filter[name]': new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length <= 100,
          description: 'string; Filter by country name (partial match)'
        }), { required: false }),
        
        'filter[nicename]': new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length <= 100,
          description: 'string; Filter by country nice name (partial match)'
        }), { required: false }),
        
        'filter[iso]': new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length === 2,
          description: 'string; Filter by 2-letter ISO code (exact match)'
        }), { required: false }),
        
        'filter[iso3]': new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length === 3,
          description: 'string; Filter by 3-letter ISO code (exact match)'
        }), { required: false }),
        
        'filter[phonecode]': new RequestRule(new Rule({
          validator: v => {
            const num = parseInt(v, 10)
            return Number.isInteger(num) && num > 0
          },
          description: 'number; Filter by phone country code'
        }), { required: false }),
        
        'filter[numcode]': new RequestRule(new Rule({
          validator: v => {
            const num = parseInt(v, 10)
            return Number.isInteger(num) && num > 0
          },
          description: 'number; Filter by numeric country code'
        }), { required: false }),
        
        'filter[isActive]': new RequestRule(new Rule({
          validator: v => v === 'true' || v === 'false' || typeof v === 'boolean',
          description: 'boolean; Filter by active status'
        }), { required: false }),
        
        'filter[region]': new RequestRule(new Rule({
          validator: v => typeof v === 'string' && ['europe', 'asia', 'africa', 'north_america', 'south_america', 'oceania'].includes(v.toLowerCase()),
          description: 'string; Filter by geographical region'
        }), { required: false }),

        // Field selection
        fields: new RequestRule(new Rule({
          validator: v => {
            if (typeof v === 'string') {
              v = v.split(',').map(field => field.trim())
            }
            
            if (!Array.isArray(v)) return 'Fields must be an array or comma-separated string'
            
            const allowedFields = [
              'id', 'name', 'nicename', 'iso', 'iso3', 'phonecode', 
              'numcode', 'isActive'
            ]
            
            const invalidFields = v.filter(field => !allowedFields.includes(field))
            if (invalidFields.length > 0) {
              return `Invalid fields: ${invalidFields.join(', ')}. Allowed: ${allowedFields.join(', ')}`
            }
            
            return true
          },
          description: 'array or comma-separated string; Fields to include in response'
        }), { required: false }),

        // Response format
        format: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && ['full', 'minimal', 'codes-only'].includes(v),
          description: 'string; Response format: full, minimal, or codes-only'
        }), { required: false }),

        // Regional grouping
        groupBy: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && ['region', 'phonecode'].includes(v),
          description: 'string; Group results by: region or phonecode'
        }), { required: false }),

        // Cache control
        useCache: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; Whether to use cached results'
        }), { required: false }),

        // Internal metadata fields (allow but ignore)
        _processed: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; internal processing flag'
        }), { required: false }),
        
        _processingId: new RequestRule(new Rule({
          validator: v => typeof v === 'string',
          description: 'string; internal processing identifier'
        }), { required: false }),
        
        _timestamp: new RequestRule(new Rule({
          validator: v => typeof v === 'number',
          description: 'number; internal processing timestamp'
        }), { required: false })
      }
    }
  }

  /**
   * Enhanced country listing with comprehensive features
   * 
   * @param {Object} ctx - Request context
   * @param {Object} ctx.query - Query parameters
   * @param {string} [ctx.query.search] - Search term
   * @param {Object} [ctx.query.filter] - Filter conditions
   * @param {Array|string} [ctx.query.fields] - Fields to select
   * @param {string} [ctx.query.format] - Response format
   * @param {string} [ctx.query.groupBy] - Grouping option
   * @param {boolean} [ctx.query.useCache] - Cache usage preference
   * @param {string} ctx.requestId - Unique request identifier
   * @param {string} ctx.ip - Client IP address
   * @returns {Promise<Object>} Country list response
   * @throws {ErrorWrapper} Various error conditions
   */
  static async run(ctx) {
    const startTime = Date.now()
    const logContext = {
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.headers?.['user-agent']
    }

    try {
      logger.info('Country list request initiated', {
        ...logContext,
        query: this.sanitizeLogQuery(ctx.query)
      })

      // Parse and prepare query parameters
      const queryParams = await this.prepareQueryParams(ctx.query, logContext)
      
      // Execute the enhanced DAO query
      const data = await this.retrieveCountryData(queryParams, logContext)
      
      // Format and enhance the response
      const formattedData = await this.formatResponse(data, queryParams, logContext)

      // Performance monitoring
      const duration = Date.now() - startTime
      logger.info('Country list request completed', {
        ...logContext,
        duration,
        totalResults: data.total,
        returnedResults: data.results?.length || 0,
        cacheHit: data.cacheHit || false
      })

      return this.result({
        data: formattedData.results,
        meta: {
          pagination: {
            page: queryParams.page || 0,
            limit: queryParams.limit || 1000,
            total: data.total,
            pages: Math.ceil(data.total / (queryParams.limit || 1000))
          },
          query: {
            search: queryParams.search || null,
            filters: queryParams.filter || {},
            format: queryParams.format || 'full',
            groupBy: queryParams.groupBy || null
          },
          performance: {
            duration,
            cacheHit: data.cacheHit || false
          },
          regions: formattedData.regions || null
        },
        headers: {
          'X-Total-Count': data.total.toString(),
          'X-Page': (queryParams.page || 0).toString(),
          'X-Limit': (queryParams.limit || 1000).toString(),
          'X-Performance': `${duration}ms`,
          'Cache-Control': 'public, max-age=3600'
        }
      })

    } catch (error) {
      const duration = Date.now() - startTime
      
      // Comprehensive error logging
      logger.error('Country list request failed', {
        ...logContext,
        error: error.message,
        errorCode: error.code,
        stack: error.stack,
        duration,
        query: this.sanitizeLogQuery(ctx.query)
      })

      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to retrieve country list',
        layer: 'ListCountriesHandler.run',
        meta: {
          originalError: error.message,
          duration,
          queryParams: this.sanitizeLogQuery(ctx.query)
        }
      })
    }
  }

  /**
   * Parse and prepare query parameters with defaults and validation
   */
  static async prepareQueryParams(query, logContext) {
    try {
      // Log the incoming query for debugging
      logger.debug('Preparing query parameters', { 
        ...logContext, 
        rawQuery: query 
      })

      const params = {
        page: parseInt(query.page) || 0,
        limit: parseInt(query.limit) || 1000,
        search: query.search?.trim(),
        filter: { ...query.filter },
        format: query.format || 'full',
        groupBy: query.groupBy,
        useCache: query.useCache !== false, // Default to true
        orderByField: 'name',
        orderByDirection: 'asc'
      }

      // Parse sorting parameters using BaseHandler utility
      const sortParams = this.parseSort(query)
      if (sortParams && sortParams.length > 0) {
        // Use the first sort parameter (could be extended for multiple sorts)
        params.orderByField = sortParams[0].field
        params.orderByDirection = sortParams[0].direction
      }

      // Parse bracket notation filters (filter[key]=value)
      const allowedFilters = [
        'name', 'nicename', 'iso', 'iso3', 'phonecode', 'numcode', 
        'isActive', 'region'
      ]
      
      Object.keys(query).forEach(key => {
        const bracketMatch = key.match(/^filter\[(\w+)\]$/)
        if (bracketMatch) {
          const filterKey = bracketMatch[1]
          
          if (allowedFilters.includes(filterKey)) {
            params.filter[filterKey] = query[key]
            logger.debug('Parsed bracket filter', { 
              ...logContext, 
              filterKey, 
              filterValue: query[key] 
            })
          } else {
            logger.warn('Invalid filter key in bracket notation', { 
              ...logContext, 
              filterKey, 
              allowedFilters 
            })
            throw new ErrorWrapper({
              ...errorCodes.VALIDATION,
              message: `Invalid filter parameter: ${filterKey}. Allowed filters: ${allowedFilters.join(', ')}`,
              layer: 'ListCountriesHandler.prepareQueryParams',
              meta: {
                allowedFilters,
                providedFilter: filterKey
              }
            })
          }
        }
      })

      // Parse fields if provided
      if (query.fields) {
        if (typeof query.fields === 'string') {
          params.fields = query.fields.split(',').map(field => field.trim())
        } else if (Array.isArray(query.fields)) {
          params.fields = query.fields
        }
      }

      // Apply default active filter if not specified
      if (!params.filter.hasOwnProperty('isActive')) {
        params.filter.isActive = true
      }

      // Set reasonable limit for performance
      if (params.limit > 1000) {
        params.limit = 1000
      }

      logger.debug('Prepared query parameters', { 
        ...logContext, 
        preparedParams: params 
      })

      return params

    } catch (error) {
      logger.error('Failed to prepare query parameters', {
        ...logContext,
        error: error.message,
        rawQuery: query
      })
      
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Invalid query parameters',
        layer: 'ListCountriesHandler.prepareQueryParams',
        meta: {
          originalError: error.message,
          query
        }
      })
    }
  }

  /**
   * Retrieve country data using appropriate method (cached or direct)
   */
  static async retrieveCountryData(params, logContext) {
    try {
      if (params.useCache) {
        return await CountryDAO.getCachedList(params)
      } else {
        return await CountryDAO.getAdvancedList(params)
      }
    } catch (error) {
      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to retrieve country data from database',
        layer: 'ListCountriesHandler.retrieveCountryData',
        meta: {
          originalError: error.message,
          params
        }
      })
    }
  }

  /**
   * Format response based on requested format and apply enhancements
   */
  static async formatResponse(data, params, logContext) {
    try {
      let formattedResults = data.results

      // Apply format-specific transformations
      switch (params.format) {
        case 'minimal':
          formattedResults = formattedResults.map(country => ({
            id: country.id,
            name: country.name,
            iso: country.iso,
            phonecode: country.phonecode
          }))
          break
        
        case 'codes-only':
          formattedResults = formattedResults.map(country => ({
            iso: country.iso,
            iso3: country.iso3,
            name: country.name
          }))
          break
        
        case 'full':
        default:
          // Full format includes all fields (default)
          break
      }

      // Apply grouping if requested
      let groupedData = null
      if (params.groupBy) {
        groupedData = this.applyGrouping(formattedResults, params.groupBy)
      }

      return {
        results: groupedData || formattedResults,
        regions: groupedData ? Object.keys(groupedData) : null,
        cacheHit: data.cacheHit
      }

    } catch (error) {
      logger.warn('Failed to format response, returning raw data', {
        ...logContext,
        error: error.message
      })
      
      return {
        results: data.results,
        regions: null,
        cacheHit: data.cacheHit
      }
    }
  }

  /**
   * Apply grouping to results
   */
  static applyGrouping(results, groupBy) {
    switch (groupBy) {
      case 'region':
        return this.groupByRegion(results)
      
      case 'phonecode':
        return results.reduce((groups, country) => {
          const key = country.phonecode || 'unknown'
          if (!groups[key]) groups[key] = []
          groups[key].push(country)
          return groups
        }, {})
      
      default:
        return null
    }
  }

  /**
   * Group countries by geographical region
   */
  static groupByRegion(results) {
    const regionMappings = {
      'Europe': ['AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'SM', 'UA', 'VA'],
      'Asia': ['AF', 'AM', 'AZ', 'BD', 'BH', 'BN', 'BT', 'CN', 'GE', 'HK', 'ID', 'IL', 'IN', 'IQ', 'IR', 'JO', 'JP', 'KG', 'KH', 'KP', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LK', 'MM', 'MN', 'MO', 'MV', 'MY', 'NP', 'OM', 'PH', 'PK', 'PS', 'QA', 'SA', 'SG', 'SY', 'TH', 'TJ', 'TL', 'TM', 'TR', 'TW', 'UZ', 'VN', 'YE'],
      'Africa': ['AO', 'BF', 'BI', 'BJ', 'BW', 'CD', 'CF', 'CG', 'CI', 'CM', 'CV', 'DJ', 'DZ', 'EG', 'EH', 'ER', 'ET', 'GA', 'GH', 'GM', 'GN', 'GQ', 'GW', 'KE', 'KM', 'LR', 'LS', 'LY', 'MA', 'MG', 'ML', 'MR', 'MU', 'MW', 'MZ', 'NA', 'NE', 'NG', 'RW', 'SC', 'SD', 'SL', 'SN', 'SO', 'SS', 'ST', 'SZ', 'TD', 'TG', 'TN', 'TZ', 'UG', 'ZA', 'ZM', 'ZW'],
      'North America': ['AG', 'BB', 'BZ', 'CA', 'CR', 'CU', 'DM', 'DO', 'GD', 'GT', 'HN', 'HT', 'JM', 'KN', 'LC', 'MX', 'NI', 'PA', 'SV', 'TT', 'US', 'VC'],
      'South America': ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE'],
      'Oceania': ['AS', 'AU', 'CK', 'FJ', 'FM', 'GU', 'KI', 'MH', 'MP', 'NC', 'NF', 'NR', 'NU', 'NZ', 'PF', 'PG', 'PN', 'PW', 'SB', 'TK', 'TO', 'TV', 'VU', 'WF', 'WS']
    }

    const grouped = {}
    
    results.forEach(country => {
      let region = 'Other'
      
      for (const [regionName, codes] of Object.entries(regionMappings)) {
        if (codes.includes(country.iso)) {
          region = regionName
          break
        }
      }
      
      if (!grouped[region]) grouped[region] = []
      grouped[region].push(country)
    })

    return grouped
  }

  /**
   * Sanitize query parameters for logging (remove sensitive data)
   */
  static sanitizeLogQuery(query) {
    const sanitized = { ...query }
    
    // Remove internal processing fields from logs
    delete sanitized._processed
    delete sanitized._processingId
    delete sanitized._timestamp
    
    return sanitized
  }
}

module.exports = ListCountriesHandler
