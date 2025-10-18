/**
 * Services Module Main Index
 * 
 * Central export point for all application services
 * Provides organized access to service layers across domains
 * 
 * @version 1.0.0
 * @author Susanoo API Team
 */

// Base service class
const BaseService = require('./BaseService')

// Country services
const countryServices = require('./country')

// Authentication services
const authServices = require('./auth')

// Attachment services
const attachmentServices = require('./attachments')

// Story services
const storyServices = require('./stories')
const categoryServices = require('./categories')
const runtimeSettingsServices = require('./runtimeSettings')
const interestServices = require('./interests')
const userServices = require('./users')

/**
 * Application service registry
 * Manages all service instances and dependencies
 */
class ServiceRegistry {
  constructor() {
    this.registeredServices = new Map()
    this.serviceInstances = new Map()
    this.dependencies = {}
    this.initialized = false
  }
  
  /**
   * Initialize the service registry with application dependencies
   * @param {Object} appDependencies - Application-wide dependencies
   * @param {Object} config - Service configuration
   */
  initialize(appDependencies = {}, config = {}) {
    this.dependencies = appDependencies
    
    // Initialize country services
    const countryServiceInstances = countryServices.initialize(appDependencies, config.country || {})
    this.serviceInstances.set('country', countryServiceInstances)

    // Initialize authentication services
    const authServiceInstances = authServices.initializeAuthServices(appDependencies, config.auth || {})
    this.serviceInstances.set('auth', authServiceInstances)

    // Initialize attachment services
    const attachmentServiceInstances = attachmentServices.AttachmentServiceFactory.createServices(config.attachments || {})
    this.serviceInstances.set('attachments', attachmentServiceInstances)

    // Initialize story services
    const storyServiceInstances = storyServices.initializeStoryServices(appDependencies, config.story || {})
    this.serviceInstances.set('stories', storyServiceInstances)

    const runtimeSettingsService = runtimeSettingsServices.initializeRuntimeSettingsService(config.runtimeSettings || {})
    this.serviceInstances.set('runtimeSettings', { runtimeSettingsService })

    const categoryService = categoryServices.initializeCategoryService(config.categories || {})
    this.serviceInstances.set('categories', { categoryService })

    // Initialize interests services
    const interestsServiceInstances = interestServices.initializeInterestServices(appDependencies, config.interests || {})
    this.serviceInstances.set('interests', interestsServiceInstances)

    // Initialize user services
    const userServiceInstances = userServices.initializeUserServices(appDependencies, config.users || {})
    this.serviceInstances.set('users', userServiceInstances)
    
    this.initialized = true
    
    return {
      country: countryServiceInstances,
      auth: authServiceInstances,
      attachments: attachmentServiceInstances,
      stories: storyServiceInstances,
      runtimeSettings: { runtimeSettingsService },
      categories: { categoryService },
      interests: interestsServiceInstances,
      users: userServiceInstances
    }
  }
  
  /**
   * Register a new service domain
   * @param {string} domain - Service domain name
   * @param {Object} serviceModule - Service module exports
   */
  registerServiceDomain(domain, serviceModule) {
    this.registeredServices.set(domain, serviceModule)
  }
  
  /**
   * Get services for a specific domain
   * @param {string} domain - Service domain
   * @returns {Object} Domain services
   */
  getServiceDomain(domain) {
    this.ensureInitialized()
    return this.serviceInstances.get(domain)
  }
  
  /**
   * Get all initialized services
   * @returns {Object} All service instances organized by domain
   */
  getAllServices() {
    this.ensureInitialized()
    const services = {}
    
    for (const [domain, instances] of this.serviceInstances.entries()) {
      services[domain] = instances
    }
    
    return services
  }
  
  /**
   * Get service health across all domains
   * @returns {Promise<Object>} Health status of all services
   */
  async getGlobalHealthStatus() {
    this.ensureInitialized()
    
    const healthStatus = {
      domains: {},
      overall: 'healthy',
      timestamp: new Date()
    }
    
    // Check country services health
    const countryServices = this.serviceInstances.get('country')
    if (countryServices) {
      try {
        healthStatus.domains.country = await countryServices.getHealthStatus()
        if (healthStatus.domains.country.overall !== 'healthy') {
          healthStatus.overall = 'degraded'
        }
      } catch (error) {
        healthStatus.domains.country = { status: 'error', error: error.message }
        healthStatus.overall = 'error'
      }
    }
    
    // Check authentication services health
    const authServices = this.serviceInstances.get('auth')
    if (authServices) {
      try {
        // Authentication services health check
        healthStatus.domains.auth = {
          authService: { status: 'healthy' },
          authSecurityService: { status: 'healthy' },
          authCacheService: { status: 'healthy' },
          overall: 'healthy'
        }
      } catch (error) {
        healthStatus.domains.auth = { status: 'error', error: error.message }
        healthStatus.overall = 'error'
      }
    }
    
    return healthStatus
  }
  
  /**
   * Reload services with new configuration
   * @param {Object} newConfig - Updated service configuration
   */
  reload(newConfig = {}) {
    this.initialized = false
    this.serviceInstances.clear()
    return this.initialize(this.dependencies, newConfig)
  }
  
  /**
   * Ensure registry is initialized
   * @private
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('ServiceRegistry not initialized. Call initialize() first.')
    }
  }
}

// Create singleton registry
const serviceRegistry = new ServiceRegistry()

/**
 * Factory function to create service instances with proper dependency injection
 * @param {Object} dependencies - Application dependencies
 * @param {Object} config - Service configuration
 * @returns {Object} Initialized service instances
 */
function createServices(dependencies = {}, config = {}) {
  return serviceRegistry.initialize(dependencies, config)
}

/**
 * Get a specific service domain
 * @param {string} domain - Service domain name
 * @returns {Object} Domain service instances
 */
function getServiceDomain(domain) {
  return serviceRegistry.getServiceDomain(domain)
}

/**
 * Convenience functions for accessing country services
 */
const countryServiceHelpers = {
  /**
   * Get country service instance
   * @returns {CountryService} Country service
   */
  getCountryService() {
    const countryDomain = serviceRegistry.getServiceDomain('country')
    return countryDomain?.countryService
  },
  
  /**
   * Get country analytics service
   * @returns {CountryAnalyticsService} Analytics service
   */
  getCountryAnalyticsService() {
    const countryDomain = serviceRegistry.getServiceDomain('country')
    return countryDomain?.analyticsService
  },
  
  /**
   * Get country cache service
   * @returns {CountryCacheService} Cache service
   */
  getCountryCacheService() {
    const countryDomain = serviceRegistry.getServiceDomain('country')
    return countryDomain?.cacheService
  },
  
  /**
   * Get country utilities
   * @returns {CountryUtils} Country utilities
   */
  getCountryUtils() {
    return require('./country/CountryUtils')
  }
}

/**
 * Convenience functions for accessing authentication services
 */
const authServiceHelpers = {
  /**
   * Get authentication service instance
   * @returns {AuthService} Auth service
   */
  getAuthService() {
    const authDomain = serviceRegistry.getServiceDomain('auth')
    return authDomain?.authService
  },
  
  /**
   * Get authentication security service
   * @returns {AuthSecurityService} Auth security service
   */
  getAuthSecurityService() {
    const authDomain = serviceRegistry.getServiceDomain('auth')
    return authDomain?.authSecurityService
  },
  
  /**
   * Get authentication cache service
   * @returns {AuthCacheService} Auth cache service
   */
  getAuthCacheService() {
    const authDomain = serviceRegistry.getServiceDomain('auth')
    return authDomain?.authCacheService
  }
}

const storyServiceHelpers = {
  /**
   * Get story service instance
   */
  getStoryService() {
    const storyDomain = serviceRegistry.getServiceDomain('stories')
    return storyDomain?.storyService
  },

  getStoryAttachmentService() {
    const storyDomain = serviceRegistry.getServiceDomain('stories')
    return storyDomain?.storyAttachmentService
  }
}

const categoryServiceHelpers = {
  /**
   * Get category service instance
   */
  getCategoryService() {
    const categoryDomain = serviceRegistry.getServiceDomain('categories')
    return categoryDomain?.categoryService
  }
}

const interestServiceHelpers = {
  getInterestService() {
    const interestDomain = serviceRegistry.getServiceDomain('interests')
    return interestDomain?.interestService
  },
  getUserInterestService() {
    const interestDomain = serviceRegistry.getServiceDomain('interests')
    return interestDomain?.userInterestService
  }
}

const userServiceHelpers = {
  getUserService() {
    const userDomain = serviceRegistry.getServiceDomain('users')
    return userDomain?.userService
  }
}

// Main exports
module.exports = {
  // Base service
  BaseService,
  
  // Service domains
  country: countryServices,
  auth: authServices,
  attachments: attachmentServices,
  stories: storyServices,
  categories: categoryServices,
  interests: interestServices,
  users: userServices,
  
  // Registry management
  ServiceRegistry,
  serviceRegistry,
  
  // Factory functions
  createServices,
  getServiceDomain,
  
  // Convenience methods
  initialize: (deps, config) => serviceRegistry.initialize(deps, config),
  getAllServices: () => serviceRegistry.getAllServices(),
  getHealthStatus: () => serviceRegistry.getGlobalHealthStatus(),
  reload: (config) => serviceRegistry.reload(config),
  
  // Helper functions for quick access to country services
  ...countryServiceHelpers,
  
  // Helper functions for quick access to authentication services
  ...authServiceHelpers,

  // Helper functions for quick access to story services
  ...storyServiceHelpers,
  ...categoryServiceHelpers,
  ...interestServiceHelpers,
  ...userServiceHelpers,

  // Runtime settings service
  getRuntimeSettingsService: runtimeSettingsServices.getRuntimeSettingsService,

  // Story utilities
  StoryUtils: storyServices.StoryUtils,
  
  // Country utilities
  getCountryUtils: countryServiceHelpers.getCountryUtils,
  
  // Legacy compatibility - direct service access
  getServices: () => serviceRegistry.getAllServices()
}

/**
 * Example usage:
 * 
 * // Initialize services in your application startup
 * const services = require('./services')
 * 
 * // In app.js or main.js:
 * const serviceInstances = services.initialize({
 *   countryDAO: require('./database/dao/CountryDAO'),
 *   userDAO: require('./database/dao/UserDAO'),
 *   sessionDAO: require('./database/dao/SessionDAO'),
 *   redisClient: require('./clients/RedisClient'),
 *   logger: require('./util/logger'),
 *   emailClient: require('./clients/EmailClient'),
 *   smsClient: require('./clients/SMSClient'),
 *   slackClient: require('./clients/SlackClient')
 * })
 * 
 * // In your handlers - Country services:
 * const { getCountryService } = require('./services')
 * 
 * async function handleCountryRequest(req, res) {
 *   const countryService = getCountryService()
 *   const country = await countryService.getCountryById(1)
 *   res.json(country)
 * }
 * 
 * // In your handlers - Authentication services:
 * const { getAuthService, getAuthSecurityService } = require('./services')
 * 
 * async function handleLogin(req, res) {
 *   const authService = getAuthService()
 *   const result = await authService.login(req.body.email, req.body.password, {
 *     ipAddress: req.ip,
 *     userAgent: req.get('User-Agent')
 *   })
 *   res.json(result)
 * }
 * 
 * async function handleSecurityCheck(req, res) {
 *   const authSecurityService = getAuthSecurityService()
 *   const isSecure = await authSecurityService.validateDeviceFingerprint(req.user.id, req.body.fingerprint)
 *   res.json({ secure: isSecure })
 * }
 */
