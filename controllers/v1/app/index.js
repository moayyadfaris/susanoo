const { RootController } = require('./RootController')
const { AuthController } = require('./AuthController')
const { StoriesController } = require('./StoriesController')
const { UsersController } = require('./UsersController')
const { CountriesController } = require('./CountriesController')
const { InterestsController } = require('./InterestsController')
const { UserInterestsController } = require('./UserInterestsController')
const { UserStoriesController } = require('./UserStoriesController')
const { AttachmentsController } = require('./AttachmentsController')
const { StoryAttachmentsController } = require('./StoryAttachmentsController')
const { ConfigController } = require('./ConfigController')

module.exports = [
  RootController,
  AuthController,
  StoriesController,
  UsersController,
  CountriesController,
  InterestsController,
  UserInterestsController,
  UserStoriesController,
  AttachmentsController,
  StoryAttachmentsController,
  ConfigController
]
