const UserInterestService = require('./UserInterestService')

class InterestServiceManager {
  constructor() {
    this.services = null
    this.dependencies = null
    this.config = null
  }

  initialize(dependencies = {}, config = {}) {
    this.dependencies = dependencies
    this.config = config

    const userInterestService = new UserInterestService({
      userDAO: dependencies.userDAO,
      interestDAO: dependencies.interestDAO,
      logger: dependencies.logger,
      config: config.userInterests || {}
    })

    this.services = { userInterestService }
    return this.services
  }

  ensureInitialized() {
    if (!this.services) throw new Error('InterestServiceManager not initialized')
  }

  getUserInterestService() {
    this.ensureInitialized()
    return this.services.userInterestService
  }
}

const interestServiceManager = new InterestServiceManager()

module.exports = {
  initializeInterestServices: (dependencies, config = {}) => interestServiceManager.initialize(dependencies, config),
  getUserInterestService: () => interestServiceManager.getUserInterestService()
}
