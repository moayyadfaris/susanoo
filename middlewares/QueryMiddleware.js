const { BaseMiddleware, ErrorWrapper, errorCodes } = require('backend-core')
const logger = require('../util/logger')

class QueryMiddleware extends BaseMiddleware {
  async init () {
    logger.debug(`${this.constructor.name} initialized...`)
  }

  handler () {
    return async (req, res, next) => {
      try {
        // validate content-type
        if (req.method !== 'GET' && req.method !== 'OPTIONS' && req.method !== 'DELETE') {
          const contentType = req.headers['Content-Type'] || req.headers['content-type']
          const validContentType = ['application/json', 'multipart/form-data', 'application/json; charset=UTF-8']
          if (!contentType || (!validContentType.includes(contentType) && (contentType.indexOf('multipart/form-data') === -1))) {
            throw new ErrorWrapper({ ...errorCodes.BAD_REQUEST, message: `Invalid content type. Expect one of: [${validContentType}]` })
          }
        }

        const acceptLanguage = req.headers['Language'] || req.headers['language']
        const validAcceptLanguage = ['ar', 'en']
        if (acceptLanguage && (!validAcceptLanguage.includes(acceptLanguage))) {
          throw new ErrorWrapper({ ...errorCodes.BAD_REQUEST, message: `Invalid accept Language. Expect one of: [${validAcceptLanguage}]` })
        }

        // get method default query
        req.query = req.method === 'GET' ? {
          ...req.query,
          page: Number(req.query.page) || 0,
          limit: Number(req.query.limit) || 10,
          filter: req.query.filter || {},
          orderBy: {
            ...((req.query.orderByField && { field: req.query.orderByField }) || { field: 'createdAt' }),
            ...((req.query.orderByDirection && { direction: req.query.orderByDirection }) || { direction: 'desc' })
          }
        } : { ...req.query }

        if (req.query.orderByField) { delete req.query.orderByField }
        if (req.query.orderByDirection) { delete req.query.orderByDirection }

        next()
      } catch (error) {
        next(error)
      }
    }
  }
}

module.exports = { QueryMiddleware }
