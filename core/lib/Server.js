const express = require('express')
const path = require('path')
const { createServer } = require('http')
const morganLogger = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const compression = require('compression')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const cors = require('cors')
const { performance } = require('perf_hooks')

const { Assert: assert } = require('./assert')
const { ValidatorNano: validator } = require('./validator/ValidatorNano')
const { BaseMiddleware } = require('./BaseMiddleware')
const { AbstractLogger } = require('./AbstractLogger')

const swaggerUi = require('swagger-ui-express')
const swaggerDocument = require('../../public/docs/swagger.json')
const swStats = require('swagger-stats')
const swaggerConfig = require('../../config/swagger')

/**
 * Private scope symbol for encapsulation
 * @private
 */
const $ = Symbol('private scope')

/**
 * Default server configuration
 * @readonly
 */
const DEFAULT_CONFIG = Object.freeze({
  bodyLimit: {
    json: '10mb',
    urlencoded: '50mb'
  },
  timeout: {
    server: 30000, // 30 seconds
    shutdown: 10000 // 10 seconds graceful shutdown
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
  },
  cors: {
    origin: process.env.CORS_ORIGIN || false,
    credentials: true,
    optionsSuccessStatus: 200
  },
  helmet: {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false,
    // Enable HSTS only in production with safe defaults (seconds)
    hsts: process.env.NODE_ENV === 'production' ? {
      maxAge: 15552000, // 180 days
      includeSubDomains: true,
      preload: false
    } : false,
    noSniff: true,
    frameguard: { action: 'deny' },
    // Conservative default; adjust if you need referrers
    referrerPolicy: { policy: 'no-referrer' }
    
  }
})

/**
 * Enhanced Server class with production-ready features
 * 
 * Features:
 * - Graceful startup and shutdown
 * - Comprehensive error handling
 * - Security hardening with Helmet
 * - Rate limiting and CORS
 * - Performance monitoring
 * - Health checks and metrics
 * - Request/Response logging
 * - Timeout management
 * - Static file optimization
 * 
 * @class Server
 * @version 3.0.0
 * @author Susanoo API Team
 * @since 1.0.0
 * 
 * @example
 * const server = new Server({
 *   port: 4000,
 *   host: 'localhost',
 *   controllers,
 *   middlewares,
 *   errorMiddleware,
 *   cookieSecret: 'your-secret',
 *   logger,
 *   enableRateLimit: true,
 *   corsOptions: { origin: 'https://yourdomain.com' }
 * })
 */
class Server {
  /**
   * Create a new Server instance
   * @param {Object} options - Server configuration options
   * @param {number} options.port - Server port
   * @param {string} options.host - Server host
   * @param {Object} options.controllers - Controllers configuration
   * @param {Array} options.middlewares - Application middlewares
   * @param {Class} options.errorMiddleware - Error handling middleware class
   * @param {string} options.cookieSecret - Cookie secret for signing
   * @param {AbstractLogger} options.logger - Logger instance
   * @param {boolean} [options.enableRateLimit=true] - Enable rate limiting
   * @param {Object} [options.corsOptions] - CORS configuration
   * @param {Object} [options.rateLimitOptions] - Rate limit configuration
   * @param {boolean} [options.enableMetrics=true] - Enable performance metrics
   * @param {boolean} [options.enableSwagger=true] - Enable Swagger documentation
   * @throws {Error} When required parameters are missing or invalid
   */
  constructor({
    port,
    host,
    controllers,
    middlewares,
    errorMiddleware,
    cookieSecret,
    logger,
    enableRateLimit = true,
    corsOptions = DEFAULT_CONFIG.cors,
    rateLimitOptions = DEFAULT_CONFIG.rateLimit,
    enableMetrics = true,
    enableSwagger = true,
    metricsProviders = [],
    // Readiness checks: functions or { name, checker }
    readinessChecks = [],
    readinessTimeoutMs = 2000,
    // Prometheus text-format metrics
    enablePrometheus = process.env.ENABLE_PROMETHEUS === '1'
  }) {
    // Enhanced parameter validation
    this.validateParameters({
      port,
      host,
      controllers,
      middlewares,
      errorMiddleware,
      cookieSecret,
      logger,
      enableRateLimit,
      corsOptions,
      rateLimitOptions,
      enableMetrics,
      enableSwagger,
      metricsProviders,
      readinessChecks,
      readinessTimeoutMs,
      enablePrometheus
    })
    
    // Initialize private scope
    this[$] = {
      config: {
        port,
        host,
        controllers,
        middlewares,
        ErrorMiddleware: errorMiddleware,
        cookieSecret,
        logger,
        enableRateLimit,
        corsOptions,
        rateLimitOptions,
        enableMetrics,
        enableSwagger,
        metricsProviders,
        readinessChecks,
        readinessTimeoutMs,
        enablePrometheus
      },
      app: null,
      server: null,
      startTime: Date.now(),
      isShuttingDown: false,
      metrics: enableMetrics ? {
        requestCount: 0,
        errorCount: 0,
        totalResponseTime: 0,
        lastResponseTime: 0,
        lastActivity: null,
        startTime: Date.now()
      } : null
    }
    
    this.logger = logger
    
    // Bind methods to preserve context
    this.shutdown = this.shutdown.bind(this)
    
    this.logger.info('Server initialization started', {
      port,
      host,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version
    })
    
    // Do not start automatically; caller should invoke start()
  }
  
  /**
   * Enhanced parameter validation with detailed error messages
   * @private
   */
  validateParameters({
    port,
    host,
    controllers,
    middlewares,
    errorMiddleware,
    cookieSecret,
    logger,
    enableRateLimit,
    corsOptions,
    rateLimitOptions,
    enableMetrics,
    enableSwagger,
    metricsProviders,
    readinessChecks,
    readinessTimeoutMs,
    enablePrometheus
  }) {
    // Basic parameter validation
    assert.integer(port, { required: true, positive: true })
    if (!validator.isInRange(port, 1, 65535)) {
      throw new Error('Port must be between 1 and 65535')
    }
    
    assert.string(host, { required: true, notEmpty: true })
    if (!validator.isStringNotEmpty(host)) {
      throw new Error('Host must be a non-empty string')
    }
    
    assert.object(controllers, { required: true, notEmpty: true })
    if (!controllers.routesV1 || !Array.isArray(controllers.routesV1)) {
      throw new Error('Controllers must have routesV1 array property')
    }
    
    assert.array(middlewares, { required: true, notEmpty: true })
    if (!validator.isArrayNotEmpty(middlewares)) {
      throw new Error('Middlewares must be a non-empty array')
    }
    
    assert.instanceOf(errorMiddleware.prototype, BaseMiddleware)
    
    assert.string(cookieSecret, { required: true, notEmpty: true })
    if (!validator.isStringMinLength(cookieSecret, 32)) {
      throw new Error('Cookie secret must be at least 32 characters long for security')
    }
    
    assert.instanceOf(logger, AbstractLogger)
    
    // Enhanced validation for new parameters
    assert.boolean(enableRateLimit)
    assert.boolean(enableMetrics)
    assert.boolean(enableSwagger)
    
    if (corsOptions && !validator.isObject(corsOptions)) {
      throw new Error('CORS options must be an object')
    }
    
    if (rateLimitOptions && !validator.isObject(rateLimitOptions)) {
      throw new Error('Rate limit options must be an object')
    }

    // Optional metrics providers validation
    if (metricsProviders) {
      if (!Array.isArray(metricsProviders)) {
        throw new Error('metricsProviders must be an array when provided')
      }
      for (const [i, p] of metricsProviders.entries()) {
        const isFunc = typeof p === 'function'
        const isObj = p && typeof p === 'object'
        const hasCollector = isObj && typeof p.collector === 'function'
        if (!isFunc && !hasCollector) {
          throw new Error(`metricsProviders[${i}] must be a function or an object with a collector() function`)
        }
      }
    }

    // Readiness checks validation
    if (readinessChecks) {
      if (!Array.isArray(readinessChecks)) {
        throw new Error('readinessChecks must be an array when provided')
      }
      for (const [i, c] of readinessChecks.entries()) {
        const isFunc = typeof c === 'function'
        const isObj = c && typeof c === 'object'
        const hasChecker = isObj && typeof c.checker === 'function'
        if (!isFunc && !hasChecker) {
          throw new Error(`readinessChecks[${i}] must be a function or an object with a checker() function`)
        }
      }
    }
    if (readinessTimeoutMs !== undefined && !Number.isFinite(readinessTimeoutMs)) {
      throw new Error('readinessTimeoutMs must be a finite number when provided')
    }
    if (enablePrometheus !== undefined && typeof enablePrometheus !== 'boolean') {
      throw new Error('enablePrometheus must be a boolean when provided')
    }
  }
  
  /**
   * Starts the server with enhanced error handling and monitoring
   * @private
   */
  async start() {
    const startTime = performance.now()
    
    try {
      const config = this[$].config
      
      this[$].app = express()
      
      // Create HTTP server
      this[$].server = createServer(this[$].app)
      
      // Configure server timeouts
      this[$].server.timeout = DEFAULT_CONFIG.timeout.server
      this[$].server.keepAliveTimeout = 65000
      this[$].server.headersTimeout = 66000
      
      // Configure Express app
      await this.configureExpress()
      
      // Initialize middlewares
      await this.initializeMiddlewares(config.middlewares, config.logger)
      
      // Initialize controllers
      await this.initializeControllers(config.controllers, config.logger)
      
      // Initialize error handling
      await this.initializeErrorHandling(config.ErrorMiddleware, config.logger)
      
      // Setup additional routes
      await this.setupAdditionalRoutes()
      
      // Setup 404 handler
      this.setup404Handler()
      
      // Setup signal handlers for graceful shutdown
      if (process.env.SERVER_HANDLE_SIGNALS === '1') {
        this.setupSignalHandlers()
      }
      
      // Start listening
      return new Promise((resolve, reject) => {
        this[$].server.listen(config.port, config.host, (error) => {
          if (error) {
            this.logger.error('Failed to start server', { 
              error: error.message, 
              port: config.port, 
              host: config.host 
            })
            return reject(error)
          }
          
          const duration = performance.now() - startTime
          
          this.logger.info('Server started successfully', {
            port: config.port,
            host: config.host,
            pid: process.pid,
            environment: process.env.NODE_ENV || 'development',
            startupTime: `${duration.toFixed(2)}ms`,
            urls: {
              local: `http://${config.host}:${config.port}`,
              health: `http://${config.host}:${config.port}/health-check`,
              ...(config.enableSwagger && {
                swagger: `http://${config.host}:${config.port}/api-docs`
              })
            }
          })
          
          resolve({ 
            port: config.port, 
            host: config.host, 
            app: this[$].app, 
            server: this[$].server,
            getStatus: () => this.getStatus(),
            shutdown: this.shutdown
          })
        })
        
        this[$].server.on('error', (error) => {
          if (error.code === 'EADDRINUSE') {
            this.logger.error('Port already in use', { 
              port: config.port, 
              host: config.host 
            })
          } else {
            this.logger.error('Server error occurred', { error: error.message })
          }
          reject(error)
        })
        
        // Handle server connection errors
        this[$].server.on('clientError', (error, socket) => {
          this.logger.warn('Client connection error', { 
            error: error.message,
            remoteAddress: socket.remoteAddress 
          })
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
        })
      })
      
    } catch (error) {
      this.logger.error('Server initialization failed', { 
        error: error.message, 
        stack: error.stack,
        startupTime: `${(performance.now() - startTime).toFixed(2)}ms`
      })
      throw error
    }
  }
  
  /**
   * Configures Express application with enhanced middleware and security settings
   * @private
   */
  async configureExpress() {
    const config = this[$].config
    const app = this[$].app
    
    // Trust proxy for load balancers and reverse proxies
    app.set('trust proxy', 1)
    
    // Disable unnecessary Express headers for security
    app.disable('x-powered-by')
    app.disable('etag') // Disable weak ETags for better caching control
    
    // Request tracking middleware (must be first)
    if (config.enableMetrics) {
      app.use((req, res, next) => {
        const startTime = performance.now()
        
        // Track request metrics
        if (this[$].metrics) {
          this[$].metrics.requestCount++
          this[$].metrics.lastActivity = Date.now()
        }
        
        // Add request ID for tracing
        req.id = require('crypto').randomBytes(16).toString('hex')
        
        // Set application-specific headers
        res.setHeader('X-Request-ID', req.id)
        res.setHeader('Server', 'SusanooAPIServer')
        res.setHeader('X-Node-Version', process.version)
        res.setHeader('X-Environment', process.env.NODE_ENV || 'development')
        res.setHeader('X-Timestamp', new Date().toISOString())
        
        // Track response time
        res.on('finish', () => {
          const duration = performance.now() - startTime
          const metrics = this[$].metrics

          if (metrics) {
            metrics.totalResponseTime += duration
            metrics.lastResponseTime = duration

            if (res.statusCode >= 400) {
              metrics.errorCount++
            }
          }
          
          // Log slow requests
          if (duration > 1000) { // > 1 second
            this.logger.warn('Slow request detected', {
              requestId: req.id,
              method: req.method,
              url: req.url,
              statusCode: res.statusCode,
              duration: `${duration.toFixed(2)}ms`
            })
          }
        })
        
        next()
      })
    }
    
    // CORS configuration
    if (config.corsOptions) {
      app.use(cors(config.corsOptions))
      this.logger.debug('CORS configured', { 
        origin: config.corsOptions.origin || 'disabled' 
      })
    }
    
    // Rate limiting (before other middleware)
    if (config.enableRateLimit) {
      const limiter = rateLimit({
        ...DEFAULT_CONFIG.rateLimit,
        ...config.rateLimitOptions,
        handler: (req, res) => {
          this.logger.warn('Rate limit exceeded', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.url
          })
          
          res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.round(config.rateLimitOptions.windowMs / 1000) || 900
          })
        }
      })
      
      app.use(limiter)
      this.logger.debug('Rate limiting enabled', {
        windowMs: config.rateLimitOptions.windowMs || DEFAULT_CONFIG.rateLimit.windowMs,
        max: config.rateLimitOptions.max || DEFAULT_CONFIG.rateLimit.max
      })
    }
    
    // Security middleware with enhanced configuration
    app.use(helmet({
      ...DEFAULT_CONFIG.helmet,
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
        directives: {
          defaultSrc: ['\'self\''],
          styleSrc: ['\'self\'', '\'unsafe-inline\'', 'cdnjs.cloudflare.com'],
          scriptSrc: ['\'self\'', '\'unsafe-inline\'', 'cdnjs.cloudflare.com'],
          imgSrc: ['\'self\'', 'data:', 'https:'],
          connectSrc: ['\'self\''],
          fontSrc: ['\'self\'', 'cdnjs.cloudflare.com'],
          objectSrc: ['\'none\''],
          mediaSrc: ['\'self\''],
          frameSrc: ['\'none\'']
        }
      } : false
    }))
    
    // Development-specific middleware
    if (process.env.NODE_ENV !== 'production') {
      // Custom Morgan format with request ID
      const morganFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms'
      
      app.use(morganLogger(morganFormat, {
        stream: {
          write: (message) => {
            this.logger.debug('HTTP Request', { 
              morgan: message.trim() 
            })
          }
        }
      }))
      
      this.logger.debug('Morgan logging enabled for development')
    }
    
    // Body parsing middleware with enhanced security
    app.use(bodyParser.json({
      limit: DEFAULT_CONFIG.bodyLimit.json,
      strict: true,
      verify: (req, res, buf) => {
        // Store raw body for webhook verification if needed
        req.rawBody = buf
      }
    }))
    
    app.use(bodyParser.urlencoded({
      extended: true,
      limit: DEFAULT_CONFIG.bodyLimit.urlencoded,
      parameterLimit: 1000 // Limit number of parameters
    }))
    
    // Cookie parsing with enhanced security
    app.use(cookieParser(config.cookieSecret))
    
    // Compression with optimized settings
    app.use(compression({
      level: 6, // Balance between compression ratio and CPU usage
      threshold: 1024, // Only compress responses larger than 1KB
      filter: (req, res) => {
        // Don't compress already compressed responses
        if (res.getHeader('Cache-Control') && res.getHeader('Cache-Control').includes('no-transform')) {
          return false
        }
        return compression.filter(req, res)
      }
    }))
    
    // Static files with optimized caching
    const staticOptions = {
      maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0, // 1 year in production
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        // Set appropriate cache headers based on file type
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, must-revalidate')
        } else if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      }
    }
    
    app.use(express.static(path.join(__dirname, '../../public'), staticOptions))
    
    // Enhanced health check endpoint with detailed metrics
    app.get('/health-check', (req, res) => {
      const status = this.getStatus()
      
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: status.uptime,
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        node: {
          version: process.version,
          pid: process.pid,
          memory: status.memory
        },
        ...(config.enableMetrics && this[$].metrics && {
          metrics: this[$].metrics
        })
      })
    })
    
    // Readiness probe for Kubernetes/Docker
    app.get('/ready', (req, res) => {
      if (this[$].isShuttingDown) {
        return res.status(503).json({
          status: 'NOT_READY',
          message: 'Server is shutting down'
        })
      }
      // Run dependency checks if configured
      const { readinessChecks, readinessTimeoutMs } = config
      if (Array.isArray(readinessChecks) && readinessChecks.length > 0) {
        const results = []
        const withTimeout = (p) => Promise.race([
          Promise.resolve().then(p),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), readinessTimeoutMs))
        ])

        Promise.allSettled(
          readinessChecks.map((c, idx) => {
            const name = (typeof c === 'function') ? (c.name || `check_${idx}`) : (c.name || `check_${idx}`)
            const checker = (typeof c === 'function') ? c : c.checker
            return withTimeout(() => checker()).then(val => ({ name, ok: val !== false, detail: val })).catch(err => ({ name, ok: false, error: err?.message || 'failed' }))
          })
        ).then(settled => {
          for (const s of settled) {
            if (s.status === 'fulfilled') results.push(s.value)
            else results.push({ ok: false, error: s.reason?.message || 'failed' })
          }
          const anyFail = results.some(r => r.ok === false)
          const payload = {
            status: anyFail ? 'NOT_READY' : 'READY',
            timestamp: new Date().toISOString(),
            checks: results
          }
          res.status(anyFail ? 503 : 200).json(payload)
        }).catch(err => {
          this.logger.error('Readiness checks execution error', { error: err?.message })
          res.status(503).json({ status: 'NOT_READY', error: 'readiness_checks_failed' })
        })
        return
      }

      res.status(200).json({ status: 'READY', timestamp: new Date().toISOString() })
    })
    
    // Liveness probe for Kubernetes/Docker
    app.get('/live', (req, res) => {
      res.status(200).json({
        status: 'ALIVE',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this[$].startTime
      })
    })
    
    this.logger.debug('Express application configured successfully', {
      security: 'helmet enabled',
      compression: 'enabled',
      rateLimit: config.enableRateLimit ? 'enabled' : 'disabled',
      cors: config.corsOptions ? 'enabled' : 'disabled',
      metrics: config.enableMetrics ? 'enabled' : 'disabled'
    })
  }

  /**
   * Initializes application middlewares with enhanced error handling
   * @private
   */
  async initializeMiddlewares(middlewares, logger) {
    const startTime = performance.now()
    
    try {
      logger.debug(`Initializing ${middlewares.length} middlewares...`)
      // Track runtime middleware instances for diagnostics/metrics
      if (!this[$].runtimeMiddlewares) {
        this[$].runtimeMiddlewares = new Map()
      }
      
      for (const [index, Middleware] of middlewares.entries()) {
        const middlewareStartTime = performance.now()
        
        if (!Middleware || typeof Middleware !== 'function') {
          throw new Error(`Middleware at index ${index} is not a valid constructor`)
        }
        
        const middleware = new Middleware({ logger })
        
        // Validate middleware interface
        if (!middleware.init || typeof middleware.init !== 'function') {
          throw new Error(`Middleware ${Middleware.name} must have an init method`)
        }
        
        if (!middleware.handler || typeof middleware.handler !== 'function') {
          throw new Error(`Middleware ${Middleware.name} must have a handler method`)
        }
        
        logger.debug(`Initializing middleware ${index + 1}/${middlewares.length}: ${Middleware.name}`)
        
        await middleware.init()
        this[$].app.use(middleware.handler())
        // Store instance by class name (last one wins if duplicates)
        try {
          const key = Middleware.name || `middleware_${index}`
          this[$].runtimeMiddlewares.set(key, middleware)
        } catch {
          // best-effort: ignore index tracking errors
        }
        
        const duration = performance.now() - middlewareStartTime
        logger.debug(`Middleware ${Middleware.name} initialized successfully`, {
          initTime: `${duration.toFixed(2)}ms`
        })
      }
      
      const totalDuration = performance.now() - startTime
      logger.info('All middlewares initialized successfully', {
        count: middlewares.length,
        totalTime: `${totalDuration.toFixed(2)}ms`
      })
    } catch (error) {
      logger.error('Middleware initialization failed', { 
        error: error.message, 
        stack: error.stack 
      })
      throw new Error(`Middleware initialization failed: ${error.message}`)
    }
  }

  // Expose runtime middleware instances for metrics providers
  getRuntimeMiddlewareInstances() {
    const out = {}
    if (this[$].runtimeMiddlewares) {
      for (const [k, v] of this[$].runtimeMiddlewares.entries()) {
        out[k] = v
      }
    }
    return out
  }
  
  /**
   * Initializes application controllers with enhanced validation
   * @private
   */
  async initializeControllers(controllers, logger) {
    const startTime = performance.now()
    
    try {
      logger.debug('Initializing controllers...')
      
      if (!controllers.routesV1 || !Array.isArray(controllers.routesV1)) {
        throw new Error('Controllers must have routesV1 array')
      }
      
      let totalControllers = 0
      
      for (const [routeIndex, route] of controllers.routesV1.entries()) {
        if (!route.version || !Array.isArray(route.routes)) {
          throw new Error(`Route at index ${routeIndex} must have version and routes array`)
        }
        
        if (!validator.isStringNotEmpty(route.version)) {
          throw new Error(`Route version at index ${routeIndex} must be a non-empty string`)
        }
        
        logger.debug(`Initializing route group: ${route.version} with ${route.routes.length} controllers`)
        
        for (const [controllerIndex, Controller] of route.routes.entries()) {
          const controllerStartTime = performance.now()
          
          if (!Controller || typeof Controller !== 'function') {
            throw new Error(`Controller at route ${routeIndex}, index ${controllerIndex} is not a valid constructor`)
          }
          
          const controller = new Controller({ logger })
          
          // Enhanced controller validation
          assert.func(controller.init, { 
            required: true, 
            message: `Controller ${Controller.name} must have init method` 
          })
          
          if (!controller.router) {
            throw new Error(`Controller ${Controller.name} must have router getter`)
          }
          
          logger.debug(`Initializing controller ${controllerIndex + 1}/${route.routes.length}: ${Controller.name}`)
          
          await controller.init()
          
          const router = controller.router
          if (!router) {
            throw new Error(`Controller ${Controller.name} router getter must return a valid router`)
          }
          
          this[$].app.use(route.version, router)
          
          const duration = performance.now() - controllerStartTime
          logger.debug(`Controller ${Controller.name} initialized successfully`, {
            route: route.version,
            initTime: `${duration.toFixed(2)}ms`
          })
          
          totalControllers++
        }
      }
      
      const totalDuration = performance.now() - startTime
      logger.info('All controllers initialized successfully', {
        totalControllers,
        routeGroups: controllers.routesV1.length,
        totalTime: `${totalDuration.toFixed(2)}ms`
      })
    } catch (error) {
      logger.error('Controller initialization failed', { 
        error: error.message, 
        stack: error.stack 
      })
      throw new Error(`Controller initialization failed: ${error.message}`)
    }
  }
  
  /**
   * Initializes error handling middleware with validation
   * @private
   */
  async initializeErrorHandling(ErrorMiddleware, logger) {
    const startTime = performance.now()
    
    try {
      logger.debug('Initializing error handling middleware...')
      
      if (!ErrorMiddleware || typeof ErrorMiddleware !== 'function') {
        throw new Error('ErrorMiddleware must be a valid constructor')
      }
      
      const errorMiddleware = new ErrorMiddleware({ logger })
      
      if (!errorMiddleware.init || typeof errorMiddleware.init !== 'function') {
        throw new Error('Error middleware must have an init method')
      }
      
      if (!errorMiddleware.handler || typeof errorMiddleware.handler !== 'function') {
        throw new Error('Error middleware must have a handler method')
      }
      
      await errorMiddleware.init()
      
      // Error handling middleware should be last
      this[$].app.use(errorMiddleware.handler())
      
      const duration = performance.now() - startTime
      logger.debug('Error handling middleware initialized successfully', {
        initTime: `${duration.toFixed(2)}ms`
      })
    } catch (error) {
      logger.error('Error middleware initialization failed', { 
        error: error.message, 
        stack: error.stack 
      })
      throw new Error(`Error middleware initialization failed: ${error.message}`)
    }
  }
  
  /**
   * Sets up additional routes like Swagger, metrics, etc.
   * @private
   */
  async setupAdditionalRoutes() {
    const config = this[$].config
    const app = this[$].app
    
    try {
      // Swagger documentation
      if (config.enableSwagger) {
        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, swaggerConfig.options))
        
        // Swagger stats (only in development)
        if (process.env.NODE_ENV !== 'production') {
          app.use(swStats.getMiddleware({ 
            swaggerSpec: swaggerDocument,
            name: 'Susanoo API',
            version: process.env.npm_package_version || '1.0.0'
          }))
        }
        
        this.logger.debug('Swagger documentation enabled at /api-docs')
      }
      
      // Metrics endpoint (if metrics enabled)
      if (config.enableMetrics) {
        app.get('/metrics', async (req, res) => {
          const status = this.getStatus()

          // Collect external provider metrics if any
          const providers = config.metricsProviders || []
          const providerResults = {}

          // Run providers concurrently; tolerate failures
          await Promise.allSettled(
            providers.map(async (p, idx) => {
              const name = (typeof p === 'function' ? (p.name || `provider_${idx}`) : (p.name || `provider_${idx}`))
              const collector = typeof p === 'function' ? p : p.collector
              try {
                const data = await Promise.resolve(collector())
                providerResults[name] = data
              } catch (err) {
                providerResults[name] = { error: err?.message || 'collection_failed' }
              }
            })
          )

          const metrics = this[$].metrics
          const metricsPayload = metrics ? {
            requestCount: metrics.requestCount,
            errorCount: metrics.errorCount,
            averageResponseTimeMs: metrics.requestCount > 0
              ? Number((metrics.totalResponseTime / metrics.requestCount).toFixed(4))
              : 0,
            lastResponseTimeMs: Number(metrics.lastResponseTime.toFixed(4)),
            totalResponseTimeMs: Number(metrics.totalResponseTime.toFixed(4)),
            lastActivityAt: metrics.lastActivity ? new Date(metrics.lastActivity).toISOString() : null,
            trackingStartTime: metrics.startTime
          } : null

          res.json({
            metrics: metricsPayload,
            system: {
              uptime: status.uptime,
              memory: status.memory,
              status: status.status,
              port: status.port,
              environment: status.environment
            },
            ...(Object.keys(providerResults).length > 0 && { providers: providerResults })
          })
        })
        
        this.logger.debug('Metrics endpoint enabled at /metrics')
      }

      // Optional Prometheus text-format metrics
      if (config.enablePrometheus && config.enableMetrics) {
        app.get('/metrics/prom', async (req, res) => {
          const status = this.getStatus()
          const lines = []
          const push = (k, v, labels) => {
            const labelStr = labels && Object.keys(labels).length > 0
              ? '{' + Object.entries(labels).map(([lk, lv]) => `${lk}="${String(lv).replace(/"/g, '\\"')}"`).join(',') + '}'
              : ''
            lines.push(`${k}${labelStr} ${v}`)
          }

          // Basic gauges
          push('app_uptime_seconds', status.uptime)
          push('app_memory_rss_mb', status.memory.rss)
          push('app_memory_heap_used_mb', status.memory.heapUsed)

          // Internal counters if available
          if (this[$].metrics) {
            const metrics = this[$].metrics
            push('http_requests_total', metrics.requestCount)
            push('http_errors_total', metrics.errorCount)
            const avg = metrics.requestCount > 0
              ? metrics.totalResponseTime / metrics.requestCount
              : 0
            push('http_response_time_avg_ms', Number(avg.toFixed(4)))
            push('http_response_time_last_ms', Number(metrics.lastResponseTime.toFixed(4)))
          }

          // Provider: dbPool, loginHandler, and middlewareMetrics (if present)
          const providers = (this[$].config.metricsProviders || [])
          for (const p of providers) {
            const name = (typeof p === 'function') ? (p.name || 'provider') : (p.name || 'provider')
            const collector = (typeof p === 'function') ? p : p.collector
            try {
              const data = await Promise.resolve(collector())
              // Specific mapping for known dbPool shape
              if (name === 'dbPool' && data && data.overall && data.pools) {
                push('db_total_connections', data.overall.totalConnections)
                push('db_active_connections', data.overall.activeConnections)
                push('db_idle_connections', data.overall.idleConnections)
                for (const [poolName, pm] of Object.entries(data.pools)) {
                  push('db_pool_connections_used', pm.connections.used, { pool: poolName })
                  push('db_pool_connections_free', pm.connections.free, { pool: poolName })
                  push('db_pool_queries_total', pm.queryCount, { pool: poolName })
                  push('db_pool_errors_total', pm.errorCount, { pool: poolName })
                  push('db_pool_slow_queries_total', pm.slowQueryCount, { pool: poolName })
                }
              } else if (name === 'loginHandler' && data) {
                // Map login handler in-memory counters
                const s = Number(data.successTotal || 0)
                const f = Number(data.failureTotal || 0)
                const pv = Number(data.pendingVerificationTotal || 0)
                const lpt = Number(data.lastProcessingTimeMs || 0)
                push('auth_login_success_total', isNaN(s) ? 0 : s)
                push('auth_login_failure_total', isNaN(f) ? 0 : f)
                push('auth_login_pending_verification_total', isNaN(pv) ? 0 : pv)
                push('auth_login_last_processing_time_ms', isNaN(lpt) ? 0 : lpt)
              } else if (name === 'middlewareMetrics' && data && typeof data === 'object') {
                // Each key is a middleware name; map common counters with labels
                for (const [mwName, mw] of Object.entries(data)) {
                  if (!mw || typeof mw !== 'object') continue
                  const labels = { middleware: mwName }
                  // Try standard counters if present
                  if ('totalRequests' in mw) push('middleware_requests_total', Number(mw.totalRequests || 0), labels)
                  if ('authenticatedRequests' in mw) push('middleware_authenticated_requests_total', Number(mw.authenticatedRequests || 0), labels)
                  if ('anonymousRequests' in mw) push('middleware_anonymous_requests_total', Number(mw.anonymousRequests || 0), labels)
                  if ('failedAttempts' in mw) push('middleware_failed_attempts_total', Number(mw.failedAttempts || 0), labels)
                  if ('cacheHits' in mw) push('middleware_cache_hits_total', Number(mw.cacheHits || 0), labels)
                  if ('cacheMisses' in mw) push('middleware_cache_misses_total', Number(mw.cacheMisses || 0), labels)
                  if ('securityEvents' in mw) push('middleware_security_events_total', Number(mw.securityEvents || 0), labels)
                  if ('blockedRequests' in mw) push('middleware_blocked_requests_total', Number(mw.blockedRequests || 0), labels)
                  if ('averageProcessingTime' in mw) push('middleware_average_processing_time_ms', Number(mw.averageProcessingTime || 0), labels)
                  if ('authenticationRate' in mw) push('middleware_authentication_rate', Number(mw.authenticationRate || 0), labels)
                  if ('cacheHitRate' in mw) push('middleware_cache_hit_rate', Number(mw.cacheHitRate || 0), labels)
                }
              }
            } catch {
              // ignore provider errors for prom export
            }
          }

          res.setHeader('Content-Type', 'text/plain; version=0.0.4')
          res.send(lines.join('\n') + '\n')
        })
        this.logger.debug('Prometheus metrics endpoint enabled at /metrics/prom')
      }
      
      // Users management page (with error handling)
      app.get('/users', (req, res) => {
        const filePath = path.join(__dirname, '../../public/users/users_managment.html')
        
        res.sendFile(filePath, (error) => {
          if (error) {
            this.logger.warn('Failed to serve users management page', { 
              error: error.message,
              filePath,
              userAgent: req.get('User-Agent'),
              ip: req.ip
            })
            
            res.status(404).json({ 
              error: 'Not Found',
              message: 'Users management page not found',
              timestamp: new Date().toISOString()
            })
          }
        })
      })
      
      this.logger.debug('Additional routes configured successfully')
    } catch (error) {
      this.logger.error('Failed to setup additional routes', { 
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }
  
  /**
   * Sets up enhanced 404 handler with metrics
   * @private
   */
  setup404Handler() {
    this[$].app.use((req, res) => {
      // Track 404 errors in metrics
      if (this[$].metrics) {
        this[$].metrics.errorCount++
      }
      
      this.logger.warn('Route not found', { 
        url: req.url, 
        method: req.method, 
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
        requestId: req.id
      })
      
      res.status(404).json({
        error: 'Not Found',
        message: `Route '${req.method} ${req.url}' not found`,
        code: 'ROUTE_NOT_FOUND_ERROR',
        timestamp: new Date().toISOString(),
        ...(req.id && { requestId: req.id })
      })
    })
  }
  
  /**
   * Setup signal handlers for graceful shutdown
   * @private
   */
  setupSignalHandlers() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGQUIT']
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        this.logger.info(`Received ${signal}, initiating graceful shutdown...`)
        await this.shutdown()
        process.exit(0)
      })
    })
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      this.logger.error('Uncaught exception, shutting down...', {
        error: error.message,
        stack: error.stack
      })
      
      await this.shutdown()
      process.exit(1)
    })
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason) => {
      this.logger.error('Unhandled promise rejection, shutting down...', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined
      })
      
      await this.shutdown()
      process.exit(1)
    })
  }
  
  /**
   * Enhanced graceful shutdown with connection draining
   */
  async shutdown() {
    if (this[$].isShuttingDown) {
      this.logger.warn('Shutdown already in progress')
      return
    }
    
    this[$].isShuttingDown = true
    const shutdownStart = performance.now()
    
    try {
      this.logger.info('Starting graceful shutdown...', {
        uptime: Date.now() - this[$].startTime,
        ...(this[$].metrics && { metrics: this[$].metrics })
      })
      
      // Stop accepting new connections
      if (this[$].server) {
        this[$].server.close()
      }
      
      // Wait for existing connections to finish
      const timeout = setTimeout(() => {
        this.logger.warn('Graceful shutdown timeout, forcing close')
        
        if (this[$].server) {
          // Force close all connections
          this[$].server.closeAllConnections?.() || this[$].server.destroy?.()
        }
      }, DEFAULT_CONFIG.timeout.shutdown)
      
      // Wait for server to close gracefully
      await new Promise((resolve, reject) => {
        if (!this[$].server) {
          return resolve()
        }
        
        this[$].server.on('close', () => {
          clearTimeout(timeout)
          resolve()
        })
        
        this[$].server.on('error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })
      
      const shutdownDuration = performance.now() - shutdownStart
      
      this.logger.info('Server shutdown completed successfully', {
        shutdownTime: `${shutdownDuration.toFixed(2)}ms`,
        uptime: Date.now() - this[$].startTime
      })
      
    } catch (error) {
      const shutdownDuration = performance.now() - shutdownStart
      
      this.logger.error('Error during server shutdown', { 
        error: error.message,
        shutdownTime: `${shutdownDuration.toFixed(2)}ms`
      })
      
      throw error
    }
  }
  
  /**
   * Force close the server (for emergency situations)
   */
  forceClose() {
    this.logger.warn('Force closing server...')
    
    if (this[$].server) {
      this[$].server.closeAllConnections?.() || this[$].server.destroy?.()
    }
    
    this[$].isShuttingDown = true
    this.logger.info('Server force closed')
  }
  
  /**
   * Get the Express app instance (for testing or advanced usage)
   * @returns {Express} Express application instance
   */
  getApp() {
    return this[$].app
  }
  
  /**
   * Get the HTTP server instance
   * @returns {http.Server} HTTP server instance
   */
  getServer() {
    return this[$].server
  }
  
  /**
   * Check if server is shutting down
   * @returns {boolean} True if shutdown is in progress
   */
  isShuttingDown() {
    return this[$].isShuttingDown
  }

  /**
   * Get server status and health information
   * @returns {Object} Server status object
   */
  getStatus() {
    const config = this[$].config
    const uptime = this[$].server ? (Date.now() - this[$].startTime) / 1000 : 0
    const memoryUsage = process.memoryUsage()
    
    return {
      status: this[$].isShuttingDown ? 'shutting-down' : (this[$].server ? 'running' : 'stopped'),
      uptime: Math.floor(uptime),
      port: config.port,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024)
      },
      connections: this[$].activeConnections || 0,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Get comprehensive performance metrics
   * @returns {Object} Performance metrics including status, request stats, and system info
   */
  getMetrics() {
    const metrics = this[$].metrics || {}
    const status = this.getStatus()
    
    const average = metrics.requestCount > 0
      ? metrics.totalResponseTime / metrics.requestCount
      : 0

    return {
      ...status,
      requestCount: metrics.requestCount || 0,
      errorCount: metrics.errorCount || 0,
      avgResponseTimeMs: Number(average.toFixed(4)),
      lastResponseTimeMs: Number((metrics.lastResponseTime || 0).toFixed(4)),
      totalResponseTimeMs: Number((metrics.totalResponseTime || 0).toFixed(4)),
      lastActivity: metrics.lastActivity ? new Date(metrics.lastActivity).toISOString() : null,
      cpuUsage: process.cpuUsage(),
      loadAverage: require('os').loadavg(),
      platform: process.platform,
      nodeVersion: process.version
    }
  }
}

module.exports = { Server }
