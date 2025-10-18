const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const { getCategoryService } = require('services')
const isUUID = require('validator/lib/isUUID')

/**
 * Usage: POST /api/v1/stories/{storyId}/categories { "categoryIds": ["uuid1", "uuid2"] }
 */
class AssignStoryCategoriesHandler extends BaseHandler {
  static get accessTag() {
    return 'stories:assign-categories'
  }

  static get validationRules() {
    return {
      params: {
        storyId: new RequestRule(new Rule({
          validator: (value) => typeof value === 'string' && value.length > 0,
          description: 'uuid string'
        }), { required: true })
      },
      body: {
        categoryIds: new RequestRule(new Rule({
          validator: (value) => Array.isArray(value) && value.every(id => typeof id === 'string' && isUUID(id)),
          description: 'array of category UUIDs'
        }), { required: true })
      }
    }
  }

  static async run(req) {
    if (!req.params?.storyId) {
      throw new ErrorWrapper({ ...errorCodes.VALIDATION_FAILED, message: 'storyId param is required' })
    }

    let payload = req.body
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch (error) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION_FAILED,
          message: 'Invalid JSON payload',
          meta: { originalError: error.message }
        })
      }
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION_FAILED,
        message: 'Request body must be a JSON object'
      })
    }

    if (!Array.isArray(payload.categoryIds)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION_FAILED,
        message: 'categoryIds must be an array'
      })
    }

    const invalidIds = payload.categoryIds.filter(id => typeof id !== 'string' || !isUUID(id))
    if (invalidIds.length > 0) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION_FAILED,
        message: 'One or more categoryIds are not valid UUIDs',
        meta: { invalidIds }
      })
    }

    const categoryService = getCategoryService()
    const context = {
      userId: req.currentUser?.id || req.user?.id || null
    }

    const result = await categoryService.assignCategoriesToStory(req.params.storyId, payload.categoryIds, context)
    return this.success(result, 'Story categories updated successfully')
  }
}

module.exports = AssignStoryCategoriesHandler
