const { Logger } = require('backend-core')
const isDev = process.env.NODE_ENV === 'development'
const sentryDsn = process.env.SENTRY_DSN
const sentryCapture = process.env.SENTRY_CAPTURE

module.exports = new Logger({
  appName: 'SusanooAPI',
  raw: !isDev,
  capture: sentryCapture === 'true',
  sentryDsn
})
