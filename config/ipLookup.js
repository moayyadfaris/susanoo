const { BaseConfig } = require('../core/lib/BaseConfig')

class IpLookup extends BaseConfig {
  constructor () {
    super()
    this.baseUrl = this.set('IP_LOOKUP_BASE_URL', this.joi.string().required())
    this.accessToken = this.set('IP_LOOKUP_ACCESS_TOKEN', this.joi.string().required())
  }
}

module.exports = new IpLookup()
