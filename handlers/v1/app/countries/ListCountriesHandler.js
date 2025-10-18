const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const CountryDAO = require('database/dao/CountryDAO') // Keep for backward compatibility
const { getCountryService } = require('services')

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
 * API Usage Examples:
 * 
 * Basic listing:
 * GET /countries?page=0&limit=20
 * 
 * Search by name:
 * GET /countries?search=jordan
 * 
 * Filter by ISO code (bracket notation):
 * GET /countries?filter[iso]=JO
 * 
 * Multiple filters (bracket notation):
 * GET /countries?filter[region]=asia&filter[isActive]=true
 * 
 * Filter with JSON payload (URL encoded):
 * GET /countries?filter=%7B%22region%22%3A%22asia%22%2C%22isActive%22%3Atrue%7D
 * 
 * Filter with JSON payload (readable format - needs URL encoding):
 * GET /countries?filter={"region":"asia","isActive":true}
 * 
 * Custom field selection:
 * GET /countries?fields=id,name,iso,phonecode
 * 
 * Grouped response:
 * GET /countries?groupBy=region&format=minimal
 * 
 * Advanced filtering examples:
 * GET /countries?filter[region]=europe&format=codes-only
 * GET /countries?filter[phonecode]=1&groupBy=region
 * GET /countries?search=united&filter[isActive]=true&fields=name,iso,phonecode
 * 
 * Valid regions: europe, asia, africa, north_america, south_america, oceania
 * Valid formats: full, minimal, codes-only
 * Valid groupBy: region, phonecode
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

        // Advanced filtering - support both JSON string and object formats
        filter: new RequestRule(new Rule({
          validator: v => {
            // Handle JSON string format (URL encoded or not)
            if (typeof v === 'string') {
              try {
                v = JSON.parse(v)
              } catch (parseError) {
                return `Filter must be a valid JSON object when passed as string: ${parseError.message}`
              }
            }
            
            // Must be an object after parsing
            if (typeof v !== 'object' || v === null || Array.isArray(v)) {
              return 'Filter must be an object'
            }
            
            const allowedFilters = [
              'name', 'nicename', 'iso', 'iso3', 'phonecode', 'numcode', 
              'isActive', 'region'
            ]
            
            const invalidKeys = Object.keys(v).filter(key => !allowedFilters.includes(key))
            if (invalidKeys.length > 0) {
              return `Invalid filter keys: ${invalidKeys.join(', ')}. Allowed: ${allowedFilters.join(', ')}`
            }
            
            // Validate region values if present
            if (v.region && !['europe', 'asia', 'africa', 'north_america', 'south_america', 'oceania'].includes(v.region.toLowerCase())) {
              return 'Invalid region. Allowed values: europe, asia, africa, north_america, south_america, oceania'
            }
            
            // Validate isActive if present
            if (v.isActive !== undefined && typeof v.isActive !== 'boolean' && v.isActive !== 'true' && v.isActive !== 'false') {
              return 'isActive must be a boolean or string "true"/"false"'
            }
            
            // Validate ISO codes if present
            if (v.iso && (typeof v.iso !== 'string' || v.iso.length !== 2)) {
              return 'ISO code must be a 2-character string'
            }
            
            if (v.iso3 && (typeof v.iso3 !== 'string' || v.iso3.length !== 3)) {
              return 'ISO3 code must be a 3-character string'
            }
            
            return true
          },
          description: 'object or JSON string; Filter conditions. Supports: name, nicename, iso, iso3, phonecode, numcode, isActive, region. Can be passed as JSON string or object. Also supports bracket notation: filter[key]=value'
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
      requestId: ctx.requestMetadata?.id || ctx.requestId,
      ip: ctx.requestMetadata?.ip || ctx.ip,
      userAgent: ctx.requestMetadata?.userAgent || ctx.headers?.['user-agent']
    }

    try {
      this.logger.info('Country list request initiated', {
        ...logContext,
        query: this.sanitizeLogQuery(ctx.processedQuery || ctx.query)
      })

      // Parse and prepare query parameters (prefer processedQuery from middleware)
      const rawQuery = ctx.processedQuery || ctx.query || {}
      const queryParams = await this.prepareQueryParams(rawQuery, logContext)
      
      // Execute the enhanced DAO query
      const data = await this.retrieveCountryData(queryParams)
      
      // Format and enhance the response
      const formattedData = await this.formatResponse(data, queryParams, logContext)

      // Performance monitoring
      const duration = Date.now() - startTime
      this.logger.info('Country list request completed', {
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
      this.logger.error('Country list request failed', {
        ...logContext,
        error: error.message,
        errorCode: error.code,
        stack: error.stack,
        duration,
        query: this.sanitizeLogQuery(ctx.processedQuery || ctx.query)
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
      this.logger.debug('Preparing query parameters', { 
        ...logContext, 
        rawQuery: query 
      })

      const params = {
        page: Number.isFinite(parseInt(query.page)) ? parseInt(query.page) : 0,
        limit: Number.isFinite(parseInt(query.limit)) ? parseInt(query.limit) : 1000,
        search: typeof query.search === 'string' ? query.search.trim() : query.search,
        filter: {},
        format: query.format || 'full',
        groupBy: query.groupBy,
        // coerce useCache: default true unless explicitly false/'false'
        useCache: (query.useCache === undefined) ? true : (query.useCache === true || query.useCache === 'true'),
        orderByField: 'name',
        orderByDirection: 'asc'
      }

      // Handle filter parameter - can be JSON string or object
      if (query.filter) {
        if (typeof query.filter === 'string') {
          try {
            params.filter = JSON.parse(query.filter)
            this.logger.debug('Parsed JSON filter', { 
              ...logContext, 
              originalFilter: query.filter,
              parsedFilter: params.filter 
            })
          } catch (parseError) {
            this.logger.warn('Failed to parse JSON filter', { 
              ...logContext, 
              filter: query.filter,
              error: parseError.message 
            })
            throw new ErrorWrapper({
              ...errorCodes.VALIDATION,
              message: `Invalid JSON in filter parameter: ${parseError.message}`,
              layer: 'ListCountriesHandler.prepareQueryParams',
              meta: {
                originalFilter: query.filter,
                parseError: parseError.message
              }
            })
          }
        } else if (typeof query.filter === 'object' && query.filter !== null) {
          params.filter = { ...query.filter }
        } else {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'Filter parameter must be a JSON string or object',
            layer: 'ListCountriesHandler.prepareQueryParams'
          })
        }
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
            this.logger.debug('Parsed bracket filter', { 
              ...logContext, 
              filterKey, 
              filterValue: query[key] 
            })
          } else {
            this.logger.warn('Invalid filter key in bracket notation', { 
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

      // Normalize and validate filter values
      if (Object.keys(params.filter).length > 0) {
        params.filter = this.normalizeFilterValues(params.filter, logContext)
      }

      // Set reasonable limit for performance
      if (params.limit > 1000) {
        params.limit = 1000
      }

      this.logger.debug('Prepared query parameters', { 
        ...logContext, 
        preparedParams: params 
      })

      return params

    } catch (error) {
      this.logger.error('Failed to prepare query parameters', {
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
   * Normalize and validate filter values
   */
  static normalizeFilterValues(filter, logContext) {
    const normalized = { ...filter }
    
    // Normalize isActive to boolean
    if (Object.prototype.hasOwnProperty.call(normalized, 'isActive')) {
      const v = normalized.isActive
      normalized.isActive = (v === true || v === 'true')
    } else {
      // Default to active countries only
      normalized.isActive = true
    }
    
    // Normalize region to lowercase
    if (normalized.region) {
      normalized.region = normalized.region.toLowerCase()
      
      // Validate region value
      const validRegions = ['europe', 'asia', 'africa', 'north_america', 'south_america', 'oceania']
      if (!validRegions.includes(normalized.region)) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: `Invalid region "${normalized.region}". Valid regions: ${validRegions.join(', ')}`,
          layer: 'ListCountriesHandler.normalizeFilterValues'
        })
      }
    }
    
    // Normalize ISO codes to uppercase
    if (normalized.iso) {
      normalized.iso = normalized.iso.toUpperCase()
      if (normalized.iso.length !== 2) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'ISO code must be exactly 2 characters',
          layer: 'ListCountriesHandler.normalizeFilterValues'
        })
      }
    }
    
    if (normalized.iso3) {
      normalized.iso3 = normalized.iso3.toUpperCase()
      if (normalized.iso3.length !== 3) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'ISO3 code must be exactly 3 characters',
          layer: 'ListCountriesHandler.normalizeFilterValues'
        })
      }
    }
    
    // Normalize phonecode and numcode to integers
    if (normalized.phonecode) {
      const phoneCode = parseInt(normalized.phonecode, 10)
      if (!Number.isInteger(phoneCode) || phoneCode <= 0) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Phone code must be a positive integer',
          layer: 'ListCountriesHandler.normalizeFilterValues'
        })
      }
      normalized.phonecode = phoneCode
    }
    
    if (normalized.numcode) {
      const numCode = parseInt(normalized.numcode, 10)
      if (!Number.isInteger(numCode) || numCode <= 0) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Numeric code must be a positive integer',
          layer: 'ListCountriesHandler.normalizeFilterValues'
        })
      }
      normalized.numcode = numCode
    }
    
    this.logger.debug('Normalized filter values', { 
      ...logContext, 
      originalFilter: filter,
      normalizedFilter: normalized 
    })
    
    return normalized
  }

  /**
   * Retrieve country data using appropriate method (cached or direct)
   */
  static async retrieveCountryData(params) {
    try {
      // Try to use the service layer if available, fallback to DAO for backward compatibility
      try {
        const countryService = getCountryService()
        if (countryService) {
          // Use the new service layer with enhanced business logic
          return await countryService.searchCountries({
            search: params.search,
            filter: params.filter,
            fields: params.fields
          }, {
            page: params.page,
            limit: params.limit,
            format: params.format,
            useCache: params.useCache,
            orderBy: {
              field: params.orderByField,
              direction: params.orderByDirection
            }
          })
        }
      } catch (serviceError) {
        // Log service error but don't fail - fallback to DAO
        this.logger.warn('Service layer unavailable, falling back to DAO', {
          error: serviceError.message,
          params
        })
      }
      
      // Fallback to direct DAO access for backward compatibility
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
      let formattedResults = (data.results || []).map(country => this.normalizeCountryRecord(country))

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
      this.logger.warn('Failed to format response, returning raw data', {
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
   * Normalize country record ensuring JSON fields are parsed
   */
  static normalizeCountryRecord(country) {
    if (!country || typeof country !== 'object') {
      return country
    }

    const normalized = { ...country }

    // Parse metadata JSON if provided as string
    if (typeof normalized.metadata === 'string' && normalized.metadata.trim()) {
      try {
        normalized.metadata = JSON.parse(normalized.metadata)
      } catch (error) {
        this.logger?.warn?.('Failed to parse country metadata JSON', {
          countryId: country.id,
          error: error.message
        })
        normalized.metadata = null
      }
    }

    // Ensure metadata is object or null
    if (normalized.metadata && (typeof normalized.metadata !== 'object' || Array.isArray(normalized.metadata))) {
      normalized.metadata = null
    }

    // Parse languages JSON array or comma-separated string
    if (typeof normalized.languages === 'string' && normalized.languages.trim()) {
      const value = normalized.languages.trim()
      try {
        normalized.languages = JSON.parse(value)
      } catch {
        // Fallback: split by comma if not valid JSON
        normalized.languages = value.includes(',')
          ? value.split(',').map(lang => lang.trim()).filter(Boolean)
          : [value]
      }
    }

    if (!Array.isArray(normalized.languages)) {
      normalized.languages = []
    }

    return normalized
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
    const regionMappings = REGION_MAPPINGS

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

  /**
   * Generate example URLs for API documentation
   * @static
   * @returns {Object} Example URLs for different use cases
   */
  static getExampleUrls() {
    const baseUrl = '/api/v1/countries'
    
    return {
      basic: `${baseUrl}?page=0&limit=20`,
      search: `${baseUrl}?search=jordan`,
      filterBracket: `${baseUrl}?filter[iso]=JO`,
      filterMultiple: `${baseUrl}?filter[region]=asia&filter[isActive]=true`,
      filterJson: `${baseUrl}?filter=${encodeURIComponent('{"region":"asia","isActive":true}')}`,
      fields: `${baseUrl}?fields=id,name,iso,phonecode`,
      grouped: `${baseUrl}?groupBy=region&format=minimal`,
      advanced: `${baseUrl}?search=united&filter[isActive]=true&fields=name,iso,phonecode&format=codes-only`
    }
  }
}

// Hoisted region mappings to avoid per-request allocation
const REGION_MAPPINGS = {
  'Europe': ['AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'SM', 'UA', 'VA'],
  'Asia': ['AF', 'AM', 'AZ', 'BD', 'BH', 'BN', 'BT', 'CN', 'GE', 'HK', 'ID', 'IL', 'IN', 'IQ', 'IR', 'JO', 'JP', 'KG', 'KH', 'KP', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LK', 'MM', 'MN', 'MO', 'MV', 'MY', 'NP', 'OM', 'PH', 'PK', 'PS', 'QA', 'SA', 'SG', 'SY', 'TH', 'TJ', 'TL', 'TM', 'TR', 'TW', 'UZ', 'VN', 'YE'],
  'Africa': ['AO', 'BF', 'BI', 'BJ', 'BW', 'CD', 'CF', 'CG', 'CI', 'CM', 'CV', 'DJ', 'DZ', 'EG', 'EH', 'ER', 'ET', 'GA', 'GH', 'GM', 'GN', 'GQ', 'GW', 'KE', 'KM', 'LR', 'LS', 'LY', 'MA', 'MG', 'ML', 'MR', 'MU', 'MW', 'MZ', 'NA', 'NE', 'NG', 'RW', 'SC', 'SD', 'SL', 'SN', 'SO', 'SS', 'ST', 'SZ', 'TD', 'TG', 'TN', 'TZ', 'UG', 'ZA', 'ZM', 'ZW'],
  'North America': ['AG', 'BB', 'BZ', 'CA', 'CR', 'CU', 'DM', 'DO', 'GD', 'GT', 'HN', 'HT', 'JM', 'KN', 'LC', 'MX', 'NI', 'PA', 'SV', 'TT', 'US', 'VC'],
  'South America': ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE'],
  'Oceania': ['AS', 'AU', 'CK', 'FJ', 'FM', 'GU', 'KI', 'MH', 'MP', 'NC', 'NF', 'NR', 'NU', 'NZ', 'PF', 'PG', 'PN', 'PW', 'SB', 'TK', 'TO', 'TV', 'VU', 'WF', 'WS']
}

module.exports = ListCountriesHandler
