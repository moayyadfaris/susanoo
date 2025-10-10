const router = require('express').Router()

const handlers = require('handlers/v1/web/cache')
const { BaseController } = require('controllers/BaseController')

class CacheController extends BaseController {
  get router () {
    router.delete('/cache', this.handlerRunner(handlers.ClearCacheHandler))

    return router
  }

  async init () {
    this.logger.debug(`{WEB} ${this.constructor.name} initialized...`)
  }
}

module.exports = { CacheController }

