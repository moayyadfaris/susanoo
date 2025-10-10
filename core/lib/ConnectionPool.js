const { Logger } = require('./Logger')
const knex = require('knex')

// Create logger instance for enterprise connection pool
const logger = new Logger({
  appName: 'SusanooAPI-EnterprisePool',
  raw: process.env.NODE_ENV !== 'development'
})

/**
 * ConnectionPool - Advanced database connection management
 * 
 * Features:
 * - Connection pooling with health monitoring
 * - Read/write connection splitting
 * - Connection failover and retry logic
 * - Performance monitoring and metrics
 * - Connection leak detection
 * - Graceful shutdown handling
 * 
 * @version 1.0.0
 */
class ConnectionPool {
  constructor(config = {}) {
    this.config = {
      // Primary (write) database
      primary: {
        host: config.primary?.host || process.env.DB_HOST || 'localhost',
        port: config.primary?.port || process.env.DB_PORT || 5432,
        database: config.primary?.database || process.env.DB_NAME,
        user: config.primary?.user || process.env.DB_USER,
        password: config.primary?.password || process.env.DB_PASSWORD,
        ...config.primary
      },
      
      // Read replicas
      replicas: config.replicas || [],
      
      // Pool configuration
      pool: {
        min: config.pool?.min || 2,
        max: config.pool?.max || 20,
        acquireTimeoutMillis: config.pool?.acquireTimeoutMillis || 30000,
        createTimeoutMillis: config.pool?.createTimeoutMillis || 30000,
        destroyTimeoutMillis: config.pool?.destroyTimeoutMillis || 5000,
        idleTimeoutMillis: config.pool?.idleTimeoutMillis || 30000,
        reapIntervalMillis: config.pool?.reapIntervalMillis || 1000,
        createRetryIntervalMillis: config.pool?.createRetryIntervalMillis || 200,
        afterCreate: this._afterCreate.bind(this),
        ...config.pool
      },
      
      // Health check configuration
      healthCheck: {
        enabled: config.healthCheck?.enabled !== false,
        interval: config.healthCheck?.interval || 30000, // 30 seconds
        timeout: config.healthCheck?.timeout || 5000, // 5 seconds
        retryCount: config.healthCheck?.retryCount || 3,
        ...config.healthCheck
      },
      
      // Performance monitoring
      monitoring: {
        enabled: config.monitoring?.enabled !== false,
        slowQueryThreshold: config.monitoring?.slowQueryThreshold || 1000, // 1 second
        logLevel: config.monitoring?.logLevel || 'info',
        ...config.monitoring
      }
    }
    
    this.pools = new Map()
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      connectionErrors: 0,
      slowQueries: 0,
      queryCount: 0,
      lastHealthCheck: null,
      healthStatus: 'unknown'
    }
    
    this.healthCheckInterval = null
    this.isShuttingDown = false
  }

  /**
   * Initialize connection pools
   */
  async initialize() {
    try {
      logger.info('Initializing database connection pools...')
      
      // Create primary pool
      await this._createPool('primary', this.config.primary)
      
      // Create replica pools
      for (let i = 0; i < this.config.replicas.length; i++) {
        await this._createPool(`replica_${i}`, this.config.replicas[i])
      }
      
      // Start health checks
      if (this.config.healthCheck.enabled) {
        this._startHealthChecks()
      }
      
      // Start metrics collection
      if (this.config.monitoring.enabled) {
        this._startMetricsCollection()
      }
      
      logger.info('Database connection pools initialized successfully', {
        primaryPool: 'ready',
        replicaPools: this.config.replicas.length,
        totalPools: this.pools.size
      })
      
    } catch (error) {
      logger.error('Failed to initialize database connection pools', { error: error.message })
      throw error
    }
  }

  /**
   * Create a connection pool
   */
  async _createPool(name, config) {
    const knex = require('knex')({
      client: 'postgresql',
      connection: config,
      pool: this.config.pool,
      migrations: {
        directory: './database/migrations'
      },
      seeds: {
        directory: './database/seeds'
      }
    })
    
    // Test connection
    await knex.raw('SELECT 1')
    
    this.pools.set(name, {
      knex,
      config,
      isHealthy: true,
      lastHealthCheck: new Date(),
      metrics: {
        queryCount: 0,
        errorCount: 0,
        slowQueryCount: 0,
        avgResponseTime: 0
      }
    })
    
    logger.info(`Database pool created: ${name}`, {
      host: config.host,
      database: config.database,
      poolSize: `${this.config.pool.min}-${this.config.pool.max}`
    })
  }

  /**
   * Get connection for write operations (always use primary)
   */
  getWriteConnection() {
    const primary = this.pools.get('primary')
    if (!primary || !primary.isHealthy) {
      throw new Error('Primary database connection is not available')
    }
    
    return this._wrapConnection(primary.knex, 'primary')
  }

  /**
   * Get connection for read operations (use replica if available)
   */
  getReadConnection() {
    // Try to get a healthy replica first
    const healthyReplicas = []
    
    for (const [name, pool] of this.pools.entries()) {
      if (name.startsWith('replica_') && pool.isHealthy) {
        healthyReplicas.push({ name, pool })
      }
    }
    
    // Use random replica if available
    if (healthyReplicas.length > 0) {
      const randomReplica = healthyReplicas[Math.floor(Math.random() * healthyReplicas.length)]
      return this._wrapConnection(randomReplica.pool.knex, randomReplica.name)
    }
    
    // Fallback to primary
    return this.getWriteConnection()
  }

  /**
   * Get connection with specific preference
   */
  getConnection(preference = 'read') {
    if (preference === 'write') {
      return this.getWriteConnection()
    } else {
      return this.getReadConnection()
    }
  }

  /**
   * Wrap connection with monitoring
   */
  _wrapConnection(knex, poolName) {
    const pool = this.pools.get(poolName)
    
    // Create proxy to monitor queries
    const wrappedKnex = new Proxy(knex, {
      get: (target, prop) => {
        if (typeof target[prop] === 'function') {
          return (...args) => {
            const result = target[prop](...args)
            
            // Monitor query execution if it returns a promise
            if (result && typeof result.then === 'function') {
              return this._monitorQuery(result, poolName, pool)
            }
            
            return result
          }
        }
        return target[prop]
      }
    })
    
    return wrappedKnex
  }

  /**
   * Monitor query execution
   */
  async _monitorQuery(queryPromise, poolName, pool) {
    const startTime = Date.now()
    
    try {
      const result = await queryPromise
      const duration = Date.now() - startTime
      
      // Update metrics
      pool.metrics.queryCount++
      this.metrics.queryCount++
      
      // Calculate average response time
      pool.metrics.avgResponseTime = 
        (pool.metrics.avgResponseTime + duration) / 2
      
      // Check for slow queries
      if (duration > this.config.monitoring.slowQueryThreshold) {
        pool.metrics.slowQueryCount++
        this.metrics.slowQueries++
        
        logger.warn('Slow query detected', {
          pool: poolName,
          duration,
          threshold: this.config.monitoring.slowQueryThreshold
        })
      }
      
      return result
      
    } catch (error) {
      pool.metrics.errorCount++
      this.metrics.connectionErrors++
      
      logger.error('Database query error', {
        pool: poolName,
        error: error.message,
        duration: Date.now() - startTime
      })
      
      throw error
    }
  }

  /**
   * Start health checks
   */
  _startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) return
      
      await this._performHealthChecks()
    }, this.config.healthCheck.interval)
    
    logger.info('Database health checks started', {
      interval: this.config.healthCheck.interval
    })
  }

  /**
   * Perform health checks on all pools
   */
  async _performHealthChecks() {
    const healthResults = []
    
    for (const [name, pool] of this.pools.entries()) {
      try {
        const startTime = Date.now()
        
        // Simple health check query with timeout
        await Promise.race([
          pool.knex.raw('SELECT 1 as health_check'),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 
              this.config.healthCheck.timeout)
          )
        ])
        
        const responseTime = Date.now() - startTime
        
        pool.isHealthy = true
        pool.lastHealthCheck = new Date()
        
        healthResults.push({
          pool: name,
          status: 'healthy',
          responseTime
        })
        
      } catch (error) {
        pool.isHealthy = false
        pool.lastHealthCheck = new Date()
        
        healthResults.push({
          pool: name,
          status: 'unhealthy',
          error: error.message
        })
        
        logger.error(`Health check failed for pool: ${name}`, {
          error: error.message
        })
      }
    }
    
    // Update overall health status
    const healthyPools = healthResults.filter(r => r.status === 'healthy').length
    this.metrics.healthStatus = healthyPools > 0 ? 'healthy' : 'unhealthy'
    this.metrics.lastHealthCheck = new Date()
    
    if (this.config.monitoring.logLevel === 'debug') {
      logger.debug('Health check completed', { results: healthResults })
    }
  }

  /**
   * Start metrics collection
   */
  _startMetricsCollection() {
    setInterval(() => {
      if (this.isShuttingDown) return
      
      this._updateConnectionMetrics()
    }, 10000) // Update every 10 seconds
  }

  /**
   * Update connection metrics
   */
  _updateConnectionMetrics() {
    let totalConnections = 0
    let activeConnections = 0
    let idleConnections = 0
    
    for (const [name, pool] of this.pools.entries()) {
      try {
        const poolStats = pool.knex.client.pool
        
        if (poolStats) {
          totalConnections += (poolStats.numUsed() || 0) + (poolStats.numFree() || 0)
          activeConnections += poolStats.numUsed() || 0
          idleConnections += poolStats.numFree() || 0
        }
      } catch (error) {
        logger.warn(`Failed to get pool stats for ${name}`, { error: error.message })
      }
    }
    
    this.metrics.totalConnections = totalConnections
    this.metrics.activeConnections = activeConnections
    this.metrics.idleConnections = idleConnections
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    this._updateConnectionMetrics()
    
    const poolMetrics = {}
    for (const [name, pool] of this.pools.entries()) {
      poolMetrics[name] = {
        isHealthy: pool.isHealthy,
        lastHealthCheck: pool.lastHealthCheck,
        ...pool.metrics
      }
    }
    
    return {
      overall: { ...this.metrics },
      pools: poolMetrics
    }
  }

  /**
   * Test all connections
   */
  async testConnections() {
    const results = {}
    
    for (const [name, pool] of this.pools.entries()) {
      try {
        const startTime = Date.now()
        await pool.knex.raw('SELECT 1 as test')
        const responseTime = Date.now() - startTime
        
        results[name] = {
          status: 'success',
          responseTime
        }
      } catch (error) {
        results[name] = {
          status: 'error',
          error: error.message
        }
      }
    }
    
    return results
  }

  /**
   * Connection lifecycle hooks
   */
  async _afterCreate(conn, done) {
    try {
      // Set connection parameters
      await conn.query('SET timezone = "UTC"')
      await conn.query('SET statement_timeout = 30000') // 30 seconds
      
      logger.debug('Database connection created and configured')
      done(null, conn)
    } catch (error) {
      logger.error('Failed to configure database connection', { error: error.message })
      done(error, conn)
    }
  }

  async _beforeDestroy(conn, done) {
    try {
      logger.debug('Database connection being destroyed')
      done()
    } catch (error) {
      logger.error('Error during connection destruction', { error: error.message })
      done()
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.isShuttingDown = true
    
    logger.info('Shutting down database connection pools...')
    
    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }
    
    // Close all pools
    const shutdownPromises = []
    
    for (const [name, pool] of this.pools.entries()) {
      shutdownPromises.push(
        pool.knex.destroy().catch(error => {
          logger.error(`Error closing pool ${name}`, { error: error.message })
        })
      )
    }
    
    await Promise.allSettled(shutdownPromises)
    
    this.pools.clear()
    
    logger.info('Database connection pools shut down successfully')
  }
}

module.exports = ConnectionPool