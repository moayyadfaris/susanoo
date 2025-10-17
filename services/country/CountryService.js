/**
 * CountryService - Enterprise Country Business Logic Service
 * 
 * Centralized business logic for country operations including:
 * - CRUD operations with business validation
 * - Geographic analysis and calculations
 * - Data enrichment and transformation
 * - Cross-domain business rules
 * - Performance optimization
 * - Event-driven operations
 * 
 * @version 2.0.0
 * @author Susanoo API Team
 */

const BaseService = require('../BaseService')
const CountryDAO = require('../../database/dao/CountryDAO')
const CountryModel = require('../../models/CountryModel')
const CountryUtils = require('./CountryUtils')
const { ErrorWrapper } = require('backend-core')
const joi = require('joi')

/**
 * Enterprise country service with comprehensive business logic
 */
class CountryService extends BaseService {
  constructor(options = {}) {
    super(options)
    
    // Register dependencies
    this.registerDependency('countryDAO', options.countryDAO || CountryDAO)
    this.registerDependency('countryUtils', options.countryUtils || CountryUtils)
    
    // Business configuration
    this.config = {
      maxSearchResults: 100,
      defaultRadius: 1000, // km
      cacheDefaultTTL: 3600, // 1 hour
      ...options.config
    }
  }

  /**
   * Get country by ID with comprehensive enrichment
   * @param {number} id - Country ID
   * @param {Object} options - Enrichment options
   * @returns {Promise<Object>} Enhanced country data
   */
  async getCountryById(id, options = {}) {
    return this.executeOperation('getCountryById', async (context) => {
      // Validate input
      const validatedId = this.validateInput(id, joi.number().integer().positive().required())
      
      // Get country from DAO - use CountryDAO directly since it's a static method
      const country = await CountryDAO.getCountryById(validatedId)
      
      if (!country) {
        throw new ErrorWrapper({
          code: 'COUNTRY_NOT_FOUND',
          message: `Country with ID ${validatedId} not found`,
          statusCode: 404
        })
      }
      
      // Apply business enrichment
      const enrichedCountry = await this.enrichCountryData(country, options)
      
      // Emit business event
      this.emit('country:retrieved', { country: enrichedCountry, options, context })
      
      return enrichedCountry
    }, { countryId: id, options })
  }

  /**
   * Search countries with advanced business logic
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results with metadata
   */
  async searchCountries(criteria = {}, options = {}) {
    return this.executeOperation('searchCountries', async (context) => {
      // Validate and sanitize search criteria
      const validatedCriteria = this.validateSearchCriteria(criteria)
      const searchOptions = this.prepareSearchOptions(options)
      
      // Execute search with business rules - use CountryDAO directly since it's a static method
      const searchResults = await CountryDAO.getAdvancedList({
        ...validatedCriteria,
        ...searchOptions
      })
      
      // Apply business transformations
      const enrichedResults = await this.enrichSearchResults(searchResults, searchOptions)
      
      // Add search analytics
      const searchMetadata = this.generateSearchMetadata(validatedCriteria, enrichedResults)
      
      // Emit search event
      this.emit('country:searched', { 
        criteria: validatedCriteria, 
        results: enrichedResults,
        metadata: searchMetadata,
        context 
      })
      
      return {
        results: enrichedResults.results,
        metadata: searchMetadata,
        pagination: enrichedResults.pagination || {},
        total: enrichedResults.total || 0
      }
    }, { criteria, options })
  }

  /**
   * Find neighboring countries within radius
   * @param {number} countryId - Center country ID
   * @param {number} radiusKm - Search radius in kilometers
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Neighboring countries with distances
   */
  async findNeighboringCountries(countryId, radiusKm = null, options = {}) {
    return this.executeOperation('findNeighboringCountries', async (context) => {
      // Validate inputs
      const validatedId = this.validateInput(countryId, joi.number().integer().positive().required())
      const radius = radiusKm || this.config.defaultRadius
      
      // Get center country
      const centerCountry = await this.getCountryById(validatedId, { minimal: true })
      
      if (!centerCountry.latitude || !centerCountry.longitude) {
        throw new ErrorWrapper({
          code: 'MISSING_COORDINATES',
          message: 'Center country must have geographic coordinates',
          statusCode: 422
        })
      }
      
      // Find countries within radius - use CountryDAO directly since it's a static method
      const neighbors = await CountryDAO.findCountriesWithinRadius(
        centerCountry.latitude,
        centerCountry.longitude,
        radius
      )
      
      // Filter out the center country itself
      const filteredNeighbors = neighbors.filter(neighbor => neighbor.id !== validatedId)
      
      // Apply business enrichment if requested
      const enrichedNeighbors = options.includeDetails 
        ? await this.enrichCountriesArray(filteredNeighbors, options)
        : filteredNeighbors
      
      // Add geographic analysis
      const geographicAnalysis = this.analyzeGeographicDistribution(centerCountry, enrichedNeighbors)
      
      this.emit('country:neighbors_found', {
        centerCountry,
        neighbors: enrichedNeighbors,
        radius,
        analysis: geographicAnalysis,
        context
      })
      
      return {
        centerCountry,
        neighbors: enrichedNeighbors,
        radius,
        analysis: geographicAnalysis,
        total: enrichedNeighbors.length
      }
    }, { countryId, radiusKm, options })
  }

  /**
   * Update country with business validation
   * @param {number} id - Country ID
   * @param {Object} updateData - Data to update
   * @param {Object} context - Update context (user, audit info)
   * @returns {Promise<Object>} Updated country
   */
  async updateCountry(id, updateData, context = {}) {
    return this.executeOperation('updateCountry', async (operationContext) => {
      // Validate inputs
      const validatedId = this.validateInput(id, joi.number().integer().positive().required())
      const validatedData = this.validateUpdateData(updateData)
      
      // Get existing country
      const existingCountry = await this.getCountryById(validatedId, { minimal: true })
      
      // Apply business rules validation
      this.validateBusinessRules(existingCountry, validatedData, context)
      
      // Prepare update with audit trail
      const updatePayload = {
        ...validatedData,
        updatedAt: new Date(),
        lastModifiedBy: context.userId || null,
        version: (existingCountry.version || 1) + 1
      }
      
      // Execute update with transaction - use CountryDAO directly since it's a static method
      const updatedCountry = await CountryDAO.baseUpdate(validatedId, updatePayload)
      
      // Clear related caches
      await this.invalidateCountryCache(validatedId)
      
      // Emit update event
      this.emit('country:updated', {
        oldCountry: existingCountry,
        newCountry: updatedCountry,
        changes: this.calculateChanges(existingCountry, updatedCountry),
        context: { ...context, ...operationContext }
      })
      
      return await this.getCountryById(validatedId)
    }, { countryId: id, updateData, context })
  }

  /**
   * Get comprehensive country statistics
   * @param {Object} filters - Statistical filters
   * @returns {Promise<Object>} Country statistics
   */
  async getCountryStatistics(filters = {}) {
    return this.executeOperation('getCountryStatistics', async (context) => {
      // Get base statistics - use CountryDAO directly since it's a static method
      const baseStats = await CountryDAO.getCountryStats()
      
      // Enhanced analytics
      const enhancedStats = await this.enhanceStatistics(baseStats, filters)
      
      // Regional analysis
      const regionalAnalysis = await this.generateRegionalAnalysis(filters)
      
      // Economic indicators (if available)
      const economicData = await this.calculateEconomicIndicators(filters)
      
      const comprehensiveStats = {
        ...enhancedStats,
        regional: regionalAnalysis,
        economic: economicData,
        metadata: {
          generatedAt: new Date(),
          filters,
          source: 'CountryService'
        }
      }
      
      this.emit('country:statistics_generated', { statistics: comprehensiveStats, context })
      
      return comprehensiveStats
    }, { filters })
  }

  /**
   * Bulk update countries with transaction support
   * @param {Array} updates - Array of country updates
   * @param {Object} context - Update context
   * @returns {Promise<Object>} Bulk update results
   */
  async bulkUpdateCountries(updates, context = {}) {
    return this.executeOperation('bulkUpdateCountries', async (operationContext) => {
      // Validate bulk update input
      const validatedUpdates = this.validateBulkUpdates(updates)
      
      const results = {
        successful: [],
        failed: [],
        total: validatedUpdates.length
      }
      
      // Process updates in batches for performance
      const batchSize = 10
      for (let i = 0; i < validatedUpdates.length; i += batchSize) {
        const batch = validatedUpdates.slice(i, i + batchSize)
        
        await Promise.all(batch.map(async (update) => {
          try {
            const result = await this.updateCountry(update.id, update.data, context)
            results.successful.push({
              id: update.id,
              result
            })
          } catch (error) {
            results.failed.push({
              id: update.id,
              error: error.message,
              data: update.data
            })
          }
        }))
      }
      
      this.emit('country:bulk_updated', { results, context: operationContext })
      
      return results
    }, { updates, context })
  }

  // ===============================
  // PRIVATE BUSINESS LOGIC METHODS
  // ===============================

  /**
   * Enrich country data with additional business information
   * @private
   */
  async enrichCountryData(country, options = {}) {
    const countryUtils = this.getDependency('countryUtils')
    
    // Basic enrichment
    let enriched = countryUtils.validateAndEnrich(country)
    
    // Add computed properties
    if (options.includeComputedProperties !== false) {
      const model = new CountryModel()
      Object.assign(model, enriched)
      enriched = { ...enriched, ...model.getComputedProperties?.() || {} }
    }
    
    // Add regional context
    if (options.includeRegionalContext) {
      enriched.regionalContext = await this.getRegionalContext(country)
    }
    
    // Add economic indicators
    if (options.includeEconomicData) {
      enriched.economicIndicators = await this.getEconomicIndicators(country.id)
    }
    
    return enriched
  }

  /**
   * Validate search criteria with business rules
   * @private
   */
  validateSearchCriteria(criteria) {
    const schema = joi.object({
      search: joi.string().min(1).max(100).optional(),
      filter: joi.object().optional(),
      fields: joi.array().items(joi.string()).optional(),
      page: joi.number().integer().min(0).optional(),
      limit: joi.number().integer().min(1).max(1000).optional()
    })
    
    return this.validateInput(criteria, schema)
  }

  /**
   * Prepare search options with defaults
   * @private
   */
  prepareSearchOptions(options) {
    return {
      page: options.page || 0,
      limit: Math.min(options.limit || 50, this.config.maxSearchResults),
      format: options.format || 'full',
      useCache: options.useCache !== false,
      ...options
    }
  }

  /**
   * Validate update data
   * @private
   */
  validateUpdateData(data) {
    // Create validation schema for updates (partial country schema)
    const updateSchema = joi.object({
      name: joi.string().min(2).max(80).optional(),
      nicename: joi.string().min(2).max(80).optional(),
      isActive: joi.boolean().optional(),
      population: joi.number().integer().min(0).optional(),
      area: joi.number().min(0).optional(),
      currencyCode: joi.string().length(3).optional(),
      // Add other fields as needed
    }).min(1) // At least one field must be present
    
    return this.validateInput(data, updateSchema)
  }

  /**
   * Validate business rules for country updates
   * @private
   */
  validateBusinessRules(existingCountry, updateData, context) {
    // Example business rules
    if (updateData.isActive === false && existingCountry.isActive) {
      // Check if country can be deactivated
      this.logger.warn('Attempting to deactivate country', {
        countryId: existingCountry.id,
        country: existingCountry.name,
        user: context.userId
      })
    }
    
    // Add more business rules as needed
  }

  /**
   * Calculate changes between old and new country data
   * @private
   */
  calculateChanges(oldCountry, newCountry) {
    const changes = {}
    
    Object.keys(newCountry).forEach(key => {
      if (oldCountry[key] !== newCountry[key]) {
        changes[key] = {
          old: oldCountry[key],
          new: newCountry[key]
        }
      }
    })
    
    return changes
  }

  /**
   * Invalidate country-related caches
   * @private
   */
  async invalidateCountryCache(countryId) {
    // Implementation would depend on your caching strategy
    this.logger.debug('Invalidating country cache', { countryId })
  }

  /**
   * Generate search metadata
   * @private
   */
  generateSearchMetadata(criteria, results) {
    return {
      searchCriteria: criteria,
      resultCount: results.results?.length || 0,
      totalAvailable: results.total || 0,
      searchTime: new Date(),
      hasMore: (results.results?.length || 0) < (results.total || 0)
    }
  }

  /**
   * Enhance search results with business logic
   * @private
   */
  async enrichSearchResults(results, options) {
    if (options.format === 'minimal') {
      return results
    }
    
    // Apply enrichment to each result if needed
    if (options.enrich && results.results) {
      results.results = await this.enrichCountriesArray(results.results, options)
    }
    
    return results
  }

  /**
   * Enrich array of countries
   * @private
   */
  async enrichCountriesArray(countries, options) {
    return Promise.all(countries.map(country => 
      this.enrichCountryData(country, options)
    ))
  }

  /**
   * Analyze geographic distribution of countries
   * @private
   */
  analyzeGeographicDistribution(centerCountry, neighbors) {
    // Calculate average distance, spread, etc.
    const distances = neighbors.map(n => n.distance).filter(d => d != null)
    
    return {
      averageDistance: distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : 0,
      minDistance: distances.length > 0 ? Math.min(...distances) : 0,
      maxDistance: distances.length > 0 ? Math.max(...distances) : 0,
      neighborCount: neighbors.length,
      continents: [...new Set(neighbors.map(n => n.continent).filter(Boolean))],
      regions: [...new Set(neighbors.map(n => n.region).filter(Boolean))]
    }
  }

  /**
   * Placeholder for enhanced statistics
   * @private
   */
  async enhanceStatistics(baseStats, _filters) {
    return baseStats
  }

  /**
   * Placeholder for regional analysis
   * @private
   */
  async generateRegionalAnalysis(_filters) {
    return { message: 'Regional analysis coming soon' }
  }

  /**
   * Placeholder for economic indicators
   * @private
   */
  async calculateEconomicIndicators(_filters) {
    return { message: 'Economic indicators coming soon' }
  }

  /**
   * Validate bulk updates
   * @private
   */
  validateBulkUpdates(updates) {
    if (!Array.isArray(updates)) {
      throw new ErrorWrapper({
        code: 'INVALID_BULK_INPUT',
        message: 'Updates must be an array',
        statusCode: 422
      })
    }
    
    if (updates.length > 100) {
      throw new ErrorWrapper({
        code: 'BULK_LIMIT_EXCEEDED',
        message: 'Cannot update more than 100 countries at once',
        statusCode: 422
      })
    }
    
    return updates.map((update, index) => {
      if (!update.id || !update.data) {
        throw new ErrorWrapper({
          code: 'INVALID_BULK_ITEM',
          message: `Bulk update item at index ${index} must have 'id' and 'data' properties`,
          statusCode: 422
        })
      }
      
      return {
        id: parseInt(update.id),
        data: this.validateUpdateData(update.data)
      }
    })
  }
}

module.exports = CountryService