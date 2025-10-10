const pino = require('pino')
const { performance } = require('perf_hooks')

const { Assert: assert } = require('./assert')
const { ValidatorNano: validator } = require('./validator/ValidatorNano')
const { SentryCatch } = require('./SentryCatch')
const { AbstractLogger } = require('./AbstractLogger')

/**
 * Private scope symbol for encapsulation
 * @private
 */
const $ = Symbol('private scope')

/**
 * Log level constants with numeric values for performance
 * @readonly
 * @enum {number}
 */
const LOG_LEVELS = Object.freeze({
  FATAL: 60,
  ERROR: 50,
  WARN: 40,
  INFO: 30,
  DEBUG: 20,
  TRACE: 10
})

/**
 * Default logger configuration with optimized formatting
 * @readonly
 */
const DEFAULT_CONFIG = Object.freeze({
  level: 'info',
  colorize: true,
  timestamp: true,
  hostname: false, // Disable hostname in logs for cleaner output
  pid: false, // Disable PID in logs for cleaner output
  redact: ['password', 'token', 'secret', 'key', 'authorization', 'cookie'],
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res
  },
  formatters: {
    level: (label) => ({ 
      level: label.toUpperCase() // Use string level for readability
    }),
    bindings: (bindings) => ({
      // Only include essential system info, not in every log
      service: bindings.name || 'susanoo-api'
    })
  },
  // Optimize for production logging
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss.l', // Shorter time format
      ignore: 'hostname,pid,nodeVersion,platform,arch,component,levelLabel', // Hide redundant fields
      singleLine: true, // Compact single-line format
      levelFirst: false,
      messageFormat: '{level} | {service} | {msg}', // Clean message format
      errorLikeObjectKeys: ['err', 'error', 'exception'],
      customPrettifiers: {
        // Custom formatting for request context
        requestId: (value) => `req:${value.slice(-8)}`, // Show only last 8 chars
        userId: (value) => value ? `user:${value}` : undefined,
        method: (value) => value,
        url: (value) => value,
        statusCode: (value) => `status:${value}`,
        duration: (value) => `${value}ms`,
        ip: (value) => value === '::1' ? 'localhost' : value
      }
    }
  }
})

/**
 * Enhanced Logger class with production-ready features
 * 
 * Features:
 * - High-performance structured logging with Pino
 * - Sentry integration for error tracking
 * - Configurable log levels and formatting
 * - Request/Response serialization
 * - Performance monitoring
 * - Memory-efficient log rotation
 * - Security-focused redaction
 * - TypeScript-like JSDoc annotations
 * 
 * @class Logger
 * @extends AbstractLogger
 * @version 3.0.0
 * @author Susanoo API Team
 * @since 1.0.0
 * 
 * @example
 * const logger = new Logger({
 *   appName: 'susanoo-api',
 *   level: 'debug',
 *   capture: true,
 *   sentryDsn: 'https://your-sentry-dsn.com'
 * })
 * 
 * logger.info('User login successful', { userId: 123, ip: '192.168.1.1' })
 * logger.error('Database connection failed', error, { retryCount: 3 })
 */
class Logger extends AbstractLogger {
  /**
   * Create a new Logger instance
   * @param {Object} options - Logger configuration options
   * @param {string} options.appName - Application name for log identification
   * @param {string} [options.level='info'] - Minimum log level to output
   * @param {boolean} [options.capture=false] - Enable Sentry error capture
   * @param {string} [options.sentryDsn] - Sentry DSN for error tracking
   * @param {string} [options.sentryEnvironment='development'] - Sentry environment
   * @param {boolean} [options.raw=false] - Output raw JSON instead of pretty format
   * @param {boolean} [options.colorize=true] - Enable colorized output
   * @param {string[]} [options.redact] - Fields to redact from logs
   * @param {Object} [options.customSerializers] - Custom object serializers
   * @param {boolean} [options.enablePerformanceMonitoring=false] - Track performance metrics
   * @param {number} [options.maxObjectDepth=5] - Maximum object serialization depth
   * @throws {Error} When required parameters are missing or invalid
   */
  constructor({
    appName,
    level = 'info',
    capture = false,
    sentryDsn,
    sentryEnvironment = 'development',
    raw = false,
    colorize = true,
    redact = DEFAULT_CONFIG.redact,
    customSerializers = {},
    enablePerformanceMonitoring = false,
    maxObjectDepth = 5
  } = {}) {
    super()

    // Enhanced validation with better error messages
    assert.string(appName, { required: true })
    if (!validator.isStringNotEmpty(appName)) {
      throw new Error(`${this.constructor.name}: 'appName' must be a non-empty string`)
    }

    assert.string(level)
    if (level && !Object.keys(LOG_LEVELS).map(k => k.toLowerCase()).includes(level.toLowerCase())) {
      throw new Error(`${this.constructor.name}: Invalid log level '${level}'. Valid levels: ${Object.keys(LOG_LEVELS).join(', ')}`)
    }

    assert.boolean(capture)
    assert.string(sentryDsn)
    assert.string(sentryEnvironment)
    assert.boolean(raw)
    assert.boolean(colorize)
    assert.boolean(enablePerformanceMonitoring)

    if (capture && !validator.isStringNotEmpty(sentryDsn)) {
      throw new Error(`${this.constructor.name}: 'sentryDsn' is required when capture is enabled`)
    }

    if (redact && !validator.isArrayOf(redact, [String])) {
      throw new Error(`${this.constructor.name}: 'redact' must be an array of strings`)
    }

    if (!validator.isObject(customSerializers)) {
      throw new Error(`${this.constructor.name}: 'customSerializers' must be an object`)
    }

    if (!validator.isPositiveInt(maxObjectDepth)) {
      throw new Error(`${this.constructor.name}: 'maxObjectDepth' must be a positive integer`)
    }

    // Create base logger configuration
    const baseConfig = {
      level: level.toLowerCase(),
      name: appName.toLowerCase(),
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: [...DEFAULT_CONFIG.redact, ...redact],
      serializers: {
        ...DEFAULT_CONFIG.serializers,
        ...customSerializers
      },
      formatters: DEFAULT_CONFIG.formatters,
      depthLimit: maxObjectDepth,
      edgeLimit: 100,
      // Performance optimization: disable browser mode
      browser: { disabled: true },
      // Add custom hooks for performance monitoring
      ...(enablePerformanceMonitoring && {
        hooks: {
          logMethod(inputArgs, method) {
            const start = performance.now()
            method.apply(this, inputArgs)
            const duration = performance.now() - start
            if (duration > 10) { // Log slow operations
              console.warn(`Slow log operation: ${duration.toFixed(2)}ms`)
            }
          }
        }
      })
    }

    // Add transport for pretty printing in development
    if (!raw) {
      baseConfig.transport = {
        target: 'pino-pretty',
        options: {
          colorize,
          translateTime: 'SYS:HH:MM:ss.l', // Shorter, more readable time format
          ignore: 'hostname,pid,nodeVersion,platform,arch,component,levelLabel', // Remove redundant metadata
          singleLine: true, // Compact format for better readability
          levelFirst: true,
          messageFormat: '{level} | {service} | {msg}', // Simple template format
          errorLikeObjectKeys: ['err', 'error', 'exception']
        }
      }
    }

    // Initialize private scope with optimized logger instances
    this[$] = {
      appName,
      level,
      enablePerformanceMonitoring,
      sentryCatch: capture ? new SentryCatch(sentryDsn, sentryEnvironment) : null,
      
      // Create single logger instance with level-specific child loggers
      logger: pino(baseConfig),
      
      // Performance tracking
      perfCounters: enablePerformanceMonitoring ? {
        logCount: 0,
        errorCount: 0,
        warnCount: 0,
        lastLogTime: Date.now()
      } : null,

      // Configuration metadata
      config: {
        appName,
        level,
        capture,
        sentryDsn: sentryDsn ? '[REDACTED]' : null,
        sentryEnvironment,
        raw,
        colorize,
        enablePerformanceMonitoring
      }
    }

    // Create level-specific child loggers for better performance
    this[$].loggers = {
      fatal: this[$].logger.child({ component: 'fatal' }),
      error: this[$].logger.child({ component: 'error' }),
      warn: this[$].logger.child({ component: 'warn' }),
      info: this[$].logger.child({ component: 'info' }),
      debug: this[$].logger.child({ component: 'debug' }),
      trace: this[$].logger.child({ component: 'trace' })
    }

    // Log logger initialization in debug mode
    if (this[$].logger.level <= LOG_LEVELS.DEBUG) {
      this[$].loggers.debug.debug('Logger initialized', this[$].config)
    }
  }

  /**
   * Get logger configuration and statistics
   * @returns {Object} Configuration and runtime statistics
   */
  getConfig() {
    const config = { ...this[$].config }
    
    if (this[$].perfCounters) {
      config.statistics = {
        ...this[$].perfCounters,
        uptime: Date.now() - this[$].perfCounters.lastLogTime,
        memoryUsage: process.memoryUsage(),
        logRate: this[$].perfCounters.logCount / ((Date.now() - this[$].perfCounters.lastLogTime) / 1000)
      }
    }

    return config
  }

  /**
   * Update logger level at runtime
   * @param {string} newLevel - New log level
   * @throws {Error} When level is invalid
   */
  setLevel(newLevel) {
    assert.string(newLevel, { required: true })
    
    if (!Object.keys(LOG_LEVELS).map(k => k.toLowerCase()).includes(newLevel.toLowerCase())) {
      throw new Error(`Invalid log level '${newLevel}'. Valid levels: ${Object.keys(LOG_LEVELS).join(', ')}`)
    }

    this[$].level = newLevel.toLowerCase()
    this[$].logger.level = this[$].level
    this[$].config.level = this[$].level

    this[$].loggers.info.info('Logger level updated', { newLevel: this[$].level })
  }

  /**
   * Create a child logger with additional context
   * @param {Object} bindings - Additional context to bind to all logs
   * @param {Object} [options] - Child logger options
   * @returns {Object} Child logger instance
   * @example
   * const requestLogger = logger.child({ requestId: 'req-123', userId: 456 })
   * requestLogger.info('Processing request') // Will include requestId and userId
   */
  child(bindings = {}, options = {}) {
    assert.isOk(bindings)
    assert.isOk(options)

    if (!validator.isObject(bindings)) {
      throw new Error('Child logger bindings must be an object')
    }

    const childLogger = this[$].logger.child(bindings, options)
    
    // Return a logger-like object with the same interface
    return {
      fatal: (message, error, meta) => this._logWithChild(childLogger, 'fatal', message, error, meta),
      error: (message, error, meta) => this._logWithChild(childLogger, 'error', message, error, meta),
      warn: (message, error, meta) => this._logWithChild(childLogger, 'warn', message, error, meta),
      info: (message, meta) => this._logWithChild(childLogger, 'info', message, null, meta),
      debug: (message, meta) => this._logWithChild(childLogger, 'debug', message, null, meta),
      trace: (message, meta) => this._logWithChild(childLogger, 'trace', message, null, meta),
      child: (newBindings, newOptions) => this.child({ ...bindings, ...newBindings }, newOptions)
    }
  }

  /**
   * Create an optimized request logger with cleaned context
   * @param {Object} requestContext - Request-specific context
   * @param {string} requestContext.requestId - Unique request identifier
   * @param {string} [requestContext.method] - HTTP method
   * @param {string} [requestContext.url] - Request URL
   * @param {string} [requestContext.ip] - Client IP address
   * @param {string} [requestContext.userAgent] - Client user agent
   * @param {string|number} [requestContext.userId] - User identifier
   * @param {string} [requestContext.handler] - Handler name
   * @returns {Object} Optimized request logger
   * @example
   * const reqLogger = logger.forRequest({
   *   requestId: 'req-abc123',
   *   method: 'POST',
   *   url: '/api/users',
   *   userId: 456,
   *   handler: 'CreateUserHandler'
   * })
   * reqLogger.info('User created successfully')
   */
  forRequest(requestContext) {
    if (!validator.isObject(requestContext)) {
      throw new Error('Request context must be an object')
    }

    if (!validator.isStringNotEmpty(requestContext.requestId)) {
      throw new Error('Request ID is required for request logger')
    }

    // Clean and optimize the context
    const cleanContext = {
      // Short request ID for better readability
      requestId: requestContext.requestId.slice(-8),
      ...(requestContext.method && { method: requestContext.method }),
      ...(requestContext.url && { url: requestContext.url }),
      ...(requestContext.ip && { 
        ip: requestContext.ip === '::1' ? 'localhost' : requestContext.ip 
      }),
      ...(requestContext.userAgent && { 
        // Extract just the client name (e.g., "PostmanRuntime" from "PostmanRuntime/7.46.0")
        userAgent: requestContext.userAgent.split('/')[0] 
      }),
      ...(requestContext.userId && { userId: String(requestContext.userId) }),
      ...(requestContext.handler && { handler: requestContext.handler })
    }

    return this.child(cleanContext)
  }

  /**
   * ------------------------------
   * @PRIVATE_HELPERS
   * ------------------------------
   */

  /**
   * Helper method for child logger operations
   * @private
   */
  _logWithChild(childLogger, level, message, error, meta) {
    const payload = this._preparePayload(error, meta)
    
    if (error && this[$].sentryCatch) {
      this._captureException(error, payload)
    } else if (['info', 'debug', 'trace'].includes(level) && this[$].sentryCatch) {
      this._captureMessage(message, payload)
    }

    this._updatePerfCounters(level)
    childLogger[level](payload, message)
  }

  /**
   * Capture exception with Sentry
   * @private
   * @param {Error} error - Error to capture
   * @param {Object} payload - Additional context
   */
  _captureException(error, payload) {
    if (this[$].sentryCatch && error instanceof Error) {
      this[$].sentryCatch.captureException(error, {
        extra: payload,
        tags: {
          component: 'logger',
          appName: this[$].appName
        }
      })
    }
  }

  /**
   * Capture message with Sentry
   * @private
   * @param {string} message - Message to capture
   * @param {Object} payload - Additional context
   */
  _captureMessage(message, payload) {
    if (this[$].sentryCatch && validator.isStringNotEmpty(message)) {
      this[$].sentryCatch.captureMessage(message, {
        level: 'info',
        extra: payload,
        tags: {
          component: 'logger',
          appName: this[$].appName
        }
      })
    }
  }

  /**
   * Prepare log payload with proper structure
   * @private
   * @param {Error|any} error - Error object or data
   * @param {any} meta - Additional metadata
   * @returns {Object} Structured payload
   */
  _preparePayload(error, meta) {
    if (!error && !meta) return {}

    // Handle error objects
    if (error instanceof Error) {
      const errorPayload = {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: error.code,
          errno: error.errno,
          path: error.path,
          syscall: error.syscall
        }
      }

      if (validator.isObject(meta)) {
        return { ...errorPayload, ...meta }
      }
      
      return meta ? { ...errorPayload, meta } : errorPayload
    }

    // Handle non-error objects
    if (validator.isObject(error) && validator.isObject(meta)) {
      return { ...error, ...meta }
    }

    if (validator.isObject(error)) {
      return meta ? { ...error, meta } : error
    }

    if (validator.isObject(meta)) {
      return error ? { ...meta, data: error } : meta
    }

    // Handle primitive values
    const payload = {}
    if (error !== undefined) payload.data = error
    if (meta !== undefined) payload.meta = meta
    
    return payload
  }

  /**
   * Update performance counters if enabled
   * @private
   * @param {string} level - Log level
   */
  _updatePerfCounters(level) {
    if (!this[$].perfCounters) return

    this[$].perfCounters.logCount++
    this[$].perfCounters.lastLogTime = Date.now()

    if (level === 'error' || level === 'fatal') {
      this[$].perfCounters.errorCount++
    } else if (level === 'warn') {
      this[$].perfCounters.warnCount++
    }
  }

  /**
   * Validate and normalize log message
   * @private
   * @param {any} message - Message to validate
   * @returns {string} Normalized message
   * @throws {Error} When message is invalid
   */
  _validateMessage(message) {
    if (!validator.isString(message)) {
      throw new Error('Log message must be a string')
    }

    if (!validator.isStringNotEmpty(message)) {
      throw new Error('Log message cannot be empty')
    }

    return message.trim()
  }

  /**
   * ------------------------------
   * @ERROR_METHODS
   * ------------------------------
   */

  /**
   * Log fatal errors that cause application termination
   * @param {string} message - Log message
   * @param {Error} error - Error object
   * @param {Object} [meta] - Additional metadata
   * @throws {Error} When parameters are invalid
   * @example
   * logger.fatal('Database connection failed permanently', dbError, { retryCount: 5 })
   */
  fatal(message, error, meta) {
    const normalizedMessage = this._validateMessage(message)
    assert.isOk(error, { required: true })
    assert.isOk(meta)

    const payload = this._preparePayload(error, meta)
    
    this._captureException(error instanceof Error ? error : new Error(normalizedMessage), payload)
    this._updatePerfCounters('fatal')
    
    this[$].loggers.fatal.fatal(payload, normalizedMessage)
  }

  /**
   * Log errors that should be investigated
   * @param {string} message - Log message
   * @param {Error|any} error - Error object or error data
   * @param {Object} [meta] - Additional metadata
   * @throws {Error} When parameters are invalid
   * @example
   * logger.error('API request failed', apiError, { endpoint: '/users', statusCode: 500 })
   */
  error(message, error, meta) {
    const normalizedMessage = this._validateMessage(message)
    assert.isOk(error, { required: true })
    assert.isOk(meta)

    const payload = this._preparePayload(error, meta)
    
    if (error instanceof Error) {
      this._captureException(error, payload)
    }
    
    this._updatePerfCounters('error')
    this[$].loggers.error.error(payload, normalizedMessage)
  }

  /**
   * Log warnings for potentially problematic situations
   * @param {string} message - Log message
   * @param {Error|any} [error] - Error object or warning data (optional for warnings)
   * @param {Object} [meta] - Additional metadata
   * @throws {Error} When parameters are invalid
   * @example
   * logger.warn('High memory usage detected', null, { memoryUsage: '85%', threshold: '80%' })
   */
  warn(message, error, meta) {
    const normalizedMessage = this._validateMessage(message)
    // Note: error is optional for warnings
    assert.isOk(meta)

    const payload = this._preparePayload(error, meta)
    
    if (error instanceof Error) {
      this._captureException(error, payload)
    }
    
    this._updatePerfCounters('warn')
    this[$].loggers.warn.warn(payload, normalizedMessage)
  }

  /**
   * ------------------------------
   * @INFO_METHODS
   * ------------------------------
   */

  /**
   * Log general information about application flow
   * @param {string} message - Log message
   * @param {Object} [meta] - Additional metadata
   * @throws {Error} When parameters are invalid
   * @example
   * logger.info('User logged in successfully', { userId: 123, sessionId: 'sess-456' })
   */
  info(message, meta) {
    const normalizedMessage = this._validateMessage(message)
    assert.isOk(meta)

    const payload = this._preparePayload(null, meta)
    
    this._captureMessage(normalizedMessage, payload)
    this._updatePerfCounters('info')
    
    this[$].loggers.info.info(payload, normalizedMessage)
  }

  /**
   * Log debug information for development and troubleshooting
   * @param {string} message - Log message
   * @param {Object} [meta] - Additional metadata
   * @throws {Error} When parameters are invalid
   * @example
   * logger.debug('Cache hit for user data', { userId: 123, cacheKey: 'user:123' })
   */
  debug(message, meta) {
    const normalizedMessage = this._validateMessage(message)
    assert.isOk(meta)

    const payload = this._preparePayload(null, meta)
    
    this._updatePerfCounters('debug')
    this[$].loggers.debug.debug(payload, normalizedMessage)
  }

  /**
   * Log detailed trace information for fine-grained debugging
   * @param {string} message - Log message
   * @param {Object} [meta] - Additional metadata
   * @throws {Error} When parameters are invalid
   * @example
   * logger.trace('Function entry', { function: 'processUserData', args: { userId: 123 } })
   */
  trace(message, meta) {
    const normalizedMessage = this._validateMessage(message)
    assert.isOk(meta)

    const payload = this._preparePayload(null, meta)
    
    this._updatePerfCounters('trace')
    this[$].loggers.trace.trace(payload, normalizedMessage)
  }

  /**
   * ------------------------------
   * @UTILITY_METHODS
   * ------------------------------
   */

  /**
   * Flush all pending log entries (useful before application shutdown)
   * @returns {Promise<void>} Promise that resolves when flushing is complete
   */
  async flush() {
    if (this[$].logger && typeof this[$].logger.flush === 'function') {
      await this[$].logger.flush()
    }
  }

  /**
   * Gracefully close the logger and all transports
   * @returns {Promise<void>} Promise that resolves when shutdown is complete
   */
  async close() {
    try {
      if (this[$].perfCounters) {
        this[$].loggers.info.info('Logger shutdown', {
          finalStats: this[$].perfCounters,
          uptime: Date.now() - this[$].perfCounters.lastLogTime
        })
      }

      await this.flush()
      
      if (this[$].sentryCatch && typeof this[$].sentryCatch.close === 'function') {
        await this[$].sentryCatch.close()
      }
    } catch (error) {
      console.error('Error during logger shutdown:', error)
    }
  }
}

// Freeze the class to prevent modifications
Object.freeze(Logger)
Object.freeze(Logger.prototype)

module.exports = { Logger, LOG_LEVELS }
