const router = require('express').Router()

const actions = require(__folders.actionsV1 + '/web/cache')
const { BaseController } = require(__folders.controllers + '/BaseController')

class CacheController extends BaseController {
  get router () {
    router.delete('/cache', this.actionRunner(actions.ClearCacheAction))

    return router
  }

  async init () {
    this.logger.debug(`{WEB} ${this.constructor.name} initialized...`)
  }
}

module.exports = { CacheController }

