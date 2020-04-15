const BaseHandler = require(__folders.handlers + '/BaseHandler')
const { redisClient } = require(__folders.handlers + '/RootProvider')

class ClearCacheHandler extends BaseHandler {
  static get accessTag () {
    return 'web#cache:clear'
  }

  static async run (req) {
    redisClient.flushAll()
  }
}

module.exports = ClearCacheHandler
