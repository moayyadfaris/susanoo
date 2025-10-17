const BaseService = require('../BaseService')
const UserDAO = require('../../database/dao/UserDAO')
const InterestDAO = require('../../database/dao/InterestDAO')
const UserInterestModel = require('../../models/UserInterestModel')
const { ErrorWrapper, assert } = require('backend-core')

class UserInterestService extends BaseService {
  constructor(options = {}) {
    super(options)
    this.registerDependency('userDAO', options.userDAO || UserDAO)
    this.registerDependency('interestDAO', options.interestDAO || InterestDAO)
  }

  async listInterestsWithSelection(query = {}, context = {}) {
    return this.executeOperation('listInterestsWithSelection', async () => {
      const currentUser = context.currentUser
      if (!currentUser || !currentUser.id) {
        throw new ErrorWrapper({ code: 'UNAUTHORIZED', message: 'Current user required', statusCode: 401 })
      }

      // Fetch all interests (paged by limit if provided)
      const interestDAO = this.getDependency('interestDAO')
      const normalizedQuery = { page: query.page || 1, limit: query.limit || 100, orderBy: query.orderBy }
      const interestsPage = await interestDAO.baseGetList(normalizedQuery)

      // Fetch user interests ids
      const userDAO = this.getDependency('userDAO')
      const userWithInterests = await userDAO.query()
        .findById(currentUser.id)
        .withGraphFetched('interests')
        .select('id')

      const selectedIds = new Set((userWithInterests?.interests || []).map(i => i.id))
      const list = (interestsPage.results || []).map(item => ({ ...item, selected: selectedIds.has(item.id) }))

      return {
        data: list,
        headers: { 'X-Total-Count': list.length },
        pagination: {
          page: interestsPage.page || normalizedQuery.page,
          limit: interestsPage.limit || normalizedQuery.limit,
          total: interestsPage.total || list.length,
          totalPages: interestsPage.totalPages || 1
        }
      }
    }, { userId: context.currentUser?.id, query })
  }

  async setUserInterests(interestIds = [], context = {}) {
    return this.executeOperation('setUserInterests', async () => {
      const currentUser = context.currentUser
      if (!currentUser || !currentUser.id) {
        throw new ErrorWrapper({ code: 'UNAUTHORIZED', message: 'Current user required', statusCode: 401 })
      }

      // Validate input
      assert.validate(interestIds, UserInterestModel.schema.interests, { required: true })

      // Normalize: dedupe and sort
      const ids = Array.from(new Set(interestIds.map(Number))).filter(n => Number.isInteger(n) && n > 0)

      // Optional: verify interests exist
      const interestDAO = this.getDependency('interestDAO')
      if (ids.length) {
        const existing = await interestDAO.baseGetList({ filterIn: { id: ids }, page: 1, limit: ids.length })
        const existingIds = new Set((existing.results || []).map(i => i.id))
        const missing = ids.filter(id => !existingIds.has(id))
        if (missing.length) {
          throw new ErrorWrapper({ code: 'INVALID_INTEREST', message: `Invalid interest IDs: ${missing.join(', ')}`, statusCode: 422 })
        }
      }

      // Upsert relations (replace existing with provided)
      const userDAO = this.getDependency('userDAO')
      const interestsGraph = ids.map(id => ({ '#dbRef': id }))
      await userDAO.query().upsertGraph({ id: currentUser.id, interests: interestsGraph }, { unrelate: true, allowRefs: true })

      // Return updated selection list quickly
      const updated = await userDAO.query().findById(currentUser.id).withGraphFetched('interests')
      const updatedIds = (updated?.interests || []).map(i => i.id)

      return { updated: true, count: updatedIds.length, interestIds: updatedIds }
    }, { userId: context.currentUser?.id, interestCount: interestIds?.length })
  }
}

module.exports = UserInterestService
