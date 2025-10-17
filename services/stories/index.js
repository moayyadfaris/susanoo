/**
 * Story Services Module
 *
 * Provides enterprise-grade story service instances with dependency injection.
 */

const StoryService = require('./StoryService')
const StoryAttachmentService = require('./StoryAttachmentService')
const StoryUtils = require('./StoryUtils')

class StoryServiceManager {
  constructor() {
    this.services = null
    this.dependencies = null
    this.config = null
  }

  initialize(dependencies = {}, config = {}) {
    this.dependencies = dependencies
    this.config = config

    const storyAttachmentService = new StoryAttachmentService({
      storyAttachmentDAO: dependencies.storyAttachmentDAO,
      attachmentDAO: dependencies.attachmentDAO,
      storyDAO: dependencies.storyDAO,
      logger: dependencies.logger
    })

    const storyService = new StoryService({
      storyDAO: dependencies.storyDAO,
      userDAO: dependencies.userDAO,
      tagDAO: dependencies.tagDAO,
      storyAttachmentService,
      redisClient: dependencies.redisClient,
      logger: dependencies.logger,
      config: config.storyService || {}
    })

    this.services = { storyService, storyAttachmentService }
    return this.services
  }

  ensureInitialized() {
    if (!this.services) {
      throw new Error('StoryServiceManager not initialized')
    }
  }

  getStoryService() {
    this.ensureInitialized()
    return this.services.storyService
  }

  getStoryAttachmentService() {
    this.ensureInitialized()
    return this.services.storyAttachmentService
  }

  getAllServices() {
    this.ensureInitialized()
    return this.services
  }
}

const storyServiceManager = new StoryServiceManager()

module.exports = {
  initializeStoryServices: (dependencies, config = {}) => storyServiceManager.initialize(dependencies, config),
  getStoryService: () => storyServiceManager.getStoryService(),
  getStoryAttachmentService: () => storyServiceManager.getStoryAttachmentService(),
  getStoryServices: () => storyServiceManager.getAllServices(),
  StoryUtils
}
