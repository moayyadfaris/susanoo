// const RootController = require('controllers/RootController')
const { CountriesController } = require('./CountriesController')
const { AuthController } = require('./AuthController')
const { UsersController } = require('./UsersController')
const { InterestsController } = require('./InterestsController')
const { StoriesController } = require('./StoriesController')
const { AttachmentsController } = require('./AttachmentsController')
const { UserStoriesController } = require('./UserStoriesController')
const { CacheController } = require('./CacheController')

module.exports = [
  // RootController,
  CountriesController,
  AuthController,
  UsersController,
  InterestsController,
  StoriesController,
  AttachmentsController,
  UserStoriesController,
  CacheController
]
