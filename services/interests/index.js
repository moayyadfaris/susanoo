const InterestService = require('./InterestService')
const UserInterestService = require('./UserInterestService')
const InterestDAO = require('../../database/dao/InterestDAO')

class InterestServiceManager {
  constructor() {
    this.services = null
    this.dependencies = null
    this.config = null
  }

  initialize(dependencies = {}, config = {}) {
    this.dependencies = dependencies
    this.config = config

    const interestDAO = dependencies.interestDAO || InterestDAO
    const logger = dependencies.logger

    const interestService = new InterestService({
      interestDAO,
      logger,
      config: config.core || {}
    })

    const userInterestService = new UserInterestService({
      userDAO: dependencies.userDAO,
      interestDAO,
      logger,
      config: config.userInterests || {}
    })

    this.services = { interestService, userInterestService }
    return this.services
  }

  ensureInitialized() {
    if (!this.services) throw new Error('InterestServiceManager not initialized')
  }

  getUserInterestService() {
    this.ensureInitialized()
    return this.services.userInterestService
  }

  getInterestService() {
    this.ensureInitialized()
    return this.services.interestService
  }
}

const interestServiceManager = new InterestServiceManager()

module.exports = {
  initializeInterestServices: (dependencies, config = {}) => interestServiceManager.initialize(dependencies, config),
  getUserInterestService: () => interestServiceManager.getUserInterestService(),
  getInterestService: () => interestServiceManager.getInterestService()
}
