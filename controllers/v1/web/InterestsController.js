const router = require('express').Router()

const handlers = require(__folders.handlers + '/v1/web/interests')
const { BaseController } = require(__folders.controllers + '/BaseController')

class InterestsController extends BaseController {
  get router () {
    /**
     * @swagger
     * /web/interests:
     *   get:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Interests
     *     name: current
     *     summary: Get interests
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     responses:
     *       '200':
     *         description: Interests list
     *         schema:
     *           type: array
     *           items:
     *             $ref: '#/definitions/Interest'
     *       '400':
     *         description: Bad request
     */
    router.get('/interests', this.handlerRunner(handlers.ListInterestsHandler))
    return router
  }

  async init () {
    this.logger.debug(`{WEB} ${this.constructor.name} initialized...`)
  }
}

module.exports = { InterestsController }

