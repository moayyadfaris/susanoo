/**
 * BaseService - Enterprise Service Layer Foundation
 * 
 * Provides core functionality for all service classes including:
 * - Error handling and wrapping
 * - Logging and monitoring
 * - Transaction management
 * - Performance tracking
 * - Event emission
 * - Dependency injection
 * 
 * @version 2.0.0
 * @author Susanoo API Team
 */

const { ErrorWrapper, errorCodes } = require('backend-core')
const { performance } = require('perf_hooks')
const { EventEmitter } = require('events')
const logger = require('../util/logger')

/**
 * Base service class providing common enterprise patterns
 */
class BaseService extends EventEmitter {
  constructor(options = {}) {
    super()
    
    this.logger = options.logger || logger
    this.config = options.config || {}
    this.metrics = {
      operationCount: 0,
      totalExecutionTime: 0,
      errors: 0,
      lastOperation: null
    }
    
    // Dependency injection container
    this.dependencies = new Map()
    
    // Performance monitoring
    this.performanceThresholds = {
      warning: 1000, // 1 second
      critical: 5000 // 5 seconds
    }
  }

  /**
   * Register a dependency for injection
   * @param {string} name - Dependency name
   * @param {*} dependency - Dependency instance
   */
  registerDependency(name, dependency) {
    this.dependencies.set(name, dependency)
  }

  /**
   * Get a registered dependency
   * @param {string} name - Dependency name
   * @returns {*} Dependency instance
   */
  getDependency(name) {
    if (!this.dependencies.has(name)) {
      throw new ErrorWrapper({
        code: 'DEPENDENCY_NOT_FOUND',
        message: `Dependency '${name}' not registered`,
        statusCode: 500
      })
    }
    return this.dependencies.get(name)
  }

  /**
   * Execute a service operation with monitoring and error handling
   * @param {string} operationName - Name of the operation
   * @param {Function} operation - Operation function to execute
   * @param {Object} context - Operation context
   * @returns {Promise<*>} Operation result
   */
  async executeOperation(operationName, operation, context = {}) {
    const startTime = performance.now()
    const operationId = this.generateOperationId()
    
    // Create operation context
    const operationContext = {
      operationId,
      operationName,
      startTime,
      service: this.constructor.name,
      ...context
    }

    this.logger.info('Service operation started', operationContext)

    try {
      // Execute the operation
      const result = await operation(operationContext)
      
      // Calculate execution time
      const executionTime = performance.now() - startTime
      
      // Update metrics
      this.updateMetrics(operationName, executionTime, true)
      
      // Performance warning
      if (executionTime > this.performanceThresholds.warning) {
        this.logger.warn('Service operation exceeded performance threshold', {
          ...operationContext,
          executionTime: `${executionTime.toFixed(2)}ms`,
          threshold: `${this.performanceThresholds.warning}ms`
        })
      }

      this.logger.info('Service operation completed', {
        ...operationContext,
        executionTime: `${executionTime.toFixed(2)}ms`,
        success: true
      })

      // Emit success event
      this.emit('operation:success', {
        operationName,
        result,
        executionTime,
        context: operationContext
      })

      return result

    } catch (error) {
      const executionTime = performance.now() - startTime
      
      // Update error metrics
      this.updateMetrics(operationName, executionTime, false)
      
      // Enhanced error logging
      this.logger.error('Service operation failed', {
        ...operationContext,
        error: error.message,
        stack: error.stack,
        executionTime: `${executionTime.toFixed(2)}ms`
      })

      // Emit error event
      this.emit('operation:error', {
        operationName,
        error,
        executionTime,
        context: operationContext
      })

      // Wrap and rethrow error
      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: `Service operation failed: ${error.message}`,
        layer: `${this.constructor.name}.${operationName}`,
        meta: {
          originalError: error.message,
          operationId,
          service: this.constructor.name
        }
      })
    }
  }

  /**
   * Update service metrics
   * @param {string} operationName - Operation name
   * @param {number} executionTime - Execution time in milliseconds
   * @param {boolean} success - Whether operation succeeded
   */
  updateMetrics(operationName, executionTime, success) {
    this.metrics.operationCount++
    this.metrics.totalExecutionTime += executionTime
    this.metrics.lastOperation = {
      name: operationName,
      executionTime,
      success,
      timestamp: new Date()
    }
    
    if (!success) {
      this.metrics.errors++
    }
  }

  /**
   * Get service performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageExecutionTime: this.metrics.operationCount > 0 
        ? this.metrics.totalExecutionTime / this.metrics.operationCount 
        : 0,
      errorRate: this.metrics.operationCount > 0 
        ? (this.metrics.errors / this.metrics.operationCount) * 100 
        : 0
    }
  }

  /**
   * Generate unique operation ID
   * @returns {string} Operation ID
   */
  generateOperationId() {
    return `${this.constructor.name.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Validate input parameters using joi or custom validation
   * @param {*} data - Data to validate
   * @param {Object} schema - Validation schema
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validateInput(data, schema, options = {}) {
    try {
      if (schema.validate) {
        // Joi schema
        const result = schema.validate(data, { 
          abortEarly: false,
          allowUnknown: options.allowUnknown || false,
          stripUnknown: options.stripUnknown || true,
          ...options
        })
        
        if (result.error) {
          throw new ErrorWrapper({
            code: 'VALIDATION_ERROR',
            message: `Validation failed: ${result.error.details.map(d => d.message).join(', ')}`,
            statusCode: 422,
            meta: {
              validationErrors: result.error.details,
              data
            }
          })
        }
        
        return result.value
      } else if (typeof schema === 'function') {
        // Custom validation function
        const isValid = schema(data)
        if (!isValid) {
          throw new ErrorWrapper({
            code: 'VALIDATION_ERROR',
            message: 'Custom validation failed',
            statusCode: 422,
            meta: { data }
          })
        }
        return data
      }
      
      return data
    } catch (error) {
      if (error instanceof ErrorWrapper) {
        throw error
      }
      
      throw new ErrorWrapper({
        code: 'VALIDATION_ERROR',
        message: `Validation error: ${error.message}`,
        statusCode: 422,
        meta: { originalError: error.message, data }
      })
    }
  }

  /**
   * Create a transaction wrapper for database operations
   * @param {Function} transactionFunction - Function to execute in transaction
   * @param {Object} options - Transaction options
   * @returns {Promise<*>} Transaction result
   */
  async withTransaction(transactionFunction, options = {}) {
    // This would be implemented with your specific database transaction logic
    // For now, it's a placeholder that can be overridden by specific services
    return await transactionFunction()
  }

  /**
   * Clean up service resources
   */
  async cleanup() {
    this.removeAllListeners()
    this.dependencies.clear()
    this.logger.info('Service cleaned up', { service: this.constructor.name })
  }

  /**
   * Health check for the service
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    return {
      service: this.constructor.name,
      status: 'healthy',
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString()
    }
  }
}

module.exports = BaseService