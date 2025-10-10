const router = require('express').Router()

const handlers = require('handlers/v1/app/attachments')
const { BaseController } = require('controllers/BaseController')
const config = require('config')
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
    
    // Create multer instance with proper S3 storage configuration
    const upload = multer({
      storage: multer.memoryStorage(), // Store in memory for S3 upload
      limits: {
        fileSize: config.s3.maxFileSize, // 10MB default
        files: 1
      },
      fileFilter: (req, file, cb) => {
        // Check MIME type
        if (!config.s3.mimeTypes.includes(file.mimetype)) {
          const error = new Error(`File type ${file.mimetype} is not allowed`)
          error.code = 'INVALID_FILE_TYPE'
          return cb(error, false)
        }

        // Check file size based on type
        const maxSize = config.s3.getMaxSizeForType(file.mimetype)
        if (file.size && file.size > maxSize) {
          const error = new Error(`File size exceeds maximum allowed for ${file.mimetype}`)
          error.code = 'FILE_TOO_LARGE'
          return cb(error, false)
        }

        cb(null, true)
      }
    })

    router.post('/attachments', upload.single('file'), this.handlerRunner(handlers.CreateAttachmentHandler))

    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { AttachmentsController }

