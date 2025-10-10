const { BaseMiddleware } = require('backend-core')
const logger = require('../util/logger')
const UserDAO = require('database/dao/UserDAO')

class CheckLanguageMiddleware extends BaseMiddleware {
  async init () {
    logger.debug(`${this.constructor.name} initialized...`)
  }

  handler () {
    return (req, res, next) => {
      if (req.currentUser.id) {
        const userLanguage = req.currentUser.language
        if (userLanguage !== req.headers['language']) {
          // language is different or unset for user
          UserDAO.baseUpdate(req.currentUser.id, { preferredLanguage: req.headers['language'] }).then({})
        }
      }
      next()
    }
  }
}

module.exports = { CheckLanguageMiddleware }
