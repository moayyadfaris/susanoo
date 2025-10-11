require('dotenv').config()

const { Model } = require('objection')

const { Server, assert, ConnectionPool, AuditableDAO } = require('backend-core')
const LoginHandler = require('./handlers/v1/app/auth/LoginHandler')
const { RedisClient } = require('./clients')
const pkg = require('./package.json')

const controllers = require('./controllers')
const config = require('./config')
const middlewares = require('./middlewares')
const errorMiddleware = require('./middlewares/errorMiddleware')
const logger = require('./util/logger')

// Global state management
let server = null
let knexInstance = null
let connectionPool = null
let shuttingDown = false

function nsToMs(ns) {
  return Math.round(Number(ns) / 1e6)
}

function getBuildInfo() {
  return {
    app: config?.app?.name || 'SusanooAPI',
    version: pkg.version,
    node: process.version,
    pid: process.pid,
    env: config?.app?.nodeEnv,
    commit: process.env.GIT_COMMIT || null,
    host: config?.app?.host,
    port: config?.app?.port
  }
}

/**
 * Main application entry point
 */
async function main() {
  try {
    const t0 = process.hrtime.bigint()
    process.title = `${config?.app?.name || 'SusanooAPI'}:${process.env.NODE_ENV || 'development'}`
    logger.info('Starting application...', getBuildInfo())

    // Validate environment before starting
    await validateEnvironment()
    const tAfterEnv = process.hrtime.bigint()
    
    // Initialize configuration
    await config.mainInit()
    logger.info('Configuration initialized successfully')
    const tAfterConfig = process.hrtime.bigint()
    
    // Initialize database
    await initializeDatabase()
    const tAfterDb = process.hrtime.bigint()
    
    // Initialize server
    await initializeServer()
    const tAfterServer = process.hrtime.bigint()
    
    // Setup graceful shutdown handlers
    setupGracefulShutdown()
    
    logger.info('Application started successfully', {
      host: config.app.host,
      port: config.app.port,
      environment: config.app.nodeEnv,
      timings: {
        validateEnv: `${nsToMs(tAfterEnv - t0)}ms`,
        configInit: `${nsToMs(tAfterConfig - tAfterEnv)}ms`,
        dbInit: `${nsToMs(tAfterDb - tAfterConfig)}ms`,
        serverInit: `${nsToMs(tAfterServer - tAfterDb)}ms`,
        totalStartup: `${nsToMs(tAfterServer - t0)}ms`
      },
      build: getBuildInfo(),
      memory: process.memoryUsage()
    })
    
  } catch (error) {
    await handleFatalError('Application startup failed', error)
  }
}

/**
 * Validates required environment variables and configuration
 */
async function validateEnvironment() {
  const requiredEnvVars = ['NODE_ENV', 'APP_PORT', 'APP_HOST']
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
  }
  // Validate critical config values
  const missingConfig = []
  if (!config?.app?.cookieSecret) missingConfig.push('config.app.cookieSecret')
  if (!config?.knex?.connection?.host) missingConfig.push('config.knex.connection.host')
  if (!config?.knex?.connection?.database) missingConfig.push('config.knex.connection.database')
  if (!config?.knex?.connection?.user) missingConfig.push('config.knex.connection.user')
  if (missingConfig.length) {
    throw new Error(`Missing required configuration: ${missingConfig.join(', ')}`)
  }

  logger.debug('Environment validation passed')
}

/**
 * Initializes the database connection and sets up Objection.js
 */
async function initializeDatabase() {
  try {
    // Initialize Connection Pool
    connectionPool = new ConnectionPool({
      primary: {
        host: config.knex.connection.host,
        port: config.knex.connection.port,
        database: config.knex.connection.database,
        user: config.knex.connection.user,
        password: config.knex.connection.password,
        charset: config.knex.connection.charset
      },
      pool: {
        min: config.knex.pool?.min || 2,
        max: config.knex.pool?.max || 20
      },
      healthCheck: {
        enabled: true,
        interval: 30000
      }
    })

    // Initialize the connection pool
    await connectionPool.initialize()
    
    // Set the connection pool for all enterprise DAOs
    AuditableDAO.setConnectionPool(connectionPool)
    
    // Get the primary connection for Objection.js
    knexInstance = connectionPool.getWriteConnection()
    Model.knex(knexInstance)
    
    // Test database connection
    await testDbConnection()
    
    logger.info('Database initialized successfully', {
      client: config.knex.client,
      host: config.knex.connection.host,
      port: config.knex.connection.port,
      database: config.knex.connection.database,
      user: config.knex.connection.user,
      poolStatus: 'Connection Pool Active'
    })
    
  } catch (error) {
    throw new Error(`Database initialization failed: ${error.message}`)
  }
}

/**
 * Initializes the web server
 */
async function initializeServer() {
  try {
    server = new Server({
      port: Number(config.app.port),
      host: config.app.host,
      controllers,
      middlewares,
      errorMiddleware,
      cookieSecret: config.app.cookieSecret,
      logger,
      metricsProviders: [
        {
          name: 'dbPool',
          collector: () => {
            try {
              return connectionPool?.getMetrics?.() || { error: 'no_connection_pool' }
            } catch (e) {
              return { error: e?.message || 'collection_failed' }
            }
          }
        },
        {
          name: 'loginHandler',
          collector: () => {
            try {
              return LoginHandler?.getMetrics?.() || { error: 'no_metrics' }
            } catch (e) {
              return { error: e?.message || 'collection_failed' }
            }
          }
        },
        {
          name: 'middlewareMetrics',
          collector: () => {
            try {
              // Pull instances from registry if available
              const registry = require('./middlewares').getMiddlewareRegistry?.()
              const instances = registry?.getMiddlewareInstances?.()
              if (!instances || instances.size === 0) return { error: 'no_instances' }
              const out = {}
              for (const [name, inst] of instances.entries()) {
                if (typeof inst.getMetrics === 'function') {
                  try {
                    out[name] = inst.getMetrics()
                  } catch (err) {
                    out[name] = { error: err?.message || 'collection_failed' }
                  }
                }
              }
              return out
            } catch (e) {
              return { error: e?.message || 'collection_failed' }
            }
          }
        }
      ],
      readinessChecks: [
        {
          name: 'db',
          checker: async () => {
            try {
              await knexInstance.raw('select 1')
              return true
            } catch {
              return false
            }
          }
        },
        {
          name: 'redis',
          checker: async () => {
            try {
              // If Redis config is missing, treat as not-applicable (ready)
              if (!config?.redis?.host || !config?.redis?.port) return true

              const rc = new RedisClient({
                host: config.redis.host,
                port: config.redis.port,
                password: config.redis.password,
                logger,
                lazyConnect: true
              })
              await rc.connect()
              const health = await rc.healthCheck()
              await rc.shutdown()
              return health?.status === 'healthy'
            } catch {
              return false
            }
          }
        }
      ],
      enablePrometheus: process.env.ENABLE_PROMETHEUS === '1'
    })
    
    // Explicitly start the server
    await server.start()
    
    logger.info('Server initialized successfully', {
      host: config.app.host,
      port: config.app.port,
      name: config.app.name,
      urls: {
        local: `http://${config.app.host}:${config.app.port}`,
        health: `http://${config.app.host}:${config.app.port}/health-check`,
        swagger: `http://${config.app.host}:${config.app.port}/api-docs`
      }
    })
    
    // Log token configurations in debug mode
    if (config.app.nodeEnv === 'development') {
      logger.debug('Token configurations loaded', {
        refresh: config.token.refresh,
        access: config.token.access.toString(),
        resetPassword: config.token.resetPassword.toString(),
        emailConfirm: config.token.emailConfirm.toString(),
        issuer: config.token.jwtIss
      })
    }
    
  } catch (error) {
    throw new Error(`Server initialization failed: ${error.message}`)
  }
}

/**
 * Tests database connectivity
 */
async function testDbConnection() {
  assert.func(knexInstance, { required: true })
  assert.func(knexInstance.raw, { required: true })

  try {
    logger.debug('Testing database connection...')
    await knexInstance.raw('select 1+1 as result')
    logger.debug('Database connection test successful')
  } catch (error) {
    throw new Error(`Database connection test failed: ${error.message}`)
  }
}

/**
 * Handles fatal errors during application startup
 */
async function handleFatalError(message, error) {
  logger.error(message, {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  })
  
  // Attempt graceful cleanup
  await gracefulShutdown(1)
}

/**
 * Sets up signal handlers for graceful shutdown
 */
function setupGracefulShutdown() {
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT']
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      if (shuttingDown) return
      shuttingDown = true
      logger.info(`Received ${signal}, initiating graceful shutdown...`)
      await gracefulShutdown(0)
    })
  })
  
  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    if (shuttingDown) return
    logger.error('Uncaught exception occurred', {
      error: error.message,
      stack: error.stack
    })
    shuttingDown = true
    await gracefulShutdown(1)
  })
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason) => {
    if (shuttingDown) return
    const reasonInfo = reason instanceof Error ? { message: reason.message, stack: reason.stack } : { reason }
    logger.error('Unhandled promise rejection', { ...reasonInfo })
    shuttingDown = true
    await gracefulShutdown(1)
  })

  // Log warnings (e.g., DeprecationWarning)
  process.on('warning', (warning) => {
    // Suppress noisy Node.js deprecation for multipleResolves unless explicitly debugging
    if (
      warning?.name === 'DeprecationWarning' &&
      typeof warning?.message === 'string' &&
      warning.message.includes('multipleResolves') &&
      process.env.DEBUG_MULTIPLE_RESOLVES !== '1'
    ) {
      return
    }
    logger.warn('Process warning', { name: warning.name, message: warning.message, stack: warning.stack })
  })

  // Help with tools like nodemon to exit cleanly
  process.on('SIGUSR2', async () => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('Received SIGUSR2 (restart), initiating graceful shutdown...')
    await gracefulShutdown(0)
  })

  // Diagnostic for multiple resolve/reject of the same promise (opt-in)
  if (process.env.DEBUG_MULTIPLE_RESOLVES === '1') {
    process.on('multipleResolves', (type, _promise, reason) => {
      logger.warn('Multiple promise resolves detected', { type, reason: reason?.message || reason })
    })
  }
}

/**
 * Performs graceful shutdown of all application components
 */
async function gracefulShutdown(exitCode = 0) {
  logger.info('Starting graceful shutdown...')
  
  const shutdownPromises = []
  
  // Close server if initialized
  if (server && typeof server.close === 'function') {
    shutdownPromises.push(
      new Promise((resolve) => {
        server.close((error) => {
          if (error) {
            logger.error('Error closing server', { error: error.message })
          } else {
            logger.info('Server closed successfully')
          }
          resolve()
        })
      })
    )
  }
  
  // Close connection pool if initialized
  if (connectionPool && typeof connectionPool.shutdown === 'function') {
    shutdownPromises.push(
      connectionPool.shutdown()
        .then(() => logger.info('Connection pool closed successfully'))
        .catch(error => logger.error('Error closing connection pool', { error: error.message }))
    )
  }
  
  // Close database connection if initialized (fallback)
  if (knexInstance && typeof knexInstance.destroy === 'function') {
    shutdownPromises.push(
      knexInstance.destroy()
        .then(() => logger.info('Database connection closed successfully'))
        .catch(error => logger.error('Error closing database connection', { error: error.message }))
    )
  }
  
  // Wait for all shutdown operations to complete with timeout
  try {
    await Promise.race([
      Promise.all(shutdownPromises),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Shutdown timeout')), 10000)
      )
    ])
    logger.info('Graceful shutdown completed successfully')
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: error.message })
  }
  
  process.exit(exitCode)
}

// Start the application
main()
