const { BaseDAO, assert } = require('backend-core')
const CountryModel = require('../../models/CountryModel')

/**
 * Safe Redis client getter with error handling
 */
function getRedisClient() {
  try {
    const { redisClient } = require('handlers/RootProvider')
    return redisClient
  } catch (error) {
    console.warn('Redis client not available:', error.message)
    return null
  }
}
class CountryDAO extends BaseDAO {
  static get tableName () {
    return 'countries'
  }

  /**
   * ------------------------------
   * @HOOKS
   * ------------------------------
   */
  $formatJson (json) {
    json = super.$formatJson(json)
    // delete sensitive and unwanted data from all queries
    delete json.createdAt
    delete json.updatedAt

    return json
  }

  /**
   * ------------------------------
   * @METHODS
   * ------------------------------
   */
  static async getCountryById (id) {
    assert.validate(id, CountryModel.schema.id, { required: true })
    const data = await this.query().where({ id }).first()
    if (!data) throw this.errorEmptyResponse()
    return data
  }

  $afterUpdate (opt, queryContext) {
    const redisClient = getRedisClient()
    if (redisClient) {
      redisClient.removePatternKey('*countries*')
    }
    return super.$afterUpdate(opt, queryContext)
  }

  /**
   * Enhanced country listing with comprehensive filtering and search
   * 
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number (0-based)
   * @param {number} params.limit - Records per page
   * @param {string} params.search - Search term for name, nicename, iso codes
   * @param {Object} params.filter - Filter conditions
   * @param {Array} params.fields - Fields to select
   * @param {string} params.orderByField - Field to sort by
   * @param {string} params.orderByDirection - Sort direction (asc/desc)
   * @returns {Promise<{results: Array, total: number}>}
   */
  static async getAdvancedList(params = {}) {
    // Build base query without pagination for counting
    let countQuery = this.buildAdvancedQuery({ ...params, page: undefined, limit: undefined })
    countQuery = countQuery.clearSelect().clearOrder().count('* as total').first()
    
    // Build the full query with pagination
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
  }

  /**
   * Build advanced query with filtering, search, sorting, and field selection
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

    // Apply field selection
    if (params.fields && params.fields.length > 0) {
      // Always include id for consistency
      const fieldsToSelect = [...new Set(['id', ...params.fields])]
      query = query.select(fieldsToSelect)
    }

    // Apply sorting
    if (params.orderByField && params.orderByDirection) {
      query = query.orderBy(params.orderByField, params.orderByDirection)
    } else {
      // Default sorting by name
      query = query.orderBy('name', 'asc')
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
        .orWhereRaw('LOWER(nicename) LIKE ?', [searchPattern])
        .orWhereRaw('LOWER(iso) LIKE ?', [searchPattern])
        .orWhereRaw('LOWER(iso3) LIKE ?', [searchPattern])
    })
  }

  /**
   * Apply advanced filter conditions to the query
   */
  static applyAdvancedFilters(query, filters) {
    Object.entries(filters).forEach(([key, value]) => {
      switch (key) {
        case 'name':
          query = query.whereRaw('LOWER(name) LIKE ?', [`%${value.toLowerCase()}%`])
          break
        
        case 'nicename':
          query = query.whereRaw('LOWER(nicename) LIKE ?', [`%${value.toLowerCase()}%`])
          break
        
        case 'iso':
          query = query.whereRaw('UPPER(iso) = ?', [value.toUpperCase()])
          break
        
        case 'iso3':
          query = query.whereRaw('UPPER(iso3) = ?', [value.toUpperCase()])
          break
        
        case 'phonecode':
          query = query.where('phonecode', value)
          break
        
        case 'numcode':
          query = query.where('numcode', value)
          break
        
        case 'isActive':
          query = query.where('isActive', value)
          break
        
        case 'region':
          // This would require additional data - for now, filter by continent groups
          this.applyRegionFilter(query, value)
          break
      }
    })

    return query
  }

  /**
   * Apply region-based filtering (basic implementation)
   */
  static applyRegionFilter(query, region) {
    const regionMappings = {
      'europe': ['AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'SM', 'UA', 'VA'],
      'asia': ['AF', 'AM', 'AZ', 'BD', 'BH', 'BN', 'BT', 'CN', 'GE', 'HK', 'ID', 'IL', 'IN', 'IQ', 'IR', 'JO', 'JP', 'KG', 'KH', 'KP', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LK', 'MM', 'MN', 'MO', 'MV', 'MY', 'NP', 'OM', 'PH', 'PK', 'PS', 'QA', 'SA', 'SG', 'SY', 'TH', 'TJ', 'TL', 'TM', 'TR', 'TW', 'UZ', 'VN', 'YE'],
      'africa': ['AO', 'BF', 'BI', 'BJ', 'BW', 'CD', 'CF', 'CG', 'CI', 'CM', 'CV', 'DJ', 'DZ', 'EG', 'EH', 'ER', 'ET', 'GA', 'GH', 'GM', 'GN', 'GQ', 'GW', 'KE', 'KM', 'LR', 'LS', 'LY', 'MA', 'MG', 'ML', 'MR', 'MU', 'MW', 'MZ', 'NA', 'NE', 'NG', 'RW', 'SC', 'SD', 'SL', 'SN', 'SO', 'SS', 'ST', 'SZ', 'TD', 'TG', 'TN', 'TZ', 'UG', 'ZA', 'ZM', 'ZW'],
      'north_america': ['AG', 'BB', 'BZ', 'CA', 'CR', 'CU', 'DM', 'DO', 'GD', 'GT', 'HN', 'HT', 'JM', 'KN', 'LC', 'MX', 'NI', 'PA', 'SV', 'TT', 'US', 'VC'],
      'south_america': ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE'],
      'oceania': ['AS', 'AU', 'CK', 'FJ', 'FM', 'GU', 'KI', 'MH', 'MP', 'NC', 'NF', 'NR', 'NU', 'NZ', 'PF', 'PG', 'PN', 'PW', 'SB', 'TK', 'TO', 'TV', 'VU', 'WF', 'WS']
    }

    if (regionMappings[region.toLowerCase()]) {
      query = query.whereIn('iso', regionMappings[region.toLowerCase()])
    }

    return query
  }

  /**
   * Get countries with comprehensive filtering and caching
   */
  static async getCachedList(params = {}) {
    const cacheKey = `countries:list:${JSON.stringify(params)}`
    const redisClient = getRedisClient()
    
    if (!redisClient) {
      // Fallback to direct database query if Redis is not available
      return await this.getAdvancedList(params)
    }
    
    try {
      // Try to get from cache first
      const cached = await redisClient.getKey(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }

      // Get from database
      const result = await this.getAdvancedList(params)
      
      // Cache for 1 hour (countries data doesn't change often)
      await redisClient.setKey(cacheKey, JSON.stringify(result), 3600)
      
      return result
    } catch {
      // Fallback to direct database query if caching fails
      return await this.getAdvancedList(params)
    }
  }

  /**
   * Enhanced search by name with database query
   * @param {string} query - Search query
   * @param {number} limit - Result limit
   * @returns {Promise<Array>} Matching countries
   */
  static async searchByName(query, limit = 10) {
    if (!query || query.trim().length < 2) {
      return []
    }

    const searchPattern = `%${query.trim().toLowerCase()}%`
    
    return this.query()
      .where(builder => {
        builder
          .whereRaw('LOWER(name) LIKE ?', [searchPattern])
          .orWhereRaw('LOWER(nicename) LIKE ?', [searchPattern])
          .orWhereRaw('LOWER(iso) LIKE ?', [searchPattern])
          .orWhereRaw('LOWER(iso3) LIKE ?', [searchPattern])
      })
      .where('isActive', true)
      .orderByRaw('CASE WHEN LOWER(name) LIKE ? THEN 0 WHEN LOWER(nicename) LIKE ? THEN 1 ELSE 2 END', 
        [`${query.trim().toLowerCase()}%`, `${query.trim().toLowerCase()}%`])
      .limit(limit)
  }

  /**
   * Find countries within radius of coordinates
   * @param {number} latitude - Center latitude
   * @param {number} longitude - Center longitude
   * @param {number} radiusKm - Search radius in kilometers
   * @returns {Promise<Array>} Countries within radius
   */
  static async findCountriesWithinRadius(latitude, longitude, radiusKm) {
    // Using Haversine formula in SQL for better performance
    const sql = `
      SELECT *, 
      (6371 * acos(cos(radians(?)) * cos(radians(latitude)) 
       * cos(radians(longitude) - radians(?)) + sin(radians(?)) 
       * sin(radians(latitude)))) AS distance
      FROM countries 
      WHERE latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND isActive = true
      HAVING distance <= ?
      ORDER BY distance
    `
    
    return this.knex().raw(sql, [latitude, longitude, latitude, radiusKm])
      .then(result => result.rows || result)
  }

  /**
   * Group countries by continent
   * @param {Object} filters - Additional filters
   * @returns {Promise<Object>} Countries grouped by continent
   */
  static async groupByContinent(filters = {}) {
    let query = this.query().where('isActive', true)
    
    // Apply additional filters
    if (filters.region) {
      query = query.where('region', filters.region)
    }
    if (filters.currencyCode) {
      query = query.where('currencyCode', filters.currencyCode)
    }
    
    const countries = await query.orderBy('name', 'asc')
    
    return countries.reduce((groups, country) => {
      const continent = country.continent || 'Unknown'
      if (!groups[continent]) {
        groups[continent] = []
      }
      groups[continent].push(country)
      return groups
    }, {})
  }

  /**
   * Get country statistics
   * @returns {Promise<Object>} Country statistics
   */
  static async getCountryStats() {
    const [
      totalCount,
      activeCount,
      continentStats,
      currencyStats,
      populationStats
    ] = await Promise.all([
      this.query().count('* as count').first(),
      this.query().where('isActive', true).count('* as count').first(),
      this.query()
        .select('continent')
        .count('* as count')
        .whereNotNull('continent')
        .groupBy('continent'),
      this.query()
        .select('currencyCode')
        .count('* as count')
        .whereNotNull('currencyCode')
        .groupBy('currencyCode')
        .orderBy('count', 'desc')
        .limit(10),
      this.query()
        .select(this.knex().raw('SUM(population) as totalPopulation, AVG(population) as avgPopulation'))
        .whereNotNull('population')
        .first()
    ])

    return {
      counts: {
        total: parseInt(totalCount.count),
        active: parseInt(activeCount.count),
        inactive: parseInt(totalCount.count) - parseInt(activeCount.count)
      },
      continents: continentStats.reduce((acc, item) => {
        acc[item.continent] = parseInt(item.count)
        return acc
      }, {}),
      topCurrencies: currencyStats.map(item => ({
        code: item.currencyCode,
        count: parseInt(item.count)
      })),
      population: {
        total: parseInt(populationStats.totalPopulation || 0),
        average: Math.round(parseFloat(populationStats.avgPopulation || 0))
      },
      lastUpdated: new Date().toISOString()
    }
  }

  /**
   * Get cached country by identifier
   * @param {string} field - Field to search by
   * @param {*} value - Value to search for
   * @returns {Promise<Object|null>} Country data
   */
  static async getCachedCountry(field, value) {
    const cacheKey = `country:${field}:${value}`
    const redisClient = getRedisClient()
    
    if (!redisClient) {
      // Fallback to direct query if Redis is not available
      return await this.query().where(field, value).first()
    }
    
    try {
      // Try cache first
      const cached = await redisClient.getKey(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }

      // Get from database
      const country = await this.query().where(field, value).first()
      
      if (country) {
        // Cache for 24 hours
        await redisClient.setKey(cacheKey, JSON.stringify(country), 24 * 60 * 60)
      }

      return country
    } catch {
      // Fallback to direct query if cache fails
      return await this.query().where(field, value).first()
    }
  }

  /**
   * Clear country-related cache
   * @param {string} pattern - Cache pattern to clear
   * @returns {Promise<number>} Number of keys cleared
   */
  static async clearCache(pattern = 'country*') {
    const redisClient = getRedisClient()
    if (!redisClient) {
      return 0
    }
    
    try {
      return await redisClient.removePatternKey(pattern)
    } catch {
      return 0
    }
  }

  /**
   * Enhanced search with flexible criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  static async searchCountries(criteria = {}, options = {}) {
    // Convert criteria to DAO format
    const params = this.convertCriteriaToDAOParams(criteria, options)
    
    // Use existing cached list method
    const result = await this.getCachedList(params)
    
    return result.results || []
  }

  /**
   * Convert search criteria to DAO parameters
   * @private
   */
  static convertCriteriaToDAOParams(criteria, options) {
    const {
      query,
      continent,
      region,
      currencyCode,
      isActive = true,
      includeInactive = false
    } = criteria

    const {
      limit = 50,
      offset = 0,
      sortBy = 'name',
      sortOrder = 'asc',
      fields = null
    } = options

    const params = {
      page: Math.floor(offset / limit),
      limit,
      orderByField: sortBy,
      orderByDirection: sortOrder,
      fields
    }

    // Build filter object
    const filter = {}
    
    if (!includeInactive) {
      filter.isActive = isActive
    }

    if (continent) {
      filter.continent = continent
    }

    if (region) {
      filter.region = region
    }

    if (currencyCode) {
      filter.currencyCode = currencyCode
    }

    if (Object.keys(filter).length > 0) {
      params.filter = filter
    }

    if (query) {
      params.search = query
    }

    return params
  }

  /**
   * Bulk updates country data with caching
   * @param {Array} countries - Array of country data to update
   * @returns {Promise<Object>} Update results
   */
  static async bulkUpdate(countries) {
    if (!Array.isArray(countries) || countries.length === 0) {
      return { updated: 0, errors: [] }
    }

    const results = { updated: 0, errors: [] }

    for (const countryData of countries) {
      try {
        // Use CountryUtils for validation (keeping separation of concerns)
        const CountryUtils = require('../../services/country/CountryUtils')
        const validated = CountryUtils.validateAndEnrich(countryData)
        
        if (validated.id) {
          await this.query()
            .where('id', validated.id)
            .update(validated)
        } else if (validated.iso) {
          await this.query()
            .where('iso', validated.iso)
            .update(validated)
        }

        results.updated++

        // Clear related cache
        if (validated.iso) {
          await this.clearCache(`country:iso:${validated.iso}`)
        }
      } catch (error) {
        results.errors.push({
          country: countryData,
          error: error.message
        })
      }
    }

    // Clear search cache
    await this.clearCache('countries:list:*')

    return results
  }
}

module.exports = CountryDAO
