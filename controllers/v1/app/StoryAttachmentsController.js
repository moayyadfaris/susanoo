const router = require('express').Router()

const handlers = require('handlers/v1/app/storyAttachments')
const { BaseController } = require('controllers/BaseController')

class StoryAttachmentsController extends BaseController {
  get router () {
    /**
     * @swagger
     * /stories/{id}/attachments/{itemId}:
     *   delete:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Stories
     *     summary: delete attachment by id
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     parameters:
     *       - name: id
     *         in: path
     *         schema:
     *           type: number
     *         description: Story ID
     *       - name: itemId
     *         in: path
     *         schema:
     *           type: number
     *         description: Attachment ID
     *     responses:
     *       '200':
     *         description: attachment has been deleted
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
    router.delete('/stories/:id/attachments/:itemId', this.handlerRunner(handlers.RemoveStoryAttachmentHandler))

    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { StoryAttachmentsController }

