const UserService = require('./UserService')

function initializeUserServices(dependencies = {}, config = {}) {
  const userService = new UserService({
    userDAO: dependencies.userDAO,
    countryDAO: dependencies.countryDAO,
    attachmentDAO: dependencies.attachmentDAO,
    notificationClient: dependencies.notificationClient,
    logger: dependencies.logger,
    config: config.registration || {}
  })

  return {
    userService
  }
}

module.exports = {
  UserService,
  initializeUserServices
}
