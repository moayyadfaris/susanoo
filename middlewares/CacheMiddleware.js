const { BaseMiddleware } = require('backend-core')
const logger = require('../util/logger')
const cacheRoutes = require('../config').cacheRoutes
const { redisClient } = require('handlers/RootProvider')
const { stripTrailingSlash } = require('helpers').commonHelpers

class CacheMiddleware extends BaseMiddleware {
  async init () {
    logger.debug(`${this.constructor.name} initialized...`)
  }

  handler () {
    return async (req, res, next) => {
      const url = stripTrailingSlash(req.originalUrl)
      if (cacheRoutes.filter(s => s === url || url.match(formatRoute(s))).length > 0) {
        const result = await redisClient.getKey(req.originalUrl)
        if (result) {
          res.header(result['headers'])
          delete result['status']
          delete result['headers']
          return res.json(result)
        }
      }
      next()
    }
  }
}

function formatRoute (template) {
  template = template.replace(/:[^/]+/g, '([^/]+)')
  template = new RegExp(`^${template}$`)
  return template
}

module.exports = { CacheMiddleware }
