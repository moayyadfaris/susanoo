require('dotenv').config()

const { Model } = require('objection')
const Knex = require('knex')

const { Server, assert, ConnectionPool, AuditableDAO } = require('backend-core')
const controllers = require('./controllers')
const config = require('./config')
const middlewares = require('./middlewares')
const errorMiddleware = require('./middlewares/errorMiddleware')
const logger = require('./util/logger')

// Global state management
let server = null
let knexInstance = null
let connectionPool = null

/**
 * Main application entry point
 */
async function main() {
  try {
    // Validate environment before starting
    await validateEnvironment()
    
    // Initialize configuration
    await config.mainInit()
    logger.info('Configuration initialized successfully')
    
    // Initialize database
    await initializeDatabase()
    
    // Initialize server
    await initializeServer()
    
    // Setup graceful shutdown handlers
    setupGracefulShutdown()
    
    logger.info('Application started successfully', {
      host: config.app.host,
      port: config.app.port,
      environment: config.app.nodeEnv
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
      logger
    })
    
    // Wait for the server to start
    await server
    
    logger.info('Server initialized successfully', {
      host: config.app.host,
      port: config.app.port,
      name: config.app.name
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
      logger.info(`Received ${signal}, initiating graceful shutdown...`)
      await gracefulShutdown(0)
    })
  })
  
  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception occurred', {
      error: error.message,
      stack: error.stack
    })
    await gracefulShutdown(1)
  })
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled promise rejection', {
      reason,
      promise
    })
    await gracefulShutdown(1)
  })
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
