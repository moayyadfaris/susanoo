const stdout = require('stdout-stream')
const ErrorResponse = require('./ErrorResponse')
const { errorCodes, BaseMiddleware } = require('backend-core')

const notImportantCodes = [400, 401, 403, 404, 422]

class DevErrorMiddleware extends BaseMiddleware {
  async init() {
    this.logger.debug(`${this.constructor.name} initialized...`)
  }

  handler() {
    return (error, req, res, next) => {
      if (error.status === 404) {
        const errorRes = new ErrorResponse({
          ...error,
          src: `${process.env.NODE_ENV}:err:middleware`,
        })

        res.status(errorRes.status).json(errorRes)
      } else {
        const errorRes = new ErrorResponse({
          ...error,
          code: error.code || errorCodes.SERVER.code,
          status: error.status || errorCodes.SERVER.status,
          message: error.message || error,
          stack: !notImportantCodes.includes(error.status) ? error.stack : false,
          src: `${process.env.NODE_ENV}:err:middleware`,
          origin: error.origin ? { ...error.origin, message: error.origin.message } : false,
        })

        this.logger.error(errorRes.message, error)
        res.status(errorRes.status).json(errorRes)
      }

      if (error.stack) {
        stdout.write('--------------- ERROR STACK BEGIN --------------\n')
        stdout.write(`${new Date()} env:dev/regular error\n`)
        stdout.write(`${error.stack}\n`)
        stdout.write('---------------- ERROR STACK END ---------------\n\n')
      }
    }
  }
}

module.exports = { DevErrorMiddleware }
