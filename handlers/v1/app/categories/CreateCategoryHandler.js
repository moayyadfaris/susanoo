const BaseHandler = require('handlers/BaseHandler')
const { RequestRule } = require('backend-core')
const CategoryModel = require('models/CategoryModel')
const { getCategoryService } = require('services')

/**
 * Usage: POST /api/v1/categories { "name": "Investigations", "slug": "investigations" }
 */
class CreateCategoryHandler extends BaseHandler {
  static get accessTag() {
    return 'categories:create'
  }

  static get validationRules() {
    return {
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
    const context = {
      userId: req.currentUser?.id || req.user?.id || null
    }

    const record = await categoryService.createCategory(req.body, context)
    return this.created(record, 'Category created successfully')
  }
}

module.exports = CreateCategoryHandler
