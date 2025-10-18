const router = require('express').Router()

const handlers = require('handlers/v1/app/storyCategories')
const { BaseController } = require('controllers/BaseController')

class StoryCategoriesController extends BaseController {
  get router() {
    /**
     * @swagger
     * /stories/{storyId}/categories:
     *   post:
     *     tags:
     *       - Story Categories
     *     summary: Assign categories to a story
     *     description: Replaces the categories associated with a story.
     *     operationId: assignStoryCategories
     *     parameters:
     *       - in: path
     *         name: storyId
     *         required: true
     *         schema:
     *           type: string
     *         description: Story identifier
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [categoryIds]
     *             properties:
     *               categoryIds:
     *                 type: array
     *                 items:
     *                   type: string
     *     responses:
     *       '200':
     *         description: Story categories updated successfully
     */
    router.post('/stories/:storyId/categories', this.handlerRunner(handlers.AssignStoryCategoriesHandler))

    return router
  }

  async init() {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { StoryCategoriesController }
