const $ = Symbol('private scope')
const { assert } = require('backend-core')
const logger = require('../util/logger')
const axios = require('axios')
class IpLookupClient {
  constructor (options = {}) {
    assert.string(options.baseUrl, { notEmpty: true })
    assert.string(options.accessToken, { notEmpty: true })

    this[$] = {
      baseUrl: options.baseUrl,
      accessToken: options.accessToken
    }
    logger.trace(`${this.constructor.name} constructed...`)
  }

  async lookup (ip) {
    assert.string(ip, { notEmpty: true })
    const config = {
      method: 'GET',
      url: this[$].baseUrl + '/' + ip,
      params: { 'access_key': this[$].accessToken }
    }
    return await axios(config).then(response => {
      if (response.status === 200) {
        const data = response.data
        delete data.location
        return data
      }
      throw new Error(response)
    })
      .catch(error => {
        if (error) {
          return null
        }
      })
  }
}

module.exports = IpLookupClient
