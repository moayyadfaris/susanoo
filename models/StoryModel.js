const joi = require('@hapi/joi')
const { BaseModel, Rule } = require('backend-core')
const UserModel = require('./UserModel')
const { storyType } = require(__folders.config)
const storyTypeList = Object.values(storyType)
/**
 * @swagger
 *
 * definitions:
 *   storyStatus:
 *     allOf:
 *       - required:
 *         - id
 *       - properties:
 *              id:
 *               type: integer
 *              tags:
 *               type: array
 *               items:
 *                 $ref: '#/definitions/Tag'
 *              title:
 *               type: string
 *              countryId:
 *               type: id
 *              details:
 *               type: text
 *              type:
 *               type: string
 *              status:
 *               type: string
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
  title: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().min(1).max(500))
      } catch (e) { return e.message }
      return true
    },
    description: 'string; min 1;max 500'
  }),
  details: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string())
      } catch (e) { return e.message }
      return true
    },
    description: 'string;'
  }),
  userId: UserModel.schema.id,
  tags: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.array().items(joi.string()))
      } catch (e) { return e.message }
      return true
    },
    description: 'array of strings'
  }),
  status: new Rule({
    validator: v => (typeof v === 'string') && ['SUBMITTED', 'DRAFT', 'IN_PROGRESS', 'ARCHIVED', 'PUBLISHED', 'APPROVED', 'ASSIGNED', 'PENDING', 'FOR_REVIEW_SE'].includes(v),
    description: 'string; SUBMITTED, DRAFT, IN_PROGRESS, ARCHIVED, PUBLISHED, APPROVED, ASSIGNED, PENDING, FOR_REVIEW_SE'
  }),
  fromTime: new Rule({
    validator: v => (typeof v === 'string'),
    description: 'string; Date'
  }),
  toTime: new Rule({
    validator: v => (typeof v === 'string'),
    description: 'string; Date'
  }),
  type: new Rule({
    validator: v => (typeof v === 'string') && storyTypeList.includes(v),
    description: `enum; one of: ${storyTypeList}`
  })
}

class StoryModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = StoryModel
