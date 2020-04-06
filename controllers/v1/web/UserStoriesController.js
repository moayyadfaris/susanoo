const router = require('express').Router()
const actions = require(__folders.actions + '/v1/web/userStories')
const { BaseController } = require(__folders.controllers + '/BaseController')

class UserStoriesController extends BaseController {
  get router () {
    /**
     * @swagger
     * /users/{id}/stories:
     *   get:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: list of users stories
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     responses:
     *       '200':
     *         description: users stories
     *         content:
     *         schema:
     *       '400':
     *         description: Bad request
     *       '409':
     *         description: duplicate data
     */
    router.get('/users/:id/stories', this.actionRunner(actions.getUserStories))
    return router
  }

  async init () {
    this.logger.debug(`{WEB} ${this.constructor.name} initialized...`)
  }
}

module.exports = { UserStoriesController }

