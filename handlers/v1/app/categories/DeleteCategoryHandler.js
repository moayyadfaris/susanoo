const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const { getCategoryService } = require('services')

/**
 * Usage: DELETE /api/v1/categories/{id}
 */
class DeleteCategoryHandler extends BaseHandler {
  static get accessTag() {
    return 'categories:delete'
  }

  static get validationRules() {
    return {
      params: {
        id: new RequestRule(new Rule({
          validator: (value) => typeof value === 'string' && value.length > 0,
          description: 'uuid string'
        }), { required: true })
      }
    }
  }

  static async run(req) {
    if (!req.params?.id) {
      throw new ErrorWrapper({ ...errorCodes.VALIDATION_FAILED, message: 'Category id is required' })
    }

    const categoryService = getCategoryService()
    const context = {
      userId: req.currentUser?.id || req.user?.id || null
    }

    await categoryService.deleteCategory(req.params.id, context)
    return this.deleted('Category deleted successfully')
  }
}

module.exports = DeleteCategoryHandler
