const BaseService = require('../BaseService')
const CategoryDAO = require('../../database/dao/CategoryDAO')
const StoryDAO = require('../../database/dao/StoryDAO')
const CategoryModel = require('../../models/CategoryModel')
const { ErrorWrapper, errorCodes, assert } = require('backend-core')

class CategoryService extends BaseService {
  constructor(options = {}) {
    super(options)
    this.dao = CategoryDAO
  }

  async listCategories(filters = {}) {
    return this.executeOperation('listCategories', async () => {
      const query = this.dao.query()

      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`
        query.where(builder => {
          builder.whereRaw('LOWER(name) LIKE ?', [term])
            .orWhereRaw('LOWER(slug) LIKE ?', [term])
        })
      }

      if (filters.isActive !== undefined) {
        query.where('isActive', filters.isActive)
      }

      query.orderBy('name', 'asc')

      const page = filters.page ?? 0
      const limit = filters.limit ?? 25

      const results = await query.page(page, limit)
      return results
    }, { filters })
  }

  async createCategory(payload, context = {}) {
    return this.executeOperation('createCategory', async () => {
      const normalizedPayload = this.preparePayload(payload)
      await this.validatePayload(normalizedPayload)
      return this.dao.createCategory({
        ...normalizedPayload,
        createdBy: context.userId,
        updatedBy: context.userId
      })
    }, { payload, userId: context.userId })
  }

  async updateCategory(id, payload, context = {}) {
    return this.executeOperation('updateCategory', async () => {
      if (!id) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION_FAILED,
          message: 'Category id is required'
        })
      }
      const normalizedPayload = this.preparePayload(payload, { partial: true })
      await this.validatePayload(normalizedPayload, { partial: true })
      const updated = await this.dao.updateCategory(id, {
        ...normalizedPayload,
        updatedBy: context.userId
      })
      if (!updated) {
        throw new ErrorWrapper({ ...errorCodes.NOT_FOUND, message: 'Category not found' })
      }
      return updated
    }, { id, payload, userId: context.userId })
  }

  async deleteCategory(id, context = {}) {
    return this.executeOperation('deleteCategory', async () => {
      if (!id) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION_FAILED,
          message: 'Category id is required'
        })
      }

      const query = this.dao.query()
      if (context.userId) {
        await query.patchAndFetchById(id, {
          deletedAt: new Date().toISOString(),
          deletedBy: context.userId
        })
      }

      await this.dao.query().deleteById(id)
      return { id }
    }, { id, userId: context.userId })
  }

  async assignCategoriesToStory(storyId, categoryIds = [], context = {}) {
    return this.executeOperation('assignCategoriesToStory', async () => {
    assert.array(categoryIds, { required: true })

    const storyIdNumber = Number(storyId)
    if (!Number.isInteger(storyIdNumber) || storyIdNumber <= 0) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION_FAILED,
        message: 'storyId must be a positive integer'
      })
    }

    const story = await StoryDAO.query().findById(storyIdNumber)
    if (!story) {
      throw new ErrorWrapper({ ...errorCodes.NOT_FOUND, message: 'Story not found' })
    }

      const uniqueCategoryIds = [...new Set(categoryIds)]

      if (uniqueCategoryIds.length > 0) {
        const categories = await this.dao.query().whereIn('id', uniqueCategoryIds)
        if (categories.length !== uniqueCategoryIds.length) {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION_FAILED,
            message: 'One or more categories do not exist'
          })
        }
      }

    await StoryDAO.relatedQuery('categories').for(storyIdNumber).unrelate()
    if (uniqueCategoryIds.length > 0) {
      await StoryDAO.relatedQuery('categories').for(storyIdNumber).relate(uniqueCategoryIds)
    }

    return {
      storyId: storyIdNumber,
      categories: uniqueCategoryIds,
      updatedBy: context.userId || null
    }
    }, { storyId, categoryIds, userId: context.userId })
  }

  async validatePayload(payload, { partial = false } = {}) {
    if (!partial) {
      const requiredFields = ['name', 'slug']
      for (const field of requiredFields) {
        if (!payload[field]) {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION_FAILED,
            message: `${field} is required`
          })
        }
      }
    }

    const entries = Object.entries(payload)
    for (const [key, value] of entries) {
      if (!CategoryModel.schema[key]) continue
      const validationResult = CategoryModel.schema[key].validator(value)
      if (validationResult !== true) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION_FAILED,
          message: validationResult || `Invalid value for ${key}`
        })
      }
    }
  }

  preparePayload(payload = {}, { partial = false } = {}) {
    const normalized = { ...payload }

    if (typeof normalized.name === 'string') {
      normalized.name = normalized.name.trim()
    }

    if (!normalized.slug && typeof normalized.name === 'string' && normalized.name.length > 0) {
      normalized.slug = this.generateSlug(normalized.name)
    }

    if (normalized.slug && typeof normalized.slug === 'string') {
      normalized.slug = this.generateSlug(normalized.slug)
    }

    if (normalized.metadata && typeof normalized.metadata === 'string') {
      try {
        normalized.metadata = JSON.parse(normalized.metadata)
      } catch {
        // Leave as original string for validator to handle
      }
    }

    if (!partial && normalized.isActive === undefined) {
      normalized.isActive = true
    }

    return normalized
  }

  generateSlug(value = '') {
    return value
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 140)
      || 'category'
  }
}

module.exports = CategoryService
