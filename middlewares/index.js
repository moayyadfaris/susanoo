const logger = require('../util/logger')
const { performance } = require('perf_hooks')

// Enhanced middleware registry with dependency management and optimization
class MiddlewareRegistry {
  constructor() {
    this.middlewares = new Map()
    this.initializationOrder = []
    this.dependencies = new Map()
    this.initialized = false
    this.initializationTime = 0
    
    // Performance and monitoring
    this.metrics = {
      totalMiddlewares: 0,
      initializedMiddlewares: 0,
      failedInitializations: 0,
      averageInitTime: 0,
      initializationErrors: []
    }
    
    this.registerMiddlewares()
  }

  registerMiddlewares() {
    // Register middlewares with their dependencies and priority
    const middlewareDefinitions = [
      {
        name: 'InitMiddleware',
        class: require('./InitMiddleware').InitMiddleware,
        priority: 1,
        dependencies: [],
        description: 'Request initialization and metadata tracking'
      },
      {
        name: 'ContentTypeMiddleware',
        class: require('./ContentTypeMiddleware').ContentTypeMiddleware,
        priority: 2,
        dependencies: ['InitMiddleware'],
        description: 'Content-Type header management'
      },
      {
        name: 'CheckAccessTokenMiddleware',
        class: require('./CheckAccessTokenMiddleware').CheckAccessTokenMiddleware,
        priority: 3,
        dependencies: ['InitMiddleware'],
        description: 'JWT token validation and authentication'
      },
      {
        name: 'SanitizeMiddleware',
        class: require('./SanitizeMiddleware').SanitizeMiddleware,
        priority: 4,
        dependencies: ['InitMiddleware'],
        description: 'Input sanitization and security filtering'
      },
      {
        name: 'QueryMiddleware',
        class: require('./QueryMiddleware').QueryMiddleware,
        priority: 5,
        dependencies: ['SanitizeMiddleware'],
        description: 'Query parameter processing and validation'
      },
      {
        name: 'CheckLanguageMiddleware',
        class: require('./CheckLanguageMiddleware').CheckLanguageMiddleware,
        priority: 6,
        dependencies: ['CheckAccessTokenMiddleware'],
        description: 'Language preference and localization'
      },
      {
        name: 'CacheMiddleware',
        class: require('./CacheMiddleware').CacheMiddleware,
        priority: 7,
        dependencies: ['CheckLanguageMiddleware'],
        description: 'Response caching and optimization'
      },
      {
        name: 'BasicAuthMiddleware',
        class: require('./BasicAuthMiddleware').BasicAuthMiddleware,
        priority: 8,
        dependencies: ['CheckAccessTokenMiddleware'],
        description: 'Basic HTTP authentication'
      }
    ]

    // Register each middleware
    for (const definition of middlewareDefinitions) {
      this.registerMiddleware(definition)
    }

    // Sort by priority for initialization order
    this.calculateInitializationOrder()
    
    logger.info(`Middleware registry initialized with ${this.middlewares.size} middlewares`)
  }

  registerMiddleware(definition) {
    try {
      if (!definition.class || !definition.name) {
        throw new Error(`Invalid middleware definition: ${JSON.stringify(definition)}`)
      }

      this.middlewares.set(definition.name, {
        ...definition,
        instance: null,
        initialized: false,
        initTime: 0,
        errors: []
      })

      this.dependencies.set(definition.name, definition.dependencies || [])
      this.metrics.totalMiddlewares++

      logger.debug(`Registered middleware: ${definition.name}`)
    } catch (error) {
      logger.error(`Failed to register middleware ${definition.name}:`, error)
      this.metrics.failedInitializations++
    }
  }

  calculateInitializationOrder() {
    const visited = new Set()
    const visiting = new Set()
    const order = []

    const visit = (middlewareName) => {
      if (visited.has(middlewareName)) return
      if (visiting.has(middlewareName)) {
        throw new Error(`Circular dependency detected involving ${middlewareName}`)
      }

      visiting.add(middlewareName)
      
      const dependencies = this.dependencies.get(middlewareName) || []
      for (const dependency of dependencies) {
        if (this.middlewares.has(dependency)) {
          visit(dependency)
        }
      }

      visiting.delete(middlewareName)
      visited.add(middlewareName)
      order.push(middlewareName)
    }

    // Sort middlewares by priority first, then resolve dependencies
    const sortedMiddlewares = Array.from(this.middlewares.entries())
      .sort(([,a], [,b]) => a.priority - b.priority)

    for (const [middlewareName] of sortedMiddlewares) {
      visit(middlewareName)
    }

    this.initializationOrder = order
    logger.debug('Middleware initialization order calculated:', order)
  }

  async initializeMiddlewares() {
    if (this.initialized) {
      logger.warn('Middlewares already initialized')
      return this.getMiddlewareArray()
    }

    const startTime = performance.now()
    logger.info('Starting middleware initialization...')

    for (const middlewareName of this.initializationOrder) {
      await this.initializeMiddleware(middlewareName)
    }

    this.initializationTime = performance.now() - startTime
    this.initialized = true

    // Calculate average initialization time
    this.metrics.averageInitTime = this.initializationTime / this.metrics.totalMiddlewares

    logger.info(`Middleware initialization completed in ${this.initializationTime.toFixed(2)}ms`, {
      totalMiddlewares: this.metrics.totalMiddlewares,
      initializedMiddlewares: this.metrics.initializedMiddlewares,
      failedInitializations: this.metrics.failedInitializations,
      averageInitTime: `${this.metrics.averageInitTime.toFixed(2)}ms`
    })

    return this.getMiddlewareArray()
  }

  async initializeMiddleware(middlewareName) {
    const middlewareConfig = this.middlewares.get(middlewareName)
    if (!middlewareConfig) {
      logger.error(`Middleware not found: ${middlewareName}`)
      return
    }

    if (middlewareConfig.initialized) {
      return middlewareConfig.instance
    }

    const startTime = performance.now()
    
    try {
      logger.debug(`Initializing middleware: ${middlewareName}`)

      // Check dependencies
      const dependencies = this.dependencies.get(middlewareName) || []
      for (const dependency of dependencies) {
        const depConfig = this.middlewares.get(dependency)
        if (!depConfig || !depConfig.initialized) {
          throw new Error(`Dependency not satisfied: ${dependency} for ${middlewareName}`)
        }
      }

      // Create instance
      const instance = new middlewareConfig.class()
      
      // Initialize if init method exists
      if (typeof instance.init === 'function') {
        await instance.init()
      }

      middlewareConfig.instance = instance
      middlewareConfig.initialized = true
      middlewareConfig.initTime = performance.now() - startTime

      this.metrics.initializedMiddlewares++

      logger.debug(`Middleware initialized successfully: ${middlewareName} (${middlewareConfig.initTime.toFixed(2)}ms)`)
      
      return instance
      
    } catch (error) {
      middlewareConfig.errors.push({
        error: error.message,
        timestamp: new Date().toISOString(),
        initTime: performance.now() - startTime
      })

      this.metrics.failedInitializations++
      this.metrics.initializationErrors.push({
        middleware: middlewareName,
        error: error.message,
        timestamp: new Date().toISOString()
      })

      logger.error(`Failed to initialize middleware ${middlewareName}:`, error)
      throw error
    }
  }

  getMiddlewareArray() {
    const middlewareArray = []
    
    for (const middlewareName of this.initializationOrder) {
      const config = this.middlewares.get(middlewareName)
      if (config && config.initialized && config.instance) {
        middlewareArray.push(config.class)
      } else {
        logger.warn(`Middleware not available in array: ${middlewareName}`)
      }
    }

    return middlewareArray
  }

  getMiddlewareInstances() {
    const instances = new Map()
    
    for (const [name, config] of this.middlewares) {
      if (config.initialized && config.instance) {
        instances.set(name, config.instance)
      }
    }

    return instances
  }

  getMiddlewareInfo(middlewareName) {
    const config = this.middlewares.get(middlewareName)
    if (!config) return null

    return {
      name: middlewareName,
      description: config.description,
      priority: config.priority,
      dependencies: this.dependencies.get(middlewareName) || [],
      initialized: config.initialized,
      initTime: config.initTime,
      errors: config.errors,
      hasInstance: !!config.instance
    }
  }

  getAllMiddlewareInfo() {
    const info = []
    
    for (const middlewareName of this.initializationOrder) {
      info.push(this.getMiddlewareInfo(middlewareName))
    }

    return info
  }

  getHealthStatus() {
    const healthyMiddlewares = Array.from(this.middlewares.values())
      .filter(config => config.initialized && !config.errors.length)

    const unhealthyMiddlewares = Array.from(this.middlewares.values())
      .filter(config => !config.initialized || config.errors.length > 0)

    return {
      status: unhealthyMiddlewares.length === 0 ? 'healthy' : 'degraded',
      totalMiddlewares: this.metrics.totalMiddlewares,
      healthyMiddlewares: healthyMiddlewares.length,
      unhealthyMiddlewares: unhealthyMiddlewares.length,
      initializationTime: `${this.initializationTime.toFixed(2)}ms`,
      metrics: this.metrics,
      initializationOrder: this.initializationOrder
    }
  }

  async reinitializeMiddleware(middlewareName) {
    const config = this.middlewares.get(middlewareName)
    if (!config) {
      throw new Error(`Middleware not found: ${middlewareName}`)
    }

    // Reset middleware state
    config.initialized = false
    config.instance = null
    config.errors = []

    // Reinitialize
    return this.initializeMiddleware(middlewareName)
  }

  async cleanup() {
    logger.info('Starting middleware cleanup...')
    
    for (const [middlewareName, config] of this.middlewares) {
      if (config.instance && typeof config.instance.cleanup === 'function') {
        try {
          await config.instance.cleanup()
          logger.debug(`Middleware cleaned up: ${middlewareName}`)
        } catch (error) {
          logger.error(`Failed to cleanup middleware ${middlewareName}:`, error)
        }
      }
    }

    this.initialized = false
    logger.info('Middleware cleanup completed')
  }
}

// Create global registry instance
const registry = new MiddlewareRegistry()

// Enhanced middleware initialization with error handling and monitoring
async function initializeMiddlewares() {
  try {
    return await registry.initializeMiddlewares()
  } catch (error) {
    logger.error('Critical middleware initialization failure:', error)
    throw error
  }
}

// Graceful shutdown handler
async function shutdownMiddlewares() {
  try {
    await registry.cleanup()
  } catch (error) {
    logger.error('Error during middleware shutdown:', error)
  }
}

// Health check endpoint data
function getMiddlewareHealth() {
  return registry.getHealthStatus()
}

// Debugging and monitoring utilities
function getMiddlewareRegistry() {
  return registry
}

// Legacy export for backward compatibility (synchronous)
const middlewareClasses = [
  require('./InitMiddleware').InitMiddleware,
  require('./ContentTypeMiddleware').ContentTypeMiddleware,
  require('./CheckAccessTokenMiddleware').CheckAccessTokenMiddleware,
  require('./SanitizeMiddleware').SanitizeMiddleware,
  require('./QueryMiddleware').QueryMiddleware,
  require('./CheckLanguageMiddleware').CheckLanguageMiddleware,
  require('./CacheMiddleware').CacheMiddleware,
  require('./BasicAuthMiddleware').BasicAuthMiddleware
]

// Enhanced exports
module.exports = middlewareClasses

// Enhanced module exports for new features
module.exports.initializeMiddlewares = initializeMiddlewares
module.exports.shutdownMiddlewares = shutdownMiddlewares
module.exports.getMiddlewareHealth = getMiddlewareHealth
module.exports.getMiddlewareRegistry = getMiddlewareRegistry
module.exports.MiddlewareRegistry = MiddlewareRegistry

// Auto-initialize middlewares disabled - let server handle initialization
// if (process.env.NODE_ENV !== 'test') {
//   // Initialize middlewares asynchronously without blocking module loading
//   setImmediate(async () => {
//     try {
//       await initializeMiddlewares()
//     } catch (error) {
//       logger.error('Failed to auto-initialize middlewares:', error)
//     }
//   })
// }

// Graceful shutdown handling
process.on('SIGTERM', shutdownMiddlewares)
process.on('SIGINT', shutdownMiddlewares)
process.on('beforeExit', shutdownMiddlewares)
