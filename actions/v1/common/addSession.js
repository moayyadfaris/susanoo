const { assert } = require('backend-core')
const SessionDAO = require(__folders.dao + '/SessionDAO')
const SessionEntity = require('./SessionEntity')
const UserModel = require(__folders.models + '/UserModel')
const { redisClient } = require(__folders.actions + '/RootProvider')
const MAX_SESSIONS_COUNT = 5

module.exports = async session => {
  assert.instanceOf(session, SessionEntity)

  if (await _isValidSessionsCount(session.userId)) {
    return await _addSession(session)
  } else {
    await _wipeAllUserSessions(session.userId)
    return await _addSession(session)
  }
}

async function _isValidSessionsCount (userId) {
  assert.validate(userId, UserModel.schema.id, { required: true })

  const existingSessionsCount = await SessionDAO.baseGetCount({ userId })
  return existingSessionsCount < MAX_SESSIONS_COUNT
}

async function _addSession (session) {
  // for better performance store sessions in Redis persistence
  const sessionData = await SessionDAO.baseCreate(session)
  let redisSession = await redisClient.getKey('sessions_' + sessionData.userId)
  const userId = sessionData.userId
  if (redisSession) {
    redisSession.push(sessionData)
    redisClient.setKey('sessions_' + userId, redisSession)
  } else {
    await redisClient.setKey('sessions_' + userId, [sessionData])
  }
  return sessionData
}

async function _wipeAllUserSessions (userId) {
  assert.validate(userId, UserModel.schema.id, { required: true })
  return await SessionDAO.baseRemoveWhere({ userId })
}
