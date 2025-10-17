/**
 * Country Services Module Index
 * 
 * Centralized exports for all country-related services
 * Provides easy access to the enterprise service layer
 * 
 * @version 1.0.0
 * @author Susanoo API Team
 */

const CountryService = require('./CountryService')
const CountryAnalyticsService = require('./CountryAnalyticsService')
const CountryCacheService = require('./CountryCacheService')
const CountryUtils = require('./CountryUtils')

/**
 * Factory function to create service instances with dependency injection
 * @param {Object} dependencies - Shared dependencies (DAOs, clients, etc.)
 * @param {Object} config - Service configuration
 * @returns {Object} Service instances
 */
function createCountryServices(dependencies = {}, config = {}) {
  const serviceConfig = {
    // Base service configuration
    logger: dependencies.logger,
    metrics: dependencies.metrics,
    eventEmitter: dependencies.eventEmitter,
    
    // Service-specific configurations
    countryService: config.countryService || {},
    analyticsService: config.analyticsService || {},
    cacheService: config.cacheService || {}
  }
  
  // Create service instances with shared dependencies
  const countryService = new CountryService({
    ...serviceConfig.countryService,
    countryDAO: dependencies.countryDAO,
    countryUtils: dependencies.countryUtils,
    logger: dependencies.logger
  })
  
  const analyticsService = new CountryAnalyticsService({
    ...serviceConfig.analyticsService,
    countryDAO: dependencies.countryDAO,
    logger: dependencies.logger
  })
  
  const cacheService = new CountryCacheService({
    ...serviceConfig.cacheService,
    redisClient: dependencies.redisClient,
    logger: dependencies.logger
  })
  
  return {
    countryService,
    analyticsService,
    cacheService
  }
}

/**
 * Singleton service manager for application-wide service instances
 */
class CountryServiceManager {
  constructor() {
    this.services = null
    this.dependencies = null
    this.config = null
  }
  
  /**
   * Initialize services with dependencies
   * @param {Object} dependencies - Application dependencies
   * @param {Object} config - Service configuration
   */
  initialize(dependencies, config = {}) {
    this.dependencies = dependencies
    this.config = config
    this.services = createCountryServices(dependencies, config)
    
    // Set up service cross-references if needed
    this.setupServiceIntegration()
    
    return this.services
  }
  
  /**
   * Get country service instance
   * @returns {CountryService} Country service
   */
  getCountryService() {
    this.ensureInitialized()
    return this.services.countryService
  }
  
  /**
   * Get analytics service instance
   * @returns {CountryAnalyticsService} Analytics service
   */
  getAnalyticsService() {
    this.ensureInitialized()
    return this.services.analyticsService
  }
  
  /**
   * Get cache service instance
   * @returns {CountryCacheService} Cache service
   */
  getCacheService() {
    this.ensureInitialized()
    return this.services.cacheService
  }
  
  /**
   * Get all services
   * @returns {Object} All service instances
   */
  getAllServices() {
    this.ensureInitialized()
    return this.services
  }
  
  /**
   * Set up integration between services
   * @private
   */
  setupServiceIntegration() {
    if (!this.services) return
    
    const { countryService, analyticsService, cacheService } = this.services
    
    // Integrate cache service with country service
    if (cacheService && countryService) {
      // Country service can use cache service for caching operations
      countryService.registerDependency('cacheService', cacheService)
    }
    
    // Analytics service can use country service for data access
    if (analyticsService && countryService) {
      analyticsService.registerDependency('countryService', countryService)
    }
    
    // Set up event listeners for cross-service communication
    this.setupServiceEvents()
  }
  
  /**
   * Set up inter-service event communication
   * @private
   */
  setupServiceEvents() {
    if (!this.services) return
    
    const { countryService, cacheService } = this.services
    
    // Cache invalidation on country updates
    if (countryService && cacheService) {
      countryService.on('country:updated', async (event) => {
        try {
          await cacheService.invalidateCountry(event.newCountry.id, {
            cascadeInvalidation: true
          })
        } catch (error) {
          countryService.logger?.error('Failed to invalidate cache after country update', {
            countryId: event.newCountry.id,
            error: error.message
          })
        }
      })
      
      countryService.on('country:bulk_updated', async (event) => {
        try {
          // Invalidate all affected countries
          const invalidationPromises = event.results.successful.map(result =>
            cacheService.invalidateCountry(result.id, { cascadeInvalidation: true })
          )
          await Promise.all(invalidationPromises)
        } catch (error) {
          countryService.logger?.error('Failed to invalidate caches after bulk update', {
            error: error.message
          })
        }
      })
    }
  }
  
  /**
   * Ensure services are initialized
   * @private
   */
  ensureInitialized() {
    if (!this.services) {
      throw new Error('CountryServiceManager not initialized. Call initialize() first.')
    }
  }
  
  /**
   * Reset and reinitialize services
   * @param {Object} dependencies - New dependencies
   * @param {Object} config - New configuration
   */
  reinitialize(dependencies, config = {}) {
    this.services = null
    return this.initialize(dependencies, config)
  }
  
  /**
   * Get service health status
   * @returns {Promise<Object>} Health status of all services
   */
  async getHealthStatus() {
    this.ensureInitialized()
    
    const healthChecks = await Promise.allSettled([
      this.services.countryService.healthCheck(),
      this.services.analyticsService.healthCheck(),
      this.services.cacheService.healthCheck()
    ])
    
    return {
      countryService: healthChecks[0].status === 'fulfilled' ? healthChecks[0].value : { status: 'error', error: healthChecks[0].reason },
      analyticsService: healthChecks[1].status === 'fulfilled' ? healthChecks[1].value : { status: 'error', error: healthChecks[1].reason },
      cacheService: healthChecks[2].status === 'fulfilled' ? healthChecks[2].value : { status: 'error', error: healthChecks[2].reason },
      overall: healthChecks.every(check => check.status === 'fulfilled') ? 'healthy' : 'degraded'
    }
  }
}

// Create singleton instance
const serviceManager = new CountryServiceManager()

// Direct exports for individual services
module.exports = {
  // Service classes
  CountryService,
  CountryAnalyticsService,
  CountryCacheService,
  
  // Utility classes
  CountryUtils,
  
  // Factory function
  createCountryServices,
  
  // Singleton manager
  CountryServiceManager,
  serviceManager,
  
  // Convenience methods for singleton access
  initialize: (dependencies, config) => serviceManager.initialize(dependencies, config),
  getCountryService: () => serviceManager.getCountryService(),
  getAnalyticsService: () => serviceManager.getAnalyticsService(),
  getCacheService: () => serviceManager.getCacheService(),
  getAllServices: () => serviceManager.getAllServices(),
  getHealthStatus: () => serviceManager.getHealthStatus()
}