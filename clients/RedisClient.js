const redis = require('redis')
const { assert, AbstractLogger } = require('backend-core')
const EventEmitter = require('events')
const $ = Symbol('private scope')

/**
 * Enhanced Redis Client with modern features and comprehensive error handling
 */
class RedisClient extends EventEmitter {
  constructor(options = {}) {
    super()
    
    // Validate options
    this.validateOptions(options)
    
    // Configuration with defaults
    this.config = {
      port: options.port || 6379,
      host: options.host || 'localhost',
      password: options.password || null,
      db: options.db || 0,
      family: options.family || 4,
      connectTimeout: options.connectTimeout || 10000,
      commandTimeout: options.commandTimeout || 5000,
      retryDelayOnFailover: options.retryDelayOnFailover || 100,
      enableReadyCheck: options.enableReadyCheck !== false,
      maxRetriesPerRequest: options.maxRetriesPerRequest || 3,
      lazyConnect: options.lazyConnect || false,
      keepAlive: options.keepAlive !== false,
      maxMemoryPolicy: options.maxMemoryPolicy || null
    }
    
    this[$] = {
      client: null,
      subscriber: null,
      logger: options.logger,
      connected: false,
      connecting: false,
      connectionAttempts: 0,
      lastError: null,
      metrics: {
        commands: 0,
        errors: 0,
        connectionTime: null,
        lastCommand: null
      }
    }
    
    // Initialize client
    this.initializeClient()
  }
  
  /**
   * Validates constructor options
   */
  validateOptions(options) {
    if (options.port !== undefined) {
      assert.integer(options.port, { min: 1, max: 65535 })
    }
    if (options.host !== undefined) {
      assert.string(options.host, { notEmpty: true })
    }
    assert.instanceOf(options.logger, AbstractLogger)
  }
  
  /**
   * Initializes Redis client with enhanced configuration
   */
  initializeClient() {
    try {
      const clientOptions = {
        socket: {
          port: this.config.port,
          host: this.config.host,
          family: this.config.family,
          connectTimeout: this.config.connectTimeout,
          keepAlive: this.config.keepAlive
        },
        password: this.config.password,
        database: this.config.db,
        commandsQueueMaxLength: 1000,
        ...(this.config.maxMemoryPolicy && { 
          scripts: { 
            maxMemoryPolicy: this.config.maxMemoryPolicy 
          } 
        })
      }
      
      this[$].client = redis.createClient(clientOptions)
      this.setupEventHandlers()
      
      // Auto-connect unless lazy connect is enabled
      if (!this.config.lazyConnect) {
        this.connect()
      }
      
    } catch (error) {
      this[$].logger.error('Failed to initialize Redis client', { error: error.message })
      throw error
    }
  }
  
  /**
   * Sets up comprehensive event handlers
   */
  setupEventHandlers() {
    const client = this[$].client
    
    client.on('connect', () => {
      this[$].logger.info('Redis client connecting...', {
        host: this.config.host,
        port: this.config.port,
        attempt: this[$].connectionAttempts + 1
      })
      this[$].connecting = true
      this.emit('connecting')
    })
    
    client.on('ready', () => {
      this[$].connected = true
      this[$].connecting = false
      this[$].connectionAttempts = 0
      this[$].metrics.connectionTime = Date.now()
      
      this[$].logger.info('Redis client ready', {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db
      })
      
      this.emit('ready')
    })
    
    client.on('error', (error) => {
      this[$].connected = false
      this[$].connecting = false
      this[$].lastError = error
      this[$].metrics.errors++
      
      this[$].logger.error('Redis client error', {
        error: error.message,
        code: error.code,
        host: this.config.host,
        port: this.config.port
      })
      
      this.emit('error', error)
    })
    
    client.on('end', () => {
      this[$].connected = false
      this[$].connecting = false
      
      this[$].logger.warn('Redis connection ended', {
        host: this.config.host,
        port: this.config.port
      })
      
      this.emit('end')
    })
    
    client.on('reconnecting', () => {
      this[$].connectionAttempts++
      
      this[$].logger.info('Redis client reconnecting...', {
        attempt: this[$].connectionAttempts,
        host: this.config.host,
        port: this.config.port
      })
      
      this.emit('reconnecting', this[$].connectionAttempts)
    })
  }

  
  /**
   * Establishes connection to Redis
   */
  async connect() {
    if (this[$].connected || this[$].connecting) {
      return
    }
    
    try {
      await this[$].client.connect()
    } catch (error) {
      this[$].logger.error('Failed to connect to Redis', { error: error.message })
      throw error
    }
  }
  
  /**
   * Disconnects from Redis gracefully
   */
  async disconnect() {
    if (!this[$].client) return
    
    try {
      if (this[$].subscriber) {
        await this[$].subscriber.quit()
        this[$].subscriber = null
      }
      
      if (this[$].connected) {
        await this[$].client.quit()
      }
      
      this[$].connected = false
      this[$].logger.info('Redis client disconnected gracefully')
    } catch (error) {
      this[$].logger.error('Error during Redis disconnect', { error: error.message })
      throw error
    }
  }
  
  /**
   * Checks if client is connected
   */
  isConnected() {
    return this[$].connected && this[$].client?.isReady
  }
  
  /**
   * Gets connection status
   */
  getStatus() {
    return {
      connected: this[$].connected,
      connecting: this[$].connecting,
      connectionAttempts: this[$].connectionAttempts,
      lastError: this[$].lastError?.message || null,
      metrics: { ...this[$].metrics },
      config: {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db
      }
    }
  }
  
  /**
   * Enhanced set operation with TTL and options
   */
  async setKey(key, value, options = {}) {
    assert.string(key, { required: true, notEmpty: true })
    
    await this.ensureConnection()
    
    try {
      this.incrementMetrics('commands')
      
      const serializedValue = this.serializeValue(value)
      let result
      
      if (options.ttl) {
        result = await this[$].client.setEx(key, options.ttl, serializedValue)
      } else if (options.nx) {
        result = await this[$].client.setNX(key, serializedValue)
      } else if (options.xx) {
        result = await this[$].client.set(key, serializedValue, { XX: true })
      } else {
        result = await this[$].client.set(key, serializedValue)
      }
      
      this[$].logger.debug('Redis SET operation completed', {
        key,
        ttl: options.ttl,
        result
      })
      
      return result
    } catch (error) {
      this.handleError('setKey', error, { key, options })
      throw error
    }
  }
  
  /**
   * Enhanced get operation with deserialization
   */
  async getKey(key) {
    assert.string(key, { required: true, notEmpty: true })
    
    await this.ensureConnection()
    
    try {
      this.incrementMetrics('commands')
      
      const value = await this[$].client.get(key)
      const result = this.deserializeValue(value)
      
      this[$].logger.debug('Redis GET operation completed', {
        key,
        found: value !== null
      })
      
      return result
    } catch (error) {
      this.handleError('getKey', error, { key })
      throw error
    }
  }
  
  /**
   * Enhanced remove operation
   */
  async removeKey(key) {
    assert.string(key, { required: true, notEmpty: true })
    
    await this.ensureConnection()
    
    try {
      this.incrementMetrics('commands')
      
      const result = await this[$].client.del(key)
      
      this[$].logger.debug('Redis DEL operation completed', {
        key,
        deleted: result
      })
      
      return result
    } catch (error) {
      this.handleError('removeKey', error, { key })
      throw error
    }
  }
  
  /**
   * Enhanced pattern-based key removal
   */
  async removePatternKey(pattern) {
    assert.string(pattern, { required: true, notEmpty: true })
    
    await this.ensureConnection()
    
    try {
      this.incrementMetrics('commands')
      
      const keys = await this[$].client.keys(pattern)
      
      if (keys.length === 0) {
        this[$].logger.debug('No keys found for pattern', { pattern })
        return 0
      }
      
      const result = await this[$].client.del(keys)
      
      this[$].logger.debug('Redis pattern deletion completed', {
        pattern,
        keysFound: keys.length,
        deleted: result
      })
      
      return result
    } catch (error) {
      this.handleError('removePatternKey', error, { pattern })
      throw error
    }
  }

  /**
   * Atomic increment of a key
   */
  async incr(key) {
    assert.string(key, { required: true, notEmpty: true })
    await this.ensureConnection()
    try {
      this.incrementMetrics('commands')
      const result = await this[$].client.incr(key)
      this[$].logger.debug('Redis INCR operation completed', { key, result })
      return result
    } catch (error) {
      this.handleError('incr', error, { key })
      throw error
    }
  }

  /**
   * Set key expiration in seconds
   */
  async expire(key, seconds) {
    assert.string(key, { required: true, notEmpty: true })
    assert.integer(seconds, { required: true, min: 1 })
    await this.ensureConnection()
    try {
      this.incrementMetrics('commands')
      const result = await this[$].client.expire(key, seconds)
      this[$].logger.debug('Redis EXPIRE operation completed', { key, seconds, result })
      return result
    } catch (error) {
      this.handleError('expire', error, { key, seconds })
      throw error
    }
  }
  
  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.isConnected()) {
        return {
          status: 'unhealthy',
          error: 'Not connected to Redis',
          timestamp: new Date().toISOString()
        }
      }
      
      const start = Date.now()
      await this[$].client.ping()
      const responseTime = Date.now() - start
      
      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        connection: this.getStatus(),
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
  
  /**
   * Get Redis info
   */
  async getInfo(section = 'all') {
    await this.ensureConnection()
    
    try {
      const info = await this[$].client.info(section)
      return this.parseRedisInfo(info)
    } catch (error) {
      this.handleError('getInfo', error, { section })
      throw error
    }
  }
  
  /**
   * Ensures connection is established
   */
  async ensureConnection() {
    if (!this.isConnected()) {
      if (!this[$].connecting) {
        await this.connect()
      } else {
        // Wait for connection to complete
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'))
          }, this.config.connectTimeout)
          
          this.once('ready', () => {
            clearTimeout(timeout)
            resolve()
          })
          
          this.once('error', (error) => {
            clearTimeout(timeout)
            reject(error)
          })
        })
      }
    }
  }
  
  /**
   * Serializes value for Redis storage
   */
  serializeValue(value) {
    if (value === null || value === undefined) {
      return null
    }
    
    if (typeof value === 'string') {
      return value
    }
    
    try {
      return JSON.stringify(value)
    } catch (error) {
      this[$].logger.error('Failed to serialize value', { error: error.message })
      throw new Error('Failed to serialize value for Redis storage')
    }
  }
  
  /**
   * Deserializes value from Redis
   */
  deserializeValue(value) {
    if (value === null || value === undefined) {
      return null
    }
    
    if (typeof value !== 'string') {
      return value
    }
    
    // Try to parse as JSON, fallback to string
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  
  /**
   * Handles errors with logging and metrics
   */
  handleError(operation, error, context = {}) {
    this[$].metrics.errors++
    this[$].lastError = error
    
    this[$].logger.error(`Redis operation failed: ${operation}`, {
      error: error.message,
      code: error.code,
      operation,
      context,
      metrics: this[$].metrics
    })
  }
  
  /**
   * Increments metrics counter
   */
  incrementMetrics(metric) {
    this[$].metrics[metric]++
    this[$].metrics.lastCommand = Date.now()
  }
  
  /**
   * Parses Redis INFO response
   */
  parseRedisInfo(info) {
    const sections = {}
    let currentSection = 'general'
    
    info.split('\r\n').forEach(line => {
      if (line.startsWith('#')) {
        currentSection = line.substring(2).toLowerCase()
        sections[currentSection] = {}
      } else if (line.includes(':')) {
        const [key, value] = line.split(':')
        if (!sections[currentSection]) {
          sections[currentSection] = {}
        }
        sections[currentSection][key] = value
      }
    })
    
    return sections
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown() {
    this[$].logger.info('Shutting down Redis client...')
    
    try {
      await this.disconnect()
      this.removeAllListeners()
      
      this[$].logger.info('Redis client shutdown completed')
    } catch (error) {
      this[$].logger.error('Error during Redis shutdown', { error: error.message })
      throw error
    }
  }
}

module.exports = RedisClient
