const { BaseMiddleware, ErrorWrapper, errorCodes } = require('backend-core')
const logger = require('../util/logger')

class ContentTypeMiddleware extends BaseMiddleware {
  async init () {
    logger.debug(`${this.constructor.name} initialized...`)
  }

  handler () {
    return async (req, res, next) => {
      try {
        // validate content-type
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
          const contentType = req.headers['Content-Type'] || req.headers['content-type']
          if (!contentType) {
            throw new ErrorWrapper({ ...errorCodes.BAD_REQUEST, message: 'Please provide content-type' })
          }

          const validContentType = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded; charset=UTF-8', 'application/json;charset=UTF-8']
          const isValidContentType = contentType.includes('application/json') || contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded') || contentType.includes('application/json;charset=UTF-8')

          if (!isValidContentType) {
            throw new ErrorWrapper({ ...errorCodes.BAD_REQUEST, message: `Invalid content type. Expect one of: [${validContentType}]` })
          }
        }

        next()
      } catch (error) {
        next(error)
      }
    }
  }
}

module.exports = { ContentTypeMiddleware }
