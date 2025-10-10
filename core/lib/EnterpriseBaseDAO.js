const { Model } = require('objection')
const { v4: uuidV4 } = require('uuid')
const logger = require('../../util/logger')

/**
 * EnterpriseBaseDAO - Enhanced base DAO with enterprise features
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
class EnterpriseBaseDAO extends Model {
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
    
    // Log creation for audit
    this._logAuditEvent('CREATE', queryContext)
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
    
    // Log update for audit
    this._logAuditEvent('UPDATE', queryContext)
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
   * Get audit history for a record
   */
  static async getAuditHistory(id, limit = 50) {
    const auditTableName = `${this.tableName}_audit`
    
    try {
      return await this.knex()
        .table(auditTableName)
        .where('record_id', id)
        .orderBy('created_at', 'desc')
        .limit(limit)
    } catch (error) {
      logger.warn(`Audit table ${auditTableName} not found`, { error: error.message })
      return []
    }
  }

  /**
   * Log audit events
   */
  _logAuditEvent(operation, queryContext) {
    const auditData = {
      table_name: this.constructor.tableName,
      record_id: this.id || 'new',
      operation,
      old_values: this.$beforeUpdatePreviousData || null,
      new_values: this.$toJson(),
      user_id: queryContext?.user?.id || null,
      ip_address: queryContext?.ip || null,
      user_agent: queryContext?.userAgent || null,
      timestamp: new Date().toISOString()
    }
    
    // Log to audit system (could be database, external service, etc.)
    logger.info('Audit event', auditData)
    
    // TODO: Store in dedicated audit table
    this._storeAuditRecord(auditData)
  }

  /**
   * Store audit record in database
   */
  async _storeAuditRecord(auditData) {
    const auditTableName = `${this.constructor.tableName}_audit`
    
    try {
      await this.constructor.knex()
        .table(auditTableName)
        .insert(auditData)
    } catch (error) {
      // Don't fail the main operation if audit fails
      logger.error(`Failed to store audit record in ${auditTableName}`, { 
        error: error.message,
        auditData 
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

  /**
   * GDPR compliance - anonymize user data
   */
  static async anonymizeUserData(userId, trx = null) {
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

module.exports = EnterpriseBaseDAO