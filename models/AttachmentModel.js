const joi = require('@hapi/joi')
const { BaseModel, Rule } = require('backend-core')
const UserModel = require('../models/UserModel')
const S3Config = require(__folders.config).s3
/**
 * @swagger
 * definitions:
 *   AttachmentFiles:
 *     allOf:
 *       - required:
 *         - id
 *       - properties:
 *          id:
 *            type: integer
 *            format: integer
 *          fullPath:
 *            type: string
 *          mimeType:
 *            type: string
 *          size:
 *            type: integer
 *          originalName:
 *            type: string
 *          thumbnails:
 *            type: object
 *            properties:
 *               path:
 *                type: string
 *               dimension:
 *                type: string
 */
const schema = {
  id: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.number().integer().positive())
      } catch (e) { return e.message }
      return true
    },
    description: 'number integer positive'
  }),
  userId: UserModel.schema.id,
  path: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().min(10).max(5000))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; min 3; max 5000;'
  }),
  mimeType: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().valid(...S3Config.mimeTypes))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; min 3; max 5000;'
  }),
  size: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.number().min(10).max(1073741824))
      } catch (e) { return e.message }
      return true
    },
    description: 'file size; min 10 bytes; max 1 GB;'
  })
}

class AttachmentModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = AttachmentModel
