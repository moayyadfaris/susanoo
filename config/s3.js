const { BaseConfig, ErrorWrapper, errorCodes } = require('backend-core')
const uuid = require('uuid')
const path = require('path')
const aws = require('aws-sdk')
const multerS3 = require('multer-s3')
const s3 = new aws.S3()
const logger = require('../util/logger')

class S3Config extends BaseConfig {
  constructor () {
    super()
    this.access = this.set('S3_ACCESS', this.joi.string().required())
    this.secret = this.set('S3_SECRET', this.joi.string().required())
    this.bucket = this.set('S3_BUCKET', this.joi.string().required())
    this.baseUrl = this.set('S3_BASE_URL', this.joi.string().required()) + '/'
    this.mimeTypes = this.set('ALLOWED_MIME_TYPES', this.joi.string().required()).split(',')
    this.thumbnailSizes = this.set('ALLOWED_THUMBNAIL_SIZES', this.joi.string().required()).split(',')
    this.videoMimeTypes = this.set('VIDEO_MIME_TYPES', this.joi.string().required()).split(',')
    this.videoStreamTypes = this.set('VIDEO_STREAM_TYPES', this.joi.string().required()).split(',')
    var self = this // todo
    this.multerConfig = {
      mimeType: this.mimeTypes,
      storage: multerS3({
        s3: s3,
        acl: 'public-read',
        bucket: this.bucket,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
          cb(null, { fieldName: file.fieldname })
        },
        key: function (req, file, cb) {
          const date = new Date()
          const year = date.getFullYear()
          const month = date.getMonth()
          cb(null, 'attachments/' + year + '/' + month + '/' + uuid.v4() + path.extname(file.originalname).toLowerCase())
        }
      }),
      fileFilter: function (req, file, cb) {
        if (self.mimeTypes.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new ErrorWrapper({ ...errorCodes.FILE_TYPE_ERROR }), false) // if validation failed then generate error
        }
      }
    }
  }
  async init () {
    logger.debug(`${this.constructor.name}: Initialization finish...`)
  }
}

module.exports = new S3Config()
