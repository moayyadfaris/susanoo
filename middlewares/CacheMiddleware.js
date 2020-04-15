const { BaseMiddleware } = require('backend-core')
const logger = require('../util/logger')
const cacheConfig = require('../config').cache
const { redisClient } = require(__folders.handlers + '/RootProvider')
class CacheMiddleware extends BaseMiddleware {
  async init () {
    logger.debug(`${this.constructor.name} initialized...`)
  }

  handler () {
    return async (req, res, next) => {
      if (cacheConfig.includes(req.originalUrl)) {
        const result = await redisClient.getKey(req.originalUrl)
        if (result) {
          if (result['headers']) {
            res.header(result['headers'])
            delete result['status']
            delete result['headers']
          }
          return res.json(result)
        }
      }
      next()
    }
  }
}

module.exports = { CacheMiddleware }
