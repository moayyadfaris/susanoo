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
     *     summary: List interests
     *     description: Retrieve a paginated list of interests with optional search.
     *     parameters:
     *       - in: query
     *         name: search
     *         schema:
     *           type: string
     *         description: Search term to filter interests by name
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *         description: Page number (zero based)
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *         description: Page size (max 1000)
     *     responses:
     *       '200':
     *         description: Interests list
     */
    router.get('/interests', this.handlerRunner(handlers.ListInterestsHandler))

    /**
     * @swagger
     * /interests:
     *   post:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Interests
     *     summary: Create a new interest
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [name]
     *             properties:
     *               name:
     *                 type: string
     *               metadata:
     *                 type: object
     *     responses:
     *       '201':
     *         description: Interest created successfully
     */
    router.post('/interests', this.handlerRunner(handlers.CreateInterestHandler))

    /**
     * @swagger
     * /interests/{id}:
     *   get:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Interests
     *     summary: Get interest by id
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *         description: Interest identifier
     *     responses:
     *       '200':
     *         description: Interest retrieved successfully
     */
    router.get('/interests/:id', this.handlerRunner(handlers.GetInterestHandler))

    /**
     * @swagger
     * /interests/{id}:
     *   patch:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Interests
     *     summary: Update an interest
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *         description: Interest identifier
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               name:
     *                 type: string
     *               metadata:
     *                 type: object
     *     responses:
     *       '200':
     *         description: Interest updated successfully
     */
    router.patch('/interests/:id', this.handlerRunner(handlers.UpdateInterestHandler))

    /**
     * @swagger
     * /interests/{id}:
     *   delete:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Interests
     *     summary: Delete an interest
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *         description: Interest identifier
     *     responses:
     *       '200':
     *         description: Interest deleted successfully
     */
    router.delete('/interests/:id', this.handlerRunner(handlers.DeleteInterestHandler))

    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { InterestsController }
