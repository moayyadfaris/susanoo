/**
 * Session Services Index
 * 
 * Central export point for all session-related services and entities.
 * This module provides a unified interface for accessing session
 * management, caching, and invalidation services.
 * 
 * @version 1.0.0
 * @author Susanoo API Team
 */

// Session entities
const SessionEntity = require('../entities/SessionEntity')

// Session services
const SessionCacheService = require('./SessionCacheService')
const SessionInvalidationService = require('./SessionInvalidationService')
const SessionUtils = require('./SessionUtils')

// Session management functions (legacy compatibility)
const sessionManagement = require('./SessionManagementService')

/**
 * Initialize session services with dependencies
 * @param {Object} dependencies - Service dependencies
 * @param {Object} dependencies.redisClient - Redis client
 * @param {Object} dependencies.sessionDAO - Session data access object
 * @param {Object} dependencies.logger - Logger instance
 * @param {Object} config - Service configuration
 * @returns {Object} Initialized session services
 */
function initializeSessionServices(dependencies = {}, config = {}) {
  // Initialize session cache service
  const sessionCacheService = new SessionCacheService({
    redisClient: dependencies.redisClient,
    logger: dependencies.logger,
    config: config.cache
  })

  return {
    sessionCacheService,
    SessionInvalidationService, // Static service for now
    sessionManagement, // Legacy functions
    SessionEntity
  }
}

/**
 * Session service factory
 * Creates and configures session services based on provided options
 */
class SessionServiceFactory {
  constructor(dependencies = {}, config = {}) {
    this.dependencies = dependencies
    this.config = config
    this.services = null
  }

  /**
   * Initialize all session services
   * @returns {Object} Session services
   */
  initialize() {
    if (!this.services) {
      this.services = initializeSessionServices(this.dependencies, this.config)
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
   * @returns {Object} All session services
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

// Export individual service classes and entities
module.exports = {
  // Entity classes
  SessionEntity,
  
  // Service classes
  SessionCacheService,
  SessionInvalidationService,
  
  // Utility classes
  SessionUtils,
  
  // Legacy functions
  sessionManagement,
  
  // Factory and initialization functions
  SessionServiceFactory,
  initializeSessionServices,
  
  // Convenience exports for legacy compatibility
  addSession: sessionManagement,
  SessionRedisManager: SessionCacheService, // Backward compatibility alias
  
  // Default export for convenience
  default: initializeSessionServices
}