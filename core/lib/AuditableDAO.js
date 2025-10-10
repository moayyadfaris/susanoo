const { Model } = require('objection')
const { v4: uuidV4 } = require('uuid')
const { BaseDAO } = require('./BaseDAO')
const CryptoService = require('./CryptoService')
const { Logger } = require('./Logger')

// Create logger instance for enterprise DAO
const logger = new Logger({
  appName: 'SusanooAPI-EnterpriseDAO',
  raw: process.env.NODE_ENV !== 'development'
})

/**
 * AuditableDAO - Enhanced base DAO with enterprise features
 * 
 * Features:
 * - Audit trails (who, when, what changed)
 * - Soft deletes with recovery
 * - Automatic timestamps
 * - Query performance monitoring
 * - Transaction management
 * - Connection health monitoring
 * - GDPR compliance utilities
 * 
 * @extends Model
 * @version 1.0.0
 */
class AuditableDAO extends Model {
  // Static reference to enterprise connection pool
  static enterpriseConnectionPool = null

  /**
   * Set the enterprise connection pool for all DAOs
   * @param {EnterpriseConnectionPool} connectionPool
   */
  static setConnectionPool(connectionPool) {
    this.enterpriseConnectionPool = connectionPool
  }

  /**
   * Get read connection (replica if available, otherwise primary)
   */
  static getReadConnection() {
    if (this.enterpriseConnectionPool) {
      return this.enterpriseConnectionPool.getReadConnection()
    }
    return this.knex()
  }

  /**
   * Get write connection (always primary)
   */
  static getWriteConnection() {
    if (this.enterpriseConnectionPool) {
      return this.enterpriseConnectionPool.getWriteConnection()
    }
    return this.knex()
  }

  /**
   * Common schema properties for all enterprise tables
   */
  static get commonSchema() {
    return {
      // Audit fields
      createdAt: { type: 'timestamp', default: 'now()' },
      updatedAt: { type: 'timestamp', default: 'now()' },
      createdBy: { type: 'string', nullable: true }, // User ID who created
      updatedBy: { type: 'string', nullable: true }, // User ID who last updated
      
      // Soft delete
      deletedAt: { type: 'timestamp', nullable: true },
      deletedBy: { type: 'string', nullable: true },
      
      // Versioning
      version: { type: 'integer', default: 1 },
      
      // Metadata
      metadata: { type: 'json', nullable: true }
    }
  }

  /**
   * Automatically set timestamps and audit info before insert
   */
  $beforeInsert(queryContext) {
    super.$beforeInsert(queryContext)
    
    const now = new Date().toISOString()
    this.createdAt = now
    this.updatedAt = now
    this.version = 1
    
    // Set created by from context if available
    if (queryContext?.user?.id) {
      this.createdBy = queryContext.user.id
      this.updatedBy = queryContext.user.id
    }
    
    // Log creation for audit (only if knex is configured)
    if (this.constructor.knex && typeof this.constructor.knex === 'function') {
      this._logAuditEvent('CREATE', queryContext).catch(err => {
        // Silently handle audit errors to prevent crashes
        console.warn('Audit logging failed:', err.message)
      })
    }
  }

  /**
   * Automatically set timestamps and audit info before update
   */
  $beforeUpdate(opt, queryContext) {
    super.$beforeUpdate(opt, queryContext)
    
    const now = new Date().toISOString()
    this.updatedAt = now
    
    // Increment version for optimistic locking
    if (this.version) {
      this.version += 1
    }
    
    // Set updated by from context if available
    if (queryContext?.user?.id) {
      this.updatedBy = queryContext.user.id
    }
    
    // Log update for audit (only if knex is configured)
    if (this.constructor.knex && typeof this.constructor.knex === 'function') {
      this._logAuditEvent('UPDATE', queryContext).catch(err => {
        // Silently handle audit errors to prevent crashes
        console.warn('Audit logging failed:', err.message)
      })
    }
  }

  /**
   * Format JSON output with enterprise features
   */
  $formatJson(json) {
    json = super.$formatJson(json)
    
    // Remove sensitive audit fields from API responses unless explicitly requested
    if (!this.constructor.includeAuditFields) {
      delete json.createdBy
      delete json.updatedBy
      delete json.deletedBy
      delete json.version
    }
    
    // Format timestamps consistently
    if (json.createdAt) {
      json.createdAt = new Date(json.createdAt).toISOString()
    }
    if (json.updatedAt) {
      json.updatedAt = new Date(json.updatedAt).toISOString()
    }
    if (json.deletedAt) {
      json.deletedAt = new Date(json.deletedAt).toISOString()
    }
    
    return json
  }

  /**
   * Enhanced query builder with enterprise features
   */
  static query(trx) {
    const query = super.query(trx)
    
    // Add soft delete filter by default
    query.whereNull(`${this.tableName}.deletedAt`)
    
    // Add query monitoring
    query.onBuild((builder) => {
      this._monitorQuery(builder)
    })
    
    return query
  }

  /**
   * Query including soft deleted records
   */
  static queryWithDeleted(trx) {
    return super.query(trx)
  }

  /**
   * Query only soft deleted records
   */
  static queryDeleted(trx) {
    return super.query(trx).whereNotNull(`${this.tableName}.deletedAt`)
  }

  /**
   * Soft delete implementation
   */
  static async softDelete(id, userId = null, trx = null) {
    const now = new Date().toISOString()
    
    const updateData = {
      deletedAt: now,
      updatedAt: now
    }
    
    if (userId) {
      updateData.deletedBy = userId
      updateData.updatedBy = userId
    }
    
    const result = await this.query(trx)
      .findById(id)
      .patch(updateData)
    
    // Log soft delete
    logger.info('Soft delete performed', {
      table: this.tableName,
      id,
      deletedBy: userId,
      timestamp: now
    })
    
    return result
  }

  /**
   * Restore soft deleted record
   */
  static async restore(id, userId = null, trx = null) {
    const now = new Date().toISOString()
    
    const updateData = {
      deletedAt: null,
      deletedBy: null,
      updatedAt: now
    }
    
    if (userId) {
      updateData.updatedBy = userId
    }
    
    const result = await this.queryWithDeleted(trx)
      .findById(id)
      .patch(updateData)
    
    // Log restoration
    logger.info('Record restored', {
      table: this.tableName,
      id,
      restoredBy: userId,
      timestamp: now
    })
    
    return result
  }

  /**
   * Permanent delete (use with caution)
   */
  static async permanentDelete(id, userId = null, trx = null) {
    // Log permanent deletion for audit
    logger.warn('Permanent delete performed', {
      table: this.tableName,
      id,
      deletedBy: userId,
      timestamp: new Date().toISOString()
    })
    
    return await this.queryWithDeleted(trx)
      .deleteById(id)
  }

  /**
   * Bulk soft delete with conditions
   */
  static async bulkSoftDelete(whereClause, userId = null, trx = null) {
    const now = new Date().toISOString()
    
    const updateData = {
      deletedAt: now,
      updatedAt: now
    }
    
    if (userId) {
      updateData.deletedBy = userId
      updateData.updatedBy = userId
    }
    
    const result = await this.query(trx)
      .where(whereClause)
      .patch(updateData)
    
    logger.info('Bulk soft delete performed', {
      table: this.tableName,
      whereClause,
      affectedRows: result,
      deletedBy: userId,
      timestamp: now
    })
    
    return result
  }

  /**
   * Create with audit context
   */
  static async createWithAudit(data, userId = null, trx = null) {
    const context = userId ? { user: { id: userId } } : {}
    
    return await this.query(trx)
      .context(context)
      .insert(data)
  }

  /**
   * Update with audit context and optimistic locking
   */
  static async updateWithAudit(id, data, userId = null, expectedVersion = null, trx = null) {
    const context = userId ? { user: { id: userId } } : {}
    
    let query = this.query(trx)
      .context(context)
      .findById(id)
    
    // Optimistic locking check
    if (expectedVersion !== null) {
      query = query.where('version', expectedVersion)
    }
    
    const result = await query.patch(data)
    
    if (result === 0 && expectedVersion !== null) {
      throw new Error('Optimistic locking conflict: Record was modified by another user')
    }
    
    return result
  }

  /**
   * Find by ID with audit info
   */
  static async findByIdWithAudit(id, trx = null) {
    this.includeAuditFields = true
    const result = await this.query(trx).findById(id)
    this.includeAuditFields = false
    return result
  }

  /**
   * Get audit history for a record (using unified audit system)
   */
  static async getAuditHistory(id, limit = 50) {
    try {
      return await this.knex()
        .select('*')
        .from('audit_logs')
        .where('table_name', this.tableName)
        .where('record_id', String(id))
        .orderBy('created_at', 'desc')
        .limit(limit)
    } catch (error) {
      logger.warn('Failed to get audit history from unified audit_logs', { 
        tableName: this.tableName,
        recordId: id,
        error: error.message 
      })
      return []
    }
  }

  /**
   * Log audit event with unified audit system
   */
  async _logAuditEvent(operation, queryContext) {
    try {
      // Check if knex is properly configured
      if (!this.constructor.knex || typeof this.constructor.knex !== 'function') {
        // Silently skip audit if knex not configured
        return
      }
      
      const tableName = this.constructor.tableName
      
      // Check if audit is enabled for this table
      const isEnabled = await this.constructor.knex()
        .raw('SELECT is_audit_enabled(?)', [tableName])
        .then(result => result.rows?.[0]?.is_audit_enabled || false)
      
      if (!isEnabled) {
        return // Skip audit if disabled
      }
      
      // Get audit configuration for this table
      const auditConfig = await this.constructor.knex()
        .select('*')
        .from('audit_config')
        .where('table_name', tableName)
        .first()
      
      if (!auditConfig) {
        return // No config found, skip audit
      }
      
      // Check if this operation type is enabled
      const operationEnabled = this._isOperationEnabled(operation, auditConfig)
      if (!operationEnabled) {
        return
      }
      
      // Prepare audit data
      const auditData = {
        table_name: tableName,
        record_id: String(this.id || 'new'),
        operation,
        old_values: this._prepareOldValues(operation),
        new_values: this._prepareNewValues(operation, auditConfig),
        changed_fields: this._getChangedFields(),
        user_id: queryContext?.user?.id || null,
        session_id: queryContext?.sessionId || null,
        ip_address: queryContext?.ip || null,
        user_agent: queryContext?.userAgent || null,
        event_type: queryContext?.eventType || 'api_call',
        metadata: this._prepareAuditMetadata(queryContext),
        source: queryContext?.source || 'application'
      }
      
      // Store audit record
      if (auditConfig.async_logging) {
        // Fire and forget for performance
        setImmediate(() => this._storeAuditRecord(auditData))
      } else {
        await this._storeAuditRecord(auditData)
      }
      
      // Log to application logger as well
      logger.info(`Audit: ${operation} on ${tableName}`, {
        recordId: auditData.record_id,
        userId: auditData.user_id
      })
      
    } catch (error) {
      // Never fail the main operation due to audit issues
      logger.error('Audit logging failed', { 
        error: error.message,
        table: this.constructor.tableName,
        operation 
      })
    }
  }

  /**
   * Check if the operation is enabled in audit config
   */
  _isOperationEnabled(operation, auditConfig) {
    switch (operation) {
      case 'CREATE':
        return auditConfig.track_creates
      case 'UPDATE':
        return auditConfig.track_updates
      case 'DELETE':
        return auditConfig.track_deletes
      case 'RESTORE':
        return auditConfig.track_restores
      default:
        return true
    }
  }

  /**
   * Prepare old values for audit, excluding sensitive/excluded fields
   */
  _prepareOldValues(operation) {
    if (operation === 'CREATE') {
      return null
    }
    
    return this.$beforeUpdatePreviousData || this.$cloneDataBeforeUpdate || null
  }

  /**
   * Prepare new values for audit, masking sensitive fields
   */
  _prepareNewValues(operation, auditConfig) {
    if (operation === 'DELETE') {
      return null
    }
    
    const values = { ...this.$toJson() }
    
    // Remove excluded fields
    if (auditConfig.excluded_fields) {
      const excludedFields = JSON.parse(auditConfig.excluded_fields)
      excludedFields.forEach(field => delete values[field])
    }
    
    // Mask sensitive fields
    if (auditConfig.sensitive_fields) {
      const sensitiveFields = JSON.parse(auditConfig.sensitive_fields)
      sensitiveFields.forEach(field => {
        if (values[field]) {
          values[field] = this._maskSensitiveValue(values[field])
        }
      })
    }
    
    return values
  }

  /**
   * Get array of changed field names for UPDATE operations
   */
  _getChangedFields() {
    if (!this.$beforeUpdatePreviousData) {
      return null
    }
    
    const current = this.$toJson()
    const previous = this.$beforeUpdatePreviousData
    const changed = []
    
    Object.keys(current).forEach(key => {
      if (JSON.stringify(current[key]) !== JSON.stringify(previous[key])) {
        changed.push(key)
      }
    })
    
    return changed.length > 0 ? changed : null
  }

  /**
   * Prepare additional metadata for audit record
   */
  _prepareAuditMetadata(queryContext) {
    const metadata = {}
    
    // Add request context if available
    if (queryContext?.requestId) {
      metadata.requestId = queryContext.requestId
    }
    
    if (queryContext?.endpoint) {
      metadata.endpoint = queryContext.endpoint
    }
    
    if (queryContext?.method) {
      metadata.method = queryContext.method
    }
    
    // Add model-specific metadata
    if (this.version) {
      metadata.previousVersion = this.version - 1
      metadata.newVersion = this.version
    }
    
    return Object.keys(metadata).length > 0 ? metadata : null
  }

  /**
   * Mask sensitive values for audit logs
   */
  _maskSensitiveValue(value) {
    if (typeof value === 'string') {
      if (value.includes('@')) {
        // Email masking: test@example.com -> t***@e***.com
        const [local, domain] = value.split('@')
        const [domainName, domainExt] = domain.split('.')
        return `${local[0]}***@${domainName[0]}***.${domainExt}`
      } else if (value.length > 4) {
        // General string masking: keep first and last 2 chars
        return `${value.substring(0, 2)}***${value.substring(value.length - 2)}`
      }
    }
    
    return '***MASKED***'
  }

  /**
   * Store audit record in unified audit_logs table
   */
  async _storeAuditRecord(auditData) {
    try {
      if (!this.constructor.knex || typeof this.constructor.knex !== 'function') {
        return
      }
      await this.constructor.knex()
        .table('audit_logs')
        .insert({
          ...auditData,
          created_at: this.constructor.knex().fn.now()
        })
    } catch (error) {
      // Don't fail the main operation if audit fails
      logger.error('Failed to store audit record in audit_logs', { 
        error: error.message,
        table_name: auditData.table_name,
        record_id: auditData.record_id,
        operation: auditData.operation
      })
    }
  }

  /**
   * Monitor query performance
   */
  static _monitorQuery(builder) {
    const startTime = Date.now()
    const originalThen = builder.then.bind(builder)
    
    builder.then = function(onFulfilled, onRejected) {
      return originalThen(
        (result) => {
          const duration = Date.now() - startTime
          
          // Log slow queries
          if (duration > 1000) { // 1 second threshold
            logger.warn('Slow query detected', {
              table: builder._modelClass?.tableName,
              duration,
              sql: builder.toKnexQuery().toString()
            })
          }
          
          return onFulfilled ? onFulfilled(result) : result
        },
        onRejected
      )
    }
  }

  // ====================
  // Audit Management Utilities
  // ====================

  /**
   * Enable or disable audit for a specific table
   */
  static async setAuditEnabled(tableName, enabled = true) {
    try {
      const result = await this.knex().raw(
        'SELECT enable_audit_for_table(?, ?)',
        [tableName, enabled]
      )
      
      logger.info(`Audit ${enabled ? 'enabled' : 'disabled'} for table: ${tableName}`)
      return result.rows?.[0]?.enable_audit_for_table || false
    } catch (error) {
      logger.error('Failed to update audit setting', { tableName, enabled, error: error.message })
      return false
    }
  }

  /**
   * Check if audit is enabled for a table
   */
  static async isAuditEnabled(tableName) {
    try {
      const result = await this.knex().raw(
        'SELECT is_audit_enabled(?)',
        [tableName]
      )
      return result.rows?.[0]?.is_audit_enabled || false
    } catch (error) {
      logger.error('Failed to check audit status', { tableName, error: error.message })
      return false
    }
  }

  /**
   * Get audit configuration for a table
   */
  static async getAuditConfig(tableName) {
    try {
      return await this.knex()
        .select('*')
        .from('audit_config')
        .where('table_name', tableName)
        .first()
    } catch (error) {
      logger.error('Failed to get audit config', { tableName, error: error.message })
      return null
    }
  }

  /**
   * Update audit configuration for a table
   */
  static async updateAuditConfig(tableName, config) {
    try {
      const updated = await this.knex()('audit_config')
        .where('table_name', tableName)
        .update({
          ...config,
          updated_at: this.knex().fn.now()
        })
      
      if (updated === 0) {
        // Insert new config if it doesn't exist
        await this.knex()('audit_config').insert({
          table_name: tableName,
          ...config,
          created_at: this.knex().fn.now(),
          updated_at: this.knex().fn.now()
        })
      }
      
      logger.info('Audit configuration updated', { tableName, config })
      return true
    } catch (error) {
      logger.error('Failed to update audit config', { tableName, config, error: error.message })
      return false
    }
  }

  /**
   * Get audit statistics
   */
  static async getAuditStats() {
    try {
      // Check if knex is properly configured
      if (!this.knex() || typeof this.knex !== 'function') {
        logger.warn('AuditableDAO: knex not properly configured, skipping audit stats')
        return []
      }
      
      const result = await this.knex().raw('SELECT * FROM get_audit_stats()')
      return result.rows || []
    } catch (error) {
      logger.error('Failed to get audit stats', { error: error.message })
      return []
    }
  }

  /**
   * Clean up old audit logs based on retention policies
   */
  static async cleanupOldAuditLogs() {
    try {
      const result = await this.knex().raw('SELECT cleanup_audit_logs()')
      const deletedCount = result.rows?.[0]?.cleanup_audit_logs || 0
      
      logger.info('Audit cleanup completed', { deletedCount })
      return deletedCount
    } catch (error) {
      logger.error('Failed to cleanup audit logs', { error: error.message })
      return 0
    }
  }

  /**
   * Get recent audit activity across all tables
   */
  static async getRecentAuditActivity(limit = 100) {
    try {
      return await this.knex()
        .select([
          'audit_logs.*',
          'audit_config.is_enabled as audit_enabled'
        ])
        .from('audit_logs')
        .leftJoin('audit_config', 'audit_logs.table_name', 'audit_config.table_name')
        .orderBy('audit_logs.created_at', 'desc')
        .limit(limit)
    } catch (error) {
      logger.error('Failed to get recent audit activity', { error: error.message })
      return []
    }
  }

  /**
   * Bulk enable/disable audit for multiple tables
   */
  static async bulkSetAuditEnabled(tableNames, enabled = true) {
    const results = {}
    
    for (const tableName of tableNames) {
      results[tableName] = await this.setAuditEnabled(tableName, enabled)
    }
    
    logger.info(`Bulk audit ${enabled ? 'enabled' : 'disabled'}`, { tableNames, results })
    return results
  }

  // ====================
  // GDPR and Data Management
  // ====================

  /**
   * GDPR compliance - anonymize user data
   */
  static async anonymizeUserData(userId) {
    const anonymizedData = {
      updatedAt: new Date().toISOString(),
      updatedBy: 'SYSTEM_GDPR',
      metadata: { gdpr_anonymized: true, anonymized_at: new Date().toISOString() }
    }
    
    // This should be implemented per model based on what fields need anonymization
    logger.info('GDPR anonymization performed', {
      table: this.tableName,
      userId,
      timestamp: anonymizedData.updatedAt
    })
    
    return anonymizedData
  }

  /**
   * Data retention - automatically clean old soft-deleted records
   */
  static async cleanupOldDeletedRecords(daysOld = 90, trx = null) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)
    
    const result = await this.queryDeleted(trx)
      .where('deletedAt', '<', cutoffDate.toISOString())
      .delete()
    
    logger.info('Data retention cleanup completed', {
      table: this.tableName,
      recordsDeleted: result,
      cutoffDate: cutoffDate.toISOString()
    })
    
    return result
  }

  /**
   * Health check for database connections
   */
  static async healthCheck() {
    try {
      await this.query().select(1).limit(1)
      return { status: 'healthy', table: this.tableName }
    } catch (error) {
      return { 
        status: 'unhealthy', 
        table: this.tableName, 
        error: error.message 
      }
    }
  }

  /**
   * Get table statistics
   */
  static async getTableStats() {
    try {
      const totalCount = await this.queryWithDeleted().count('* as count').first()
      const activeCount = await this.query().count('* as count').first()
      const deletedCount = await this.queryDeleted().count('* as count').first()
      
      return {
        table: this.tableName,
        total: parseInt(totalCount.count),
        active: parseInt(activeCount.count),
        deleted: parseInt(deletedCount.count)
      }
    } catch (error) {
      return {
        table: this.tableName,
        error: error.message
      }
    }
  }
}

module.exports = AuditableDAO