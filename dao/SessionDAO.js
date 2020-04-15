const { BaseDAO, assert } = require('backend-core')

class SessionDAO extends BaseDAO {
  static get tableName () {
    return 'sessions'
  }

  static async getByRefreshToken (refreshToken) {
    assert.string(refreshToken, { notEmpty: true })

    const result = await this.query()
      .where({ refreshToken })
      .first()
    if (!result) throw this.errorEmptyResponse()
    return result
  }

  static async removeOtherSessions (userId, sessionId) {
    assert.number(sessionId, { notEmpty: true })
    assert.string(userId, { notEmpty: true })
    await this.query().delete().where({ userId }).whereNot({ id: sessionId })
  }

  static async getUserSessionsCount (userId) {
    return await this.query().where({ userId }).count().first()
  }

  static async getActiveSessions (userId) {
    const expiredAt = Date.now()
    return await this.query().where({ userId }).where('expiredAt', '>', expiredAt)
  }
}

module.exports = SessionDAO
