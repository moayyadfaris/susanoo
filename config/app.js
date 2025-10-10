const { BaseConfig } = require('../core/lib/BaseConfig')

class AppConfig extends BaseConfig {
  constructor () {
    super()
    this.nodeEnv = this.set('NODE_ENV', v => ['development', 'production'].includes(v), 'development')
    this.port = this.set('APP_PORT', this.joi.number().port().required(), 5555)
    this.host = this.set('APP_HOST', this.joi.string().required(), 'localhost')
    this.name = this.set('APP_NAME', this.joi.string().required(), 'BackendAPI')
    this.url = this.set('APP_URL', this.joi.string().required())
    this.sentryDsn = this.set('SENTRY_DSN', this.joi.string().required())
    this.sentryCapture = (this.set('SENTRY_CAPTURE', this.joi.boolean().required()) === 'true')
    this.desc = this.set('APP_DESC', this.joi.string().required())
    this.version = this.set('APP_VERSION', this.joi.string().required())
    this.isoMinVersion = this.set('IOS_MIN_VERSION', this.joi.string())
    this.androidMinVersion = this.set('ANDROID_MIN_VERSION', this.joi.string())
    this.supportEmail = this.set('SUPPORT_EMAIL', this.joi.string())
    this.resetPasswordUrl = this.set('RESET_PASSWORD_URL', this.joi.string())
    this.qrCodeServiceToken = this.set('QR_CODE_SERVICE_TOKEN', this.joi.string())
    this.socketPort = this.set('SOCKET_PORT', this.joi.number().port().required(), 7000)
    this.cookieSecret = this.set('COOKIE_SECRET', this.joi.string().min(32))
  }

  async init () {
    await this.fetchAndSetAsyncValue()
    console.log(`${this.constructor.name}: Initialization finish...`)
  }

  fetchAndSetAsyncValue () { // just tor example
    return new Promise(resolve => {
      setTimeout(() => {
        this.testAsyncValue = this.setDirect('some async value', this.joi.string().required(), 'async value')
        this.testDefaultAsyncValue = this.setDirect(undefined, this.joi.string().required(), 'default async value')
        resolve()
      }, 100)
    })
  }
}

module.exports = new AppConfig()
