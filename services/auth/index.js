/**
 * Authentication Services Index
 * 
 * Central export point for all authentication-related services.
 * This module provides a unified interface for accessing authentication
 * business logic, security services, and caching services.
 * 
 * @version 1.0.0
 * @author Susanoo API Team
 */

// Core authentication services
const AuthService = require('./AuthService')
const AuthSecurityService = require('./AuthSecurityService')
const AuthCacheService = require('./AuthCacheService')

// Session services
const sessionServices = require('./session')

/**
 * Initialize authentication services with dependencies
 * @param {Object} dependencies - Service dependencies
 * @param {Object} dependencies.userDAO - User data access object
 * @param {Object} dependencies.sessionDAO - Session data access object
 * @param {Object} dependencies.redisClient - Redis client
 * @param {Object} dependencies.logger - Logger instance
 * @param {Object} dependencies.emailClient - Email client
 * @param {Object} dependencies.smsClient - SMS client
 * @param {Object} dependencies.slackClient - Slack client
 * @param {Object} config - Service configuration
 * @returns {Object} Initialized authentication services
 */
function initializeAuthServices(dependencies = {}, config = {}) {
  // Initialize authentication cache service first (used by other services)
  const authCacheService = new AuthCacheService({
    redisClient: dependencies.redisClient,
    logger: dependencies.logger,
    config: config.cache
  })

  // Initialize session services
  const sessionServiceInstances = sessionServices.initializeSessionServices(dependencies, config.session || {})

  // Initialize core authentication service
  const authService = new AuthService({
    userDAO: dependencies.userDAO,
    sessionDAO: dependencies.sessionDAO,
    authCacheService,
    sessionCacheService: sessionServiceInstances.sessionCacheService,
    logger: dependencies.logger,
    emailClient: dependencies.emailClient,
    smsClient: dependencies.smsClient,
    config: config.auth
  })

  // Initialize security service
  const authSecurityService = new AuthSecurityService({
    userDAO: dependencies.userDAO,
    sessionDAO: dependencies.sessionDAO,
    authCacheService,
    logger: dependencies.logger,
    emailClient: dependencies.emailClient,
    slackClient: dependencies.slackClient,
    config: config.security
  })

  return {
    authService,
    authSecurityService,
    authCacheService,
    ...sessionServiceInstances
  }
}

/**
 * Service factory for authentication domain
 * Creates and configures authentication services based on provided options
 */
class AuthServiceFactory {
  constructor(dependencies = {}, config = {}) {
    this.dependencies = dependencies
    this.config = config
    this.services = null
  }

  /**
   * Initialize all authentication services
   * @returns {Object} Authentication services
   */
  initialize() {
    if (!this.services) {
      this.services = initializeAuthServices(this.dependencies, this.config)
    }
    return this.services
  }

  /**
   * Get specific service instance
   * @param {string} serviceName - Name of the service
   * @returns {Object} Service instance
   */
  getService(serviceName) {
    if (!this.services) {
      this.initialize()
    }
    return this.services[serviceName]
  }

  /**
   * Get all services
   * @returns {Object} All authentication services
   */
  getAllServices() {
    if (!this.services) {
      this.initialize()
    }
    return this.services
  }

  /**
   * Destroy all services (cleanup)
   * @returns {Promise<void>}
   */
  async destroy() {
    if (this.services) {
      // Call destroy method on each service if it exists
      for (const service of Object.values(this.services)) {
        if (typeof service.destroy === 'function') {
          await service.destroy()
        }
      }
      this.services = null
    }
  }
}

// Export individual service classes
module.exports = {
  // Service classes
  AuthService,
  AuthSecurityService,
  AuthCacheService,
  
  // Session services
  ...sessionServices,
  
  // Factory and initialization functions
  AuthServiceFactory,
  initializeAuthServices,
  
  // Default export for convenience
  default: initializeAuthServices
}
