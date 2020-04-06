/**
 * https://optimalbits.github.io/bull/
 */

const $ = Symbol('private scope')
const queue = require('bull')
const { assert, AbstractLogger } = require('backend-core')

class QueueClient {
  constructor (options = {}) {
    assert.string(options.url, { notEmpty: true })
    assert.string(options.name || 'APP', { notEmpty: true })
    assert.instanceOf(options.logger, AbstractLogger)

    this[$] = {
      client: queue(
        options.name,
        options.url
      ),
      logger: options.logger
    }

    this[$].logger.debug(`${this.constructor.name} constructed...`)
  }

  enqueue (data, options) {
    assert.object(data, { required: true })
    return new Promise((resolve, reject) => {
      this[$].client.add(data, options, function (error, response, body) {
        if (error) throw new Error(error)
        return resolve(response)
      })
    })
  }
}

module.exports = QueueClient
