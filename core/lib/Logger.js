const pino = require('pino')

const { Assert: assert } = require('./assert')
const { ValidatorNano: validator } = require('./validator/ValidatorNano')
const { SentryCatch } = require('./SentryCatch')
const { AbstractLogger } = require('./AbstractLogger')

const $ = Symbol('private scope')

class Logger extends AbstractLogger {
  constructor({ appName, capture = false, sentryDsn, raw = false, sentryEnvironment } = {}) {
    super()

    assert.string(appName, { required: true })
    assert.boolean(capture)
    assert.string(sentryDsn)
    assert.string(sentryEnvironment)

    if (capture && !sentryDsn) {
      throw new Error(`${this.constructor.name}: Please define 'sentryDsn' param`)
    }

    this[$] = {
      sentryCatch: capture ? new SentryCatch(sentryDsn, sentryEnvironment) : null,

      fatalLogger: pino({
        name: `${appName.toLowerCase()}::fatal`,
        errorLikeObjectKeys: ['err', 'error'],
        ...(!raw && { transport: {
          target: 'pino-pretty',
          options: {
            colorize: true
          }
        } })
      }),
      errorLogger: pino({
        name: `${appName.toLowerCase()}::error`,
        errorLikeObjectKeys: ['err', 'error'],
        ...(!raw && { transport: {
          target: 'pino-pretty',
          options: {
            colorize: true
          }
        } })
      }),
      warnLogger: pino({
        name: `${appName.toLowerCase()}::warn`,
        ...(!raw && { transport: {
          target: 'pino-pretty',
          options: {
            colorize: true
          }
        } })
      }),
      infoLogger: pino({
        name: `${appName.toLowerCase()}::info`,
        ...(!raw && { transport: {
          target: 'pino-pretty',
          options: {
            colorize: true
          }
        } })
      }),
      debugLogger: pino({
        level: 20,
        name: `${appName.toLowerCase()}::debug`,
        ...(!raw && { transport: {
          target: 'pino-pretty',
          options: {
            colorize: true
          }
        } })
      }),
      traceLogger: pino({
        level: 10,
        name: `${appName.toLowerCase()}::trace`,
        ...(!raw && { transport: {
          target: 'pino-pretty',
          options: {
            colorize: true
          }
        } })
      })
    }
  }

  /**
   * ------------------------------
   * @PRIVATE_HELPERS
   * ------------------------------
   */

  _captureException(error, payload) {
    if (this[$].sentryCatch) this[$].sentryCatch.captureException(error, payload)
  }

  _captureMessage(message, payload) {
    if (this[$].sentryCatch) this[$].sentryCatch.captureMessage(message, payload)
  }

  /**
   * ------------------------------
   * @ERROR_METHODS
   * ------------------------------
   */

  fatal(message, error, meta) {
    assert.string(message, { required: true })
    assert.isOk(error, { required: true })
    assert.isOk(meta)

    const payload = validator.isObject(meta) ? { ...error, ...meta } : { error, meta }

    this._captureException(error, payload)
    this[$].fatalLogger.fatal(message, meta || error.toString())
  }

  error(message, error, meta) {
    assert.string(message, { required: true })
    assert.isOk(error, { required: true })
    assert.isOk(meta)

    const payload = validator.isObject(meta) ? { ...error, ...meta } : { ...error, meta }

    this._captureException(error, payload)
    this[$].errorLogger.error(message, payload)
  }

  warn(message, error, meta) {
    assert.string(message, { required: true })
    assert.isOk(error, { required: true })
    assert.isOk(meta)

    const payload = validator.isObject(meta) ? { ...error, ...meta } : { ...error, meta }

    this._captureException(error, payload)
    this[$].warnLogger.warn(message, payload)
  }

  /**
   * ------------------------------
   * @INFO_METHODS
   * ------------------------------
   */

  info(message, meta) {
    assert.string(message, { required: true })
    assert.isOk(meta)

    const payload = validator.isObject(meta) ? meta : { meta }

    this._captureMessage(message, payload)
    this[$].infoLogger.info(message, payload)
  }

  debug(message, meta) {
    assert.string(message, { required: true })
    assert.isOk(meta)

    const payload = validator.isObject(meta) ? meta : { meta }

    this[$].debugLogger.debug(message, payload)
  }

  trace(message, meta) {
    assert.string(message, { required: true })
    assert.isOk(meta)

    const payload = validator.isObject(meta) ? meta : { meta }

    this[$].traceLogger.trace(message, payload)
  }
}

module.exports = { Logger }
