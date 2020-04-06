const router = require('express').Router()

const actions = require(__folders.actions + '/v1/app/interests')
const { BaseController } = require(__folders.controllers + '/BaseController')

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
    router.get('/interests', this.actionRunner(actions.ListInterestsAction))

    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { InterestsController }

