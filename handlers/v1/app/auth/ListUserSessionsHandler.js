const BaseHandler = require(__folders.handlers + '/BaseHandler')
const SessionDAO = require(__folders.dao + '/SessionDAO')
const uaParser = require('ua-parser-js')
const ipLookupClient = require(__folders.handlers + '/RootProvider').ipLookupClient

class ListUserSessionsHandler extends BaseHandler {
  static get accessTag () {
    return 'auth:list-sessions'
  }

  static async run (ctx) {
    const { currentUser } = ctx
    const sessions = await SessionDAO.getActiveSessions(currentUser.id)
    var results = []
    for (const session of sessions) {
      results.push({
        ip: session.ip,
        location: await ipLookupClient.lookup(session.ip),
        createdAt: new Date(session.createdAt).toISOString().split('.')[0],
        userAgent: uaParser(session.ua),
        isCurrent: (session.id === currentUser.sessionId)
      })
    }
    return this.result({ data: results })
  }
}

module.exports = ListUserSessionsHandler
