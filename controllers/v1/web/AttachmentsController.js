const router = require('express').Router()

const actions = require(__folders.actions + '/v1/web/attachments')
const { BaseController } = require(__folders.controllers + '/BaseController')
const config = require(__folders.config)
const multer = require('multer')

class AttachmentsController extends BaseController {
  get router () {
    /**
     * @swagger
     * /web/attachments:
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
    router.post('/attachments', multer(config.s3.multerConfig).single('file'), this.actionRunner(actions.CreateAttachmentAction))

    return router
  }

  async init () {
    this.logger.debug(`{WEB} ${this.constructor.name} initialized...`)
  }
}

module.exports = { AttachmentsController }

