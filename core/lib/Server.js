const express = require('express')
const path = require('path')
// const favicon = require('serve-favicon')
const morganLogger = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const compression = require('compression')
const helmet = require('helmet')

const { Assert: assert } = require('./assert')
const { BaseMiddleware } = require('./BaseMiddleware')
const { AbstractLogger } = require('./AbstractLogger')

const swaggerUi = require('swagger-ui-express')
const swaggerDocument = require('../../public/docs/swagger.json')
const swStats = require('swagger-stats')
const swaggerConfig = require('../../config/swagger')

class Server {
  constructor ({ port, host, controllers, middlewares, errorMiddleware, cookieSecret, logger }) {
    this.validateParameters({ port, host, controllers, middlewares, errorMiddleware, cookieSecret, logger })
    
    this.config = {
      port,
      host,
      controllers,
      middlewares,
      ErrorMiddleware: errorMiddleware,
      cookieSecret,
      logger
    }
    
    this.app = null
    this.server = null
    this.logger = logger
    
    logger.info('Server initialization started', { port, host })
    
    // Return the promise from start method
    return this.start()
  }
  
  /**
   * Validates constructor parameters
   */
  validateParameters({ port, host, controllers, middlewares, errorMiddleware, cookieSecret, logger }) {
    assert.integer(port, { required: true, positive: true })
    assert.string(host, { required: true, notEmpty: true })
    assert.object(controllers, { required: true, notEmpty: true, message: 'controllers param expects not empty object' })
    assert.array(middlewares, { required: true, notEmpty: true, message: 'middlewares param expects not empty array' })
    assert.instanceOf(errorMiddleware.prototype, BaseMiddleware)
    assert.string(cookieSecret, { required: true, notEmpty: true })
    assert.instanceOf(logger, AbstractLogger)
  }
  
  /**
   * Starts the server with proper error handling
   */
  async start() {
    try {
      const { port, host, controllers, middlewares, ErrorMiddleware, cookieSecret, logger } = this.config
      
      this.app = express()
      
      // Configure Express app
      await this.configureExpress()
      
      // Initialize middlewares
      await this.initializeMiddlewares(middlewares, logger)
      
      // Initialize controllers
      await this.initializeControllers(controllers, logger)
      
      // Initialize error handling
      await this.initializeErrorHandling(ErrorMiddleware, logger)
      
      // Setup additional routes
      this.setupAdditionalRoutes()
      
      // Setup 404 handler
      this.setup404Handler()
      
      // Start listening
      return new Promise((resolve, reject) => {
        this.server = this.app.listen(port, host, (error) => {
          if (error) {
            logger.error('Failed to start server', { error: error.message, port, host })
            return reject(error)
          }
          
          logger.info('Server started successfully', { port, host, pid: process.pid })
          resolve({ port, host, app: this.app, server: this.server })
        })
        
        this.server.on('error', (error) => {
          logger.error('Server error occurred', { error: error.message })
          reject(error)
        })
      })
      
    } catch (error) {
      this.logger.error('Server initialization failed', { error: error.message, stack: error.stack })
      throw error
    }
  }
  
  /**
   * Configures Express application with middleware and settings
   */
  async configureExpress() {
    const { cookieSecret, logger } = this.config
    
    // Trust proxy for load balancers
    this.app.enable('trust proxy')
    
    // Development-specific middleware
    if (process.env.NODE_ENV !== 'production') {
      this.app.use(morganLogger('dev'))
      logger.debug('Morgan logging enabled for development')
    }
    
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false
    }))
    
    // Body parsing middleware
    this.app.use(bodyParser.json({ limit: '10mb' }))
    this.app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }))
    
    // Cookie parsing
    this.app.use(cookieParser(cookieSecret))
    
    // Static files
    this.app.use(express.static(path.join(__dirname, '../../public'), {
      maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
    }))
    
    // Compression
    this.app.use(compression())
    
    // Health check endpoint
    this.app.get('/health-check', (req, res) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      })
    })
    
    logger.debug('Express application configured successfully')
  }

  /**
   * Initializes application middlewares
   */
  async initializeMiddlewares(middlewares, logger) {
    try {
      logger.debug(`Initializing ${middlewares.length} middlewares...`)
      
      for (const [index, Middleware] of middlewares.entries()) {
        const middleware = new Middleware({ logger })
        
        logger.debug(`Initializing middleware ${index + 1}/${middlewares.length}: ${Middleware.name}`)
        
        await middleware.init()
        this.app.use(middleware.handler())
        
        logger.debug(`Middleware ${Middleware.name} initialized successfully`)
      }
      
      logger.info('All middlewares initialized successfully')
    } catch (error) {
      logger.error('Middleware initialization failed', { error: error.message, stack: error.stack })
      throw new Error(`Middleware initialization failed: ${error.message}`)
    }
  }
  
  /**
   * Initializes application controllers
   */
  async initializeControllers(controllers, logger) {
    try {
      logger.debug('Initializing controllers...')
      
      if (!controllers.routesV1 || !Array.isArray(controllers.routesV1)) {
        throw new Error('Controllers must have routesV1 array')
      }
      
      for (const [routeIndex, route] of controllers.routesV1.entries()) {
        if (!route.version || !Array.isArray(route.routes)) {
          throw new Error(`Route ${routeIndex} must have version and routes array`)
        }
        
        logger.debug(`Initializing route group: ${route.version} with ${route.routes.length} controllers`)
        
        for (const [controllerIndex, Controller] of route.routes.entries()) {
          const controller = new Controller({ logger })
          
          assert.func(controller.init, { required: true, message: `Controller ${Controller.name} must have init method` })
          assert.func(controller.router, { required: true, message: `Controller ${Controller.name} must have router method` })
          
          logger.debug(`Initializing controller ${controllerIndex + 1}/${route.routes.length}: ${Controller.name}`)
          
          await controller.init()
          this.app.use(route.version, controller.router)
          
          logger.debug(`Controller ${Controller.name} initialized successfully`)
        }
      }
      
      logger.info('All controllers initialized successfully')
    } catch (error) {
      logger.error('Controller initialization failed', { error: error.message, stack: error.stack })
      throw new Error(`Controller initialization failed: ${error.message}`)
    }
  }
  
  /**
   * Initializes error handling middleware
   */
  async initializeErrorHandling(ErrorMiddleware, logger) {
    try {
      logger.debug('Initializing error handling middleware...')
      
      const errorMiddleware = new ErrorMiddleware({ logger })
      await errorMiddleware.init()
      this.app.use(errorMiddleware.handler())
      
      logger.debug('Error handling middleware initialized successfully')
    } catch (error) {
      logger.error('Error middleware initialization failed', { error: error.message, stack: error.stack })
      throw new Error(`Error middleware initialization failed: ${error.message}`)
    }
  }
  
  /**
   * Sets up additional routes like Swagger, users management, etc.
   */
  setupAdditionalRoutes() {
    const { logger } = this.config
    
    try {
      // Swagger UI
      this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, swaggerConfig.options))
      
      // Swagger stats (only in development)
      if (process.env.NODE_ENV !== 'production') {
        this.app.use(swStats.getMiddleware({ swaggerSpec: swaggerDocument }))
      }
      
      // Users management page
      this.app.get('/users', (req, res) => {
        const filePath = path.join(__dirname, '../../public/users/users_managment.html')
        res.sendFile(filePath, (error) => {
          if (error) {
            logger.error('Failed to serve users management page', { error: error.message })
            res.status(404).json({ message: 'Users management page not found' })
          }
        })
      })
      
      logger.debug('Additional routes configured successfully')
    } catch (error) {
      logger.error('Failed to setup additional routes', { error: error.message })
      throw error
    }
  }
  
  /**
   * Sets up 404 handler
   */
  setup404Handler() {
    this.app.use((req, res) => {
      const { logger } = this.config
      
      logger.warn('Route not found', { 
        url: req.url, 
        method: req.method, 
        ip: req.ip,
        userAgent: req.get('User-Agent')
      })
      
      res.status(404).json({
        message: `Route: '${req.url}' not found`,
        code: 'ROUTE_NOT_FOUND_ERROR',
        timestamp: new Date().toISOString()
      })
    })
  }
  
  /**
   * Gracefully shuts down the server
   */
  async shutdown() {
    const { logger } = this.config
    
    if (!this.server) {
      logger.warn('Server shutdown requested but server is not running')
      return
    }
    
    return new Promise((resolve, reject) => {
      logger.info('Shutting down server...')
      
      const timeout = setTimeout(() => {
        logger.error('Server shutdown timeout, forcing close')
        this.server.destroy()
        reject(new Error('Server shutdown timeout'))
      }, 10000)
      
      this.server.close((error) => {
        clearTimeout(timeout)
        
        if (error) {
          logger.error('Error during server shutdown', { error: error.message })
          reject(error)
        } else {
          logger.info('Server shut down successfully')
          resolve()
        }
      })
    })
  }
}module.exports = { Server }
