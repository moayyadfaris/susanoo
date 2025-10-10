const { InitMiddleware } = require('./InitMiddleware')
const { CorsMiddleware } = require('./CorsMiddleware')
const { CheckAccessTokenMiddleware } = require('./CheckAccessTokenMiddleware')
const { SanitizeMiddleware } = require('./SanitizeMiddleware')
const { QueryMiddleware } = require('./QueryMiddleware')
const { CheckLanguageMiddleware } = require('./CheckLanguageMiddleware')
const { CacheMiddleware } = require('./CacheMiddleware')
const { ContentTypeMiddleware } = require('./ContentTypeMiddleware')
const { BasicAuthMiddleware } = require('./BasicAuthMiddleware')

module.exports = [
  InitMiddleware,
  CorsMiddleware,
  ContentTypeMiddleware,
  CheckAccessTokenMiddleware,
  SanitizeMiddleware,
  QueryMiddleware,
  CheckLanguageMiddleware,
  CacheMiddleware,
  BasicAuthMiddleware
]
