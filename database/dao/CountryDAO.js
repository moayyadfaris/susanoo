const { BaseDAO, assert } = require('backend-core')
const CountryModel = require('../../models/CountryModel')
const { redisClient } = require('handlers/RootProvider')
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
    redisClient.removePatternKey('*countries*')
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
    try {
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

    } catch (error) {
      throw error
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
    } catch (error) {
      // Fallback to direct database query if caching fails
      return await this.getAdvancedList(params)
    }
  }
}

module.exports = CountryDAO
