const router = require('express').Router()

const actions = require(__folders.actions + '/v1/app/userStories')
const { BaseController } = require(__folders.controllers + '/BaseController')

class UserStoriesController extends BaseController {
  get router () {
    /**
     * @swagger
     * /users/current/stories:
     *   get:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: list of stories
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     parameters:
     *       - in: query
     *         name: status
     *         schema:
     *          type: string
     *       - in: query
     *         name: page
     *         schema:
     *          type: number
     *       - in: query
     *         name: term
     *         schema:
     *          type: string
     *       - in: query
     *         name: orderByDirection
     *         schema:
     *          type: string
     *          enum: [desc, asc]
     *     responses:
     *       '200':
     *         description: storyStatus has been created
     *         content:
     *         schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: object
     *                   properties:
     *                     title:
     *                      type: string
     *                     details:
     *                      type: string
     *                     id:
     *                      type: string
     *                     tags:
     *                      type: array
     *                      items:
     *                        $ref: '#/definitions/Tag'
     *       '400':
     *         description: Bad request
     *       '409':
     *         description: duplicate data
     */
    router.get('/users/current/stories', this.actionRunner(actions.ListUserStoriesAction))

    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { UserStoriesController }

