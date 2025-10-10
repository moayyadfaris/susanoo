const router = require('express').Router()

const handlers = require('handlers/v1/app/config')
const { BaseController } = require('controllers/BaseController')

class ConfigController extends BaseController {
  get router () {
    /**
     * @swagger
     * /config:
     *   get:
     *     tags:
     *      - Config
     *     summary: Get App config
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     responses:
     *       '200':
     *         description: Countries list
     *         schema:
     *           type: array
     *       '400':
     *         description: Bad request
     */
    router.get('/config', this.handlerRunner(handlers.GetConfigHandler))
    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { ConfigController }

