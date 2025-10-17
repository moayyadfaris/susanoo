const BaseHandler = require('handlers/BaseHandler')
const { RequestRule, Rule } = require('backend-core')
const { getCategoryService } = require('services')

/**
 * Usage: GET /api/v1/categories?search=breaking&page=0&limit=25
 */
class ListCategoriesHandler extends BaseHandler {
  static get accessTag() {
    return 'categories:list'
  }

  static get validationRules() {
    return {
      query: {
        search: new RequestRule(new Rule({
          validator: (value) => !value || (typeof value === 'string' && value.length <= 120),
          description: 'string; optional search term'
        })),
        isActive: new RequestRule(new Rule({
          validator: (value) => value === undefined || value === 'true' || value === 'false',
          description: 'boolean; filter by active state'
        })),
        page: new RequestRule(new Rule({
          validator: (value) => value === undefined || Number.isInteger(parseInt(value, 10)),
          description: 'number; page index'
        })),
        limit: new RequestRule(new Rule({
          validator: (value) => value === undefined || Number.isInteger(parseInt(value, 10)),
          description: 'number; page size'
        }))
      }
    }
  }

  static async run(req) {
    const categoryService = getCategoryService()
    const page = parseInt(req.query.page || '0', 10)
    const limit = Math.min(parseInt(req.query.limit || '25', 10), 100)
    const isActive = req.query.isActive === undefined ? undefined : req.query.isActive === 'true'

    const result = await categoryService.listCategories({
      search: req.query.search,
      isActive,
      page,
      limit
    })

    return this.success(result, 'Categories retrieved successfully')
  }
}

module.exports = ListCategoriesHandler
