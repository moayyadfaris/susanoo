const config = require('../config')
const { Logger } = require('backend-core')
const isDev = process.env.NODE_ENV === 'development'

module.exports = new Logger({ appName: 'SusanooAPI', ...(!isDev && { capture: config.app.capture, sentryDns: config.app.sentryDns }) })
