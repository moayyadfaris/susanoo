const BaseAction = require(__folders.actions + '/BaseAction')
const { redisClient } = require(__folders.actions + '/RootProvider')

class ClearCacheAction extends BaseAction {
  static get accessTag () {
    return 'web#cache:clear'
  }

  static async run (req) {
    redisClient.flushAll()
  }
}

module.exports = ClearCacheAction
