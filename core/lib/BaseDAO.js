const Model = require('objection').Model
// https://github.com/Vincit/objection-db-errors
const { wrapError, UniqueViolationError, NotNullViolationError } = require('db-errors')
const errorCodes = require('./errorCodes')
const { ErrorWrapper } = require('./ErrorWrapper')
const { Assert: assert } = require('./assert')

class BaseDAO extends Model {
  /**
   * ------------------------------
   * @HELPERS
   * ------------------------------
   */

  static errorEmptyResponse () {
    return new ErrorWrapper({ ...errorCodes.NOT_FOUND, layer: 'DAO' })
  }

  static emptyPageResponse () {
    return { results: [], total: 0 }
  }

  static emptyListResponse () {
    return []
  }

  static emptyObjectResponse () {
    return {}
  }

  static query () {
    return super.query.apply(this, arguments).onError(error => {
      return Promise.reject(wrapError(error))
        .catch(error => {
          if (error instanceof UniqueViolationError) {
            throw new ErrorWrapper({
              ...errorCodes.DB_DUPLICATE_CONFLICT,
              message: `Column '${error.columns}' duplicate in '${error.table}' table`,
              layer: 'DAO'
            })
          }
          if (error instanceof NotNullViolationError) {
            throw new ErrorWrapper({
              ...errorCodes.DB_NOTNULL_CONFLICT,
              message: `Not null conflict failed for table '${error.table}' and column '${error.column}'`,
              layer: 'DAO'
            })
          }
          throw new ErrorWrapper({ ...errorCodes.DB, message: error.message, layer: 'DAO' })
        })
    })
  }

  /**
   * ------------------------------
   * @HOOKS
   * ------------------------------
   */

  $beforeUpdate () {
    this.updatedAt = new Date().toISOString()
  }

  /**
   * ------------------------------
   * @METHODS
   * ------------------------------
   */

  static baseCreate (entity = {}) {
    assert.object(entity, { required: true })

    /**
     * each entity that creates must to have creator id (userId)
     * except user entity
     */
    // if (!entity.userId) {
    //   throw new ErrorWrapper({
    //     ...errorCodes.UNPROCESSABLE_ENTITY,
    //     message: 'Please provide in action class \'userId\' field',
    //     layer: 'DAO'
    //   })
    // }

    return this.query().insert(entity)
  }

  static baseUpdate (id, entity = {}) {
    assert.id(id, { required: true })
    assert.object(entity, { required: true })

    return this.query().patchAndFetchById(id, entity)
  }

  static updateAll (where, entity = {}) {
    return this.query().update(entity).where(where)
  }
  static async baseGetList ({ page, limit, filter, orderBy } = {}) {
    assert.integer(page, { required: true })
    assert.integer(limit, { required: true })
    assert.object(filter, { required: true })
    assert.uuid(filter.userId)

    const data = await this.query()
      .where({ ...filter })
      .orderBy(orderBy.field, orderBy.direction)
      .page(page, limit)

    if (!data.results.length) return this.emptyPageResponse()
    return data
  }

  static async baseGetCount (filter = {}) {
    assert.object(filter, { required: true })

    const result = await this.query()
      .where({ ...filter })
      .count('*')
      .first()
    if (!result.count) return 0
    return Number(result.count)
  }

  static async baseGetById (id) {
    assert.id(id, { required: true })

    const data = await this.query().findById(id)
    if (!data) throw this.errorEmptyResponse()
    return data
  }

  static baseRemove (id) {
    assert.id(id, { required: true })

    return this.query().deleteById(id)
  }

  static baseRemoveWhere (where = {}) {
    assert.object(where, { required: true })

    return this.query().delete().where({ ...where })
  }

  static async baseFindOneWhere (where = {}) {
    return await this.query().where({ ...where }).first()
  }
}

module.exports = { BaseDAO }
