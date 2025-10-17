/**
 * Attachment Services Index
 * 
 * Central export point for all attachment-related services in the enterprise
 * service layer architecture. Provides clean imports and dependency management
 * for attachment operations throughout the application.
 * 
 * @version 2.0.0
 * @author Susanoo API Team
 */

const AttachmentService = require('./AttachmentService')
const AttachmentCacheService = require('./AttachmentCacheService')
const AttachmentSecurityService = require('./AttachmentSecurityService')
const AttachmentUtils = require('./AttachmentUtils')

/**
 * Service factory for creating configured attachment services
 */
class AttachmentServiceFactory {
  /**
   * Create a fully configured attachment service with all dependencies
   * @param {Object} options - Configuration options
   * @returns {Object} Configured services
   */
  static createServices(options = {}) {
    // Create utility service (no dependencies)
    const attachmentUtils = AttachmentUtils
    
    // Create cache service
    const cacheService = new AttachmentCacheService({
      ...options.cache,
      attachmentUtils
    })
    
    // Create security service
    const securityService = new AttachmentSecurityService({
      ...options.security,
      attachmentUtils
    })
    
    // Create main attachment service with all dependencies
    const attachmentService = new AttachmentService({
      ...options.attachment,
      attachmentUtils,
      cacheService,
      securityService
    })
    
    return {
      attachmentService,
      cacheService,
      securityService,
      attachmentUtils
    }
  }
  
  /**
   * Create a lightweight attachment service for testing
   * @param {Object} mocks - Mock dependencies
   * @returns {AttachmentService} Service instance
   */
  static createTestService(mocks = {}) {
    return new AttachmentService({
      attachmentDAO: mocks.attachmentDAO,
      attachmentUtils: mocks.attachmentUtils || AttachmentUtils,
      config: {
        virusScanEnabled: false,
        metadataExtraction: false,
        thumbnailGeneration: false,
        ...mocks.config
      }
    })
  }
}

// Export individual services
module.exports = {
  // Main services
  AttachmentService,
  AttachmentCacheService,
  AttachmentSecurityService,
  AttachmentUtils,
  
  // Factory for easy service creation
  AttachmentServiceFactory,
  
  // Convenience exports for backward compatibility
  default: AttachmentService
}