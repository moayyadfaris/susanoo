const router = require('express').Router()

const handlers = require(__folders.handlers + '/v1/web/stories')
const { BaseController } = require(__folders.controllers + '/BaseController')

class StoriesController extends BaseController {
  get router () {
    router.param('id', preparePostId)
    /**
     * @swagger
     * /web/stories:
     *   post:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Stories
     *     summary: create new story from reporter
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
     *             title:
     *               type: string
     *             details:
     *               type: string
     *             tags:
     *               type: array
     *               items:
     *                type: string
     *             fromTime:
     *               type: date
     *               format: date
     *             toTime:
     *               type: date
     *               format: date
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
     *                     countryId:
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
    router.post('/stories', this.handlerRunner(handlers.CreateStoryHandler))
    /**
     * @swagger
     * /web/stories:
     *   get:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Stories
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
     *         name: term
     *         schema:
     *          type: string
     *       - in: query
     *         name: page
     *         schema:
     *          type: number
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
     *                     countryId:
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
    router.get('/stories/', this.handlerRunner(handlers.ListStoriesHandler))
    /**
     * @swagger
     * /web/stories/{id}:
     *   get:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Stories
     *     summary: get story by id
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     parameters:
     *       - name: id
     *         in: path
     *         type: number
     *     responses:
     *       '200':
     *         description: get story
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
     *                     countryId:
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
    router.get('/stories/:id', this.handlerRunner(handlers.GetStoryByIdHandler))
    /**
     * @swagger
     * /web/stories/{id}:
     *   put:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Stories
     *     summary: delete story by id
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     parameters:
     *       - name: id
     *         in: path
     *         schema:
     *           type: number
     *     responses:
     *       '200':
     *         description: Story has been deleted
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
     *       '409':
     *         description: duplicate data
     *       '404':
     *         description: Empty response, not found
     *       '403':
     *         description: Access denied
     */
    router.delete('/stories/:id', this.handlerRunner(handlers.RemoveStoryHandler))
    /**
     * @swagger
     * web/stories/{id}:
     *   patch:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Stories
     *     summary: update story status (SUBMITTED/IN_PROGRESS)
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     parameters:
     *       - name: id
     *         in: path
     *         schema:
     *           type: number
     *       - name: body
     *         in: body
     *         schema:
     *           type: object
     *           properties:
     *             title:
     *               type: string
     *             details:
     *               type: string
     *             tags:
     *               type: array
     *               items:
     *                type: string
     *             toTime:
     *               type: date
     *               format: date
     *     responses:
     *       '200':
     *         description: story was updated
     *       '400':
     *         description: Bad request validation error
     *       '404':
     *         description: Empty response, not found
     *       '403':
     *         description: Access denied
     *       '401':
     *         description: Story already in this status
     */
    router.patch('/stories/:id', this.handlerRunner(handlers.UpdateStoryHandler))
    return router
  }

  async init () {
    this.logger.debug(`{WEB} ${this.constructor.name} initialized...`)
  }
}

function preparePostId (req, res, next) {
  const id = Number(req.params.id)
  if (id) req.params.id = id
  next()
}

module.exports = { StoriesController }
