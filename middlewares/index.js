const { InitMiddleware } = require('./InitMiddleware')
const { CorsMiddleware } = require('./CorsMiddleware')
const { CheckAccessTokenMiddleware } = require('./CheckAccessTokenMiddleware')
const { SanitizeMiddleware } = require('./SanitizeMiddleware')
const { QueryMiddleware } = require('./QueryMiddleware')
const { CheckLanguageMiddleware } = require('./CheckLanguageMiddleware')
const { CacheMiddleware } = require('./CacheMiddleware')

module.exports = [
  InitMiddleware,
  CorsMiddleware,
  CheckAccessTokenMiddleware,
  SanitizeMiddleware,
  QueryMiddleware,
  CheckLanguageMiddleware,
  CacheMiddleware
]
