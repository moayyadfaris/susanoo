const redis = require('redis')
const { assert, AbstractLogger } = require('backend-core')
const $ = Symbol('private scope')

class RedisClient {
  constructor (options = {}) {
    assert.integer(options.port)
    assert.string(options.host)
    assert.instanceOf(options.logger, AbstractLogger)

    this[$] = {
      client: redis.createClient({
        port: options.port || 6379,
        host: options.host || 'localhost'
      }),
      logger: options.logger
    }

    this[$].client.on('error', error => {
      throw new Error(`${this.constructor.name}, ${error}`)
    })

    this[$].client.on('connect', () => {
      this[$].logger.debug(`${this.constructor.name} connected...`)
    })
  }

  setKey (key, value) {
    assert.string(key, { required: true })
    // assert.object(value, { required: true })
    this[$].client.set(key, JSON.stringify(value))
  }

  publish (channelName, data) {
    assert.string(channelName, { required: true })
    assert.object(data, { required: true })
    this[$].client.publish(channelName, JSON.stringify(data), function () {})
  }
  subscribe (channelName) {
    assert.string(channelName, { required: true })
    this[$].client.subscribe(channelName)
  }

  getKey (key) {
    assert.string(key, { required: true })
    return new Promise((resolve, reject) => {
      this[$].client.get(key, (error, value) => {
        if (error) return reject(error)
        if (value) return resolve(JSON.parse(value))
        return resolve(null)
      })
    })
  }

  removeKey (key) {
    assert.string(key, { required: true })
    return new Promise((resolve, reject) => {
      this[$].client.del(key, (error, value) => {
        if (error) return reject(error)
        return resolve()
      })
    })
  }

  removePatternKey (patternKey) {
    assert.string(patternKey, { required: true })
    return new Promise((resolve, reject) => {
      this[$].client.keys(patternKey, (err, rows) => {
        if (!err) {
          rows.forEach(key => {
            this[$].client.del(key)
          })
        }
      })
    })
  }

  flushAll () {
    this[$].client.flushall()
  }
}

module.exports = RedisClient
