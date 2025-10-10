const router = require('express').Router()

const handlers = require('handlers/v1/app/interests')
const { BaseController } = require('controllers/BaseController')

class InterestsController extends BaseController {
  get router () {
    /**
     * @swagger
     * /interests:
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
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { InterestsController }

