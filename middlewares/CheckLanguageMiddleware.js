const { BaseMiddleware } = require('backend-core')
const logger = require('../util/logger')
const UserDAO = require(__folders.dao + '/UserDAO')

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
          UserDAO.baseUpdate(req.currentUser.id, { preferredLanguage: req.headers['language'], deviceType: req.headers['device-type'] }).then({})
        }
      }
      next()
    }
  }
}

module.exports = { CheckLanguageMiddleware }
