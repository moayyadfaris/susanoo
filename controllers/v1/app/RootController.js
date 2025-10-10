const router = require('express').Router()

const { BaseController } = require('controllers/BaseController')
const RootProvider = require('handlers/RootProvider')

class RootController extends BaseController {
  get router () {
    router.get('/', (req, res) => {
      res.json({ success: true, message: '(>___<)' })
    })

    router.post('/callback', (req, res) => {
      console.log(req)
      res.json({ success: true, message: '(>___<)' })
    })

    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
    await RootProvider.init()
  }
}

module.exports = { RootController }
