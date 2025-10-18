const BaseService = require('../BaseService')
const InterestDAO = require('../../database/dao/InterestDAO')
const InterestModel = require('../../models/InterestModel')
const { ErrorWrapper, errorCodes } = require('backend-core')

class InterestService extends BaseService {
  constructor(options = {}) {
    super(options)

    this.interestDAO = options.interestDAO || InterestDAO
    this.logger = options.logger || this.logger
    this.config = options.config || {}
  }

  async listInterests(params = {}) {
    return this.executeOperation('listInterests', async () => {
      const page = this.normalizePage(params.page)
      const limit = this.normalizeLimit(params.limit)
      const search = typeof params.search === 'string' ? params.search.trim().toLowerCase() : null

      let query = this.interestDAO.query().whereNull('deletedAt')

      if (search && search.length > 0) {
        query = query.where(builder => {
          builder.whereRaw('LOWER(name) LIKE ?', [`%${search}%`])
        })
      }

      if (params.orderBy) {
        const direction = params.orderDirection && ['asc', 'desc'].includes(params.orderDirection.toLowerCase())
          ? params.orderDirection.toLowerCase()
          : 'asc'
        query = query.orderBy(params.orderBy, direction)
      } else {
        query = query.orderBy('name', 'asc')
      }

      const { results, total } = await query.page(page, limit)

      return {
        results,
        total,
        page,
        limit
      }
    }, { params })
  }

  async getInterestById(id) {
    return this.executeOperation('getInterestById', async () => {
      const interestId = this.normalizeId(id)
      const interest = await this.interestDAO.query().findById(interestId)

      if (!interest || interest.deletedAt) {
        throw new ErrorWrapper({
          ...errorCodes.NOT_FOUND,
          message: 'Interest not found'
        })
      }

      return interest
    }, { id })
  }

  async createInterest(payload, context = {}) {
    return this.executeOperation('createInterest', async () => {
      const normalizedPayload = this.preparePayload(payload)
      this.ensureRequiredFields(normalizedPayload)
      await this.validateNameUniqueness(normalizedPayload.name)

      const created = await this.interestDAO.baseCreate({
        name: normalizedPayload.name,
        metadata: normalizedPayload.metadata || null,
        createdBy: context.userId || null,
        updatedBy: context.userId || null
      }, { context })

      return created
    }, { payload, userId: context.userId })
  }

  async updateInterest(id, payload, context = {}) {
    return this.executeOperation('updateInterest', async () => {
      const interestId = this.normalizeId(id)
      const existing = await this.interestDAO.query().findById(interestId)

      if (!existing || existing.deletedAt) {
        throw new ErrorWrapper({
          ...errorCodes.NOT_FOUND,
          message: 'Interest not found'
        })
      }

      const normalizedPayload = this.preparePayload(payload, { partial: true })

      if (Object.keys(normalizedPayload).length === 0) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION_FAILED,
          message: 'No valid fields provided for update'
        })
      }

      if (normalizedPayload.name && normalizedPayload.name.toLowerCase() !== existing.name.toLowerCase()) {
        await this.validateNameUniqueness(normalizedPayload.name, interestId)
      }

      const updated = await this.interestDAO.baseUpdate(interestId, {
        ...normalizedPayload,
        updatedBy: context.userId || null
      }, { context })

      return updated
    }, { id, payload, userId: context.userId })
  }

  async deleteInterest(id, context = {}) {
    return this.executeOperation('deleteInterest', async () => {
      const interestId = this.normalizeId(id)
      const existing = await this.interestDAO.query().findById(interestId)

      if (!existing || existing.deletedAt) {
        throw new ErrorWrapper({
          ...errorCodes.NOT_FOUND,
          message: 'Interest not found'
        })
      }

      await this.interestDAO.relatedQuery('users').for(interestId).unrelate()

      const deletedAt = new Date().toISOString()
      await this.interestDAO.baseUpdate(interestId, {
        deletedAt,
        deletedBy: context.userId || null,
        updatedBy: context.userId || null
      }, { context })

      return {
        id: interestId,
        deletedAt
      }
    }, { id, userId: context.userId })
  }

  normalizeId(value) {
    const numericId = Number(value)
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION_FAILED,
        message: 'Identifier must be a positive integer'
      })
    }
    return numericId
  }

  normalizePage(value) {
    const page = parseInt(value, 10)
    return Number.isInteger(page) && page >= 0 ? page : 0
  }

  normalizeLimit(value) {
    const limit = parseInt(value, 10)
    if (!Number.isInteger(limit) || limit <= 0) {
      return 25
    }
    return Math.min(limit, 1000)
  }

  preparePayload(payload = {}, { partial = false } = {}) {
    if (!payload || typeof payload !== 'object') {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION_FAILED,
        message: 'Payload must be an object'
      })
    }

    const normalized = { ...payload }

    if (typeof normalized.name === 'string') {
      normalized.name = normalized.name.trim()
      if (normalized.name.length === 0) {
        normalized.name = undefined
      }
    }

    if (normalized.metadata && typeof normalized.metadata === 'string') {
      try {
        normalized.metadata = JSON.parse(normalized.metadata)
      } catch (error) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION_FAILED,
          message: 'Metadata must be valid JSON'
        })
      }
    }

    if (normalized.metadata !== undefined) {
      const metadataValidation = InterestModel.schema.metadata.validator(normalized.metadata)
      if (metadataValidation !== true) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION_FAILED,
          message: metadataValidation || 'Invalid metadata'
        })
      }
    }

    if (!partial && (normalized.name === undefined || normalized.name === null)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION_FAILED,
        message: 'Name is required'
      })
    }

    const cleanedPayload = Object.fromEntries(
      Object.entries(normalized).filter(([_, value]) => value !== undefined)
    )

    return cleanedPayload
  }

  ensureRequiredFields(payload) {
    const requiredFields = ['name']
    for (const field of requiredFields) {
      const validator = InterestModel.schema[field]
      const validationResult = validator.validator(payload[field])
      if (validationResult !== true) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION_FAILED,
          message: validationResult || `${field} is required`
        })
      }
    }
  }

  async validateNameUniqueness(name, ignoreId = null) {
    const query = this.interestDAO.query()
      .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
      .whereNull('deletedAt')

    if (ignoreId) {
      query.whereNot('id', ignoreId)
    }

    const existing = await query.first()
    if (existing) {
      throw new ErrorWrapper({
        ...errorCodes.DB_DUPLICATE_CONFLICT,
        message: 'An interest with this name already exists'
      })
    }
  }
}

module.exports = InterestService
