const router = require('express').Router()
const handlers = require(__folders.handlers + '/v1/app/stories')
const { BaseController } = require(__folders.controllers + '/BaseController')

class StoriesController extends BaseController {
  get router () {
    router.param('id', preparePostId)
    /**
     * @swagger
     * /stories:
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
     * /stories/{id}:
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
     *                     country:
     *                       type: array
     *                       items:
     *                         $ref: '#/definitions/Country'
     *                     attachmentFiles:
     *                       type: array
     *                       items:
     *                         $ref: '#/definitions/AttachmentFiles'
     *                     attachmentLinks:
     *                       type: array
     *                       items:
     *                         $ref: '#/definitions/AttachmentLinks'
     *       '400':
     *         description: Bad request
     *       '409':
     *         description: duplicate data
     */
    router.get('/stories/:id', this.handlerRunner(handlers.GetStoryByIdHandler))
    /**
     * @swagger
     * /stories:
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
     *             countryId:
     *               type: integer
     *               format: number
     *             attachmentFiles:
     *               type: array
     *               items:
     *                type: string
     *             attachmentLinks:
     *               type: array
     *               items:
     *                type: string
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
     * /stories/{id}:
     *   patch:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Stories
     *     summary: update story by id
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
     *             countryId:
     *               type: integer
     *               format: number
     *             attachmentFiles:
     *               type: array
     *               items:
     *                type: string
     *             attachmentLinks:
     *               type: array
     *               items:
     *                type: string
     *             isInEditMode:
     *               type: boolean
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
    router.patch('/stories/:id', this.handlerRunner(handlers.UpdateStoryHandler))
    /**
     * @swagger
     * /stories/{id}:
     *   delete:
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

    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

function preparePostId (req, res, next) {
  const id = Number(req.params.id)
  if (id) req.params.id = id
  next()
}

module.exports = { StoriesController }
