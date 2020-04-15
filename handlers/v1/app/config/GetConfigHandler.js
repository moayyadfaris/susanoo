const BaseHandler = require(__folders.handlers + '/BaseHandler')
const appConfig = require(__folders.config).app
const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
class GetConfigHandler extends BaseHandler {
  static get accessTag () {
    return 'config:get'
  }

  static get validationRules () {
    return {
      query: {
        version: new RequestRule(new Rule({
          validator: term => (typeof term === 'string'),
          description: 'string;'
        }))
      }
    }
  }

  static async run (req) {
    if (!req.query.version) {
      throw new ErrorWrapper({ ...errorCodes.VERSION_UPDATE })
    }
    // check version build
    const version = req.query.version.split('.').reduce((a, b) => parseInt(a) + parseInt(b), 0)
    let appVersion = null
    if (req.headers['Device-Type'] === 'ios') {
      appVersion = appConfig.isoMinVersion
    } else if (req.headers['Device-Type'] === 'android') {
      appVersion = appConfig.androidMinVersion
    }
    const configAppVersion = appVersion.split('.').reduce((a, b) => parseInt(a) + parseInt(b), 0)
    if (version < configAppVersion) {
      throw new ErrorWrapper({ ...errorCodes.VERSION_UPDATE })
    }
    let config = appConfig
    return this.result({
      data: {
        name: config.name,
        url: config.url,
        desc: config.desc,
        version: config.version,
        supportEmail: config.supportEmail,
        buildNumber: process.env.BITBUCKET_BUILD_NUMBER
      }
    })
  }
}

module.exports = GetConfigHandler
