const errorCodes = require('./lib/errorCodes')
const { Assert } = require('./lib/assert')
const { ValidatorNano } = require('./lib/validator/ValidatorNano')

const { BaseConfig } = require('./lib/BaseConfig')
const { BaseDAO } = require('./lib/BaseDAO')
const { BaseMiddleware } = require('./lib/BaseMiddleware')
const { BaseModel } = require('./lib/BaseModel')
const { AbstractLogger } = require('./lib/AbstractLogger')

const { ErrorWrapper } = require('./lib/ErrorWrapper')
const { InMemoryCache } = require('./lib/InMemoryCache')
const { Rule } = require('./lib/Rule')
const { RequestRule } = require('./lib/RequestRule')
const { SentryCatch } = require('./lib/SentryCatch')
const { Server } = require('./lib/Server')
const { Logger, LOG_LEVELS } = require('./lib/Logger')
const { CookieEntity } = require('./lib/CookieEntity')

// Enterprise Components
const AuditableDAO = require('./lib/AuditableDAO')
const ValidatedModel = require('./lib/ValidatedModel')
const CryptoService = require('./lib/CryptoService')
const CacheManager = require('./lib/CacheManager')
const ConnectionPool = require('./lib/ConnectionPool')

module.exports = {
  errorCodes,
  assert: Assert,
  ValidatorNano,

  BaseConfig,
  BaseDAO,
  BaseMiddleware,
  BaseModel,

  AbstractLogger,

  ErrorWrapper,
  InMemoryCache,
  Rule,
  RequestRule,
  SentryCatch,
  Server,
  Logger,
  LOG_LEVELS,
  CookieEntity,

  // Enterprise Components
  AuditableDAO,
  ValidatedModel,
  CryptoService,
  CacheManager,
  ConnectionPool
}
