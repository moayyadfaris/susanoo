const router = require('express').Router()

const handlers = require(__folders.handlers + '/v1/app/attachments')
const { BaseController } = require(__folders.controllers + '/BaseController')
const config = require(__folders.config)
const multer = require('multer')

class AttachmentsController extends BaseController {
  get router () {
    /**
     * @swagger
     * /attachments:
     *   post:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Attachments
     *     summary: Add attachment file
     *     produces:
     *       - multipart/form-data
     *     consumes:
     *       - multipart/form-data
     *     parameters:
     *       - in: formData
     *         name: file
     *         type: file
     *         description: The file to upload.
     *     responses:
     *       '200':
     *         description: attachment add successfully
     *       '400':
     *         description: Bad request
     *       '409':
     *         description: duplicate data
     */
    router.post('/attachments', multer(config.s3.multerConfig).single('file'), this.handlerRunner(handlers.CreateAttachmentHandler))

    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { AttachmentsController }

