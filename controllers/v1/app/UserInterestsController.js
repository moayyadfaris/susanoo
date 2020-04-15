const router = require('express').Router()

const handlers = require(__folders.handlers + '/v1/app/userInterests')
const { BaseController } = require(__folders.controllers + '/BaseController')

class UserInterestsController extends BaseController {
  get router () {
    /**
     * @swagger
     * /users/current/interests:
     *   get:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     name: current
     *     summary: Get user interests
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     responses:
     *       '200':
     *         description: User interests list
     *         schema:
     *           type: array
     *           items:
     *             $ref: '#/definitions/Interest'
     *       '400':
     *         description: Bad request
     */
    router.get('/users/current/interests', this.handlerRunner(handlers.ListUserInterestsHandler))

    /**
     * @swagger
     * /users/current/interests:
     *   post:
     *     tags:
     *      - Users
     *     security:
     *      - JWT: []
     *     summary: Save user interests.
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     parameters:
     *       - name: body
     *         in: body
     *         schema:
     *           type: object
     *           properties:
     *             interests:
     *               type: array
     *               items:
     *                type: integer
     *     responses:
     *       '200':
     *         description: Interests added successfully.
     *         content:
     *         schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 message:
     *                   type: string
     *       '400':
     *         description: Bad request
     *       '403':
     *          description: Forbidden
     *       '404':
     *          description: user not found
     *
     */
    router.post('/users/current/interests', this.handlerRunner(handlers.AddUserInterestHandler))

    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { UserInterestsController }

