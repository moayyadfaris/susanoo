const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const CategoryModel = require('models/CategoryModel')
const { getCategoryService } = require('services')

/**
 * Usage: PUT /api/v1/categories/{id} { "description": "Updated copy" }
 */
class UpdateCategoryHandler extends BaseHandler {
  static get accessTag() {
    return 'categories:update'
  }

  static get validationRules() {
    return {
      params: {
        id: new RequestRule(new Rule({
          validator: (value) => typeof value === 'string' && value.length > 0,
          description: 'uuid string'
        }), { required: true })
      },
      body: {
        name: new RequestRule(CategoryModel.schema.name),
        slug: new RequestRule(CategoryModel.schema.slug),
        description: new RequestRule(CategoryModel.schema.description),
        isActive: new RequestRule(CategoryModel.schema.isActive),
        metadata: new RequestRule(CategoryModel.schema.metadata)
      }
    }
  }

  static async run(req) {
    const categoryService = getCategoryService()
    if (!req.params?.id) {
      throw new ErrorWrapper({ ...errorCodes.VALIDATION_FAILED, message: 'Category id is required' })
    }

    const context = {
      userId: req.currentUser?.id || req.user?.id || null
    }

    const record = await categoryService.updateCategory(req.params.id, req.body, context)
    return this.updated(record, 'Category updated successfully')
  }
}

module.exports = UpdateCategoryHandler
