const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const { getCategoryService } = require('services')

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
          validator: (value) => Array.isArray(value) && value.every(id => typeof id === 'string' && id.length > 0),
          description: 'array of category ids'
        }), { required: true })
      }
    }
  }

  static async run(req) {
    if (!req.params?.storyId) {
      throw new ErrorWrapper({ ...errorCodes.VALIDATION_FAILED, message: 'storyId param is required' })
    }

    const categoryService = getCategoryService()
    const context = {
      userId: req.currentUser?.id || req.user?.id || null
    }

    const result = await categoryService.assignCategoriesToStory(req.params.storyId, req.body.categoryIds, context)
    return this.success(result, 'Story categories updated successfully')
  }
}

module.exports = AssignStoryCategoriesHandler
