const AuditableDAO = require('../../core/lib/AuditableDAO')
const CategoryModel = require('../../models/CategoryModel')
const { Logger } = require('../../core/lib/Logger')

const logger = new Logger({
  appName: 'SusanooAPI-CategoryDAO',
  raw: process.env.NODE_ENV !== 'development'
})

class CategoryDAO extends AuditableDAO {
  static get tableName() {
    return 'categories'
  }

  static get jsonAttributes() {
    return ['metadata']
  }

  static get relationMappings() {
    return {
      stories: {
        relation: AuditableDAO.ManyToManyRelation,
        modelClass: `${__dirname}/StoryDAO`,
        join: {
          from: 'categories.id',
          through: {
            from: 'story_categories.categoryId',
            to: 'story_categories.storyId'
          },
          to: 'stories.id'
        }
      }
    }
  }

  /**
   * Apply enterprise formatting
   */
  $formatJson(json) {
    json = super.$formatJson(json)
    if (json.createdAt) json.createdAt = new Date(json.createdAt).toISOString()
    if (json.updatedAt) json.updatedAt = new Date(json.updatedAt).toISOString()
    return json
  }

  /**
   * Create category with slug uniqueness
   */
  static async createCategory(payload, trx = null) {
    const query = trx ? this.query(trx) : this.query()
    const timestamp = new Date().toISOString()

    const data = {
      ...payload,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    const category = await query.insert(data).returning('*')
    logger.info('Category created', { id: category.id, slug: category.slug })
    return category
  }

  /**
   * Update category and bump version
   */
  static async updateCategory(id, payload, trx = null) {
    const query = trx ? this.query(trx) : this.query()
    const data = {
      ...payload,
      updatedAt: new Date().toISOString()
    }

    const result = await query.patchAndFetchById(id, data)
    return result
  }
}

module.exports = CategoryDAO
