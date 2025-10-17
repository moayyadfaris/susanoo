/**
 * Migration: Add Enterprise Session Management Fields
 * 
 * Safely adds new columns to support enhanced session management features,
 * checking for existing columns to prevent conflicts.
 */

exports.up = async (knex) => {
  return knex.schema.alterTable('sessions', async (table) => {
    // Check which columns already exist
    const hasSecurityLevel = await knex.schema.hasColumn('sessions', 'securityLevel')
    const hasSessionType = await knex.schema.hasColumn('sessions', 'sessionType')
    const hasMetadata = await knex.schema.hasColumn('sessions', 'metadata')
    
    // Only add columns that don't exist
    if (!hasSecurityLevel) {
      table.string('securityLevel', 20).defaultTo('low')
        .comment('Security risk level: low, medium, high')
    }
    
    if (!hasSessionType) {
      table.string('sessionType', 30).defaultTo('standard')
        .comment('Session type: standard, persistent, mobile, suspicious')
    }
    
    if (!hasMetadata) {
      table.text('metadata').nullable()
        .comment('JSON metadata including device info, location, security analysis')
    }
  })
  .then(async () => {
    // Add indexes separately to avoid conflicts
    return knex.schema.alterTable('sessions', async (table) => {
      // Check if indexes exist before creating them
      const indexExists = async (indexName) => {
        try {
          const result = await knex.raw(`
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'sessions' AND indexname = ?
          `, [indexName])
          return result.rows.length > 0
        } catch (error) {
          return false
        }
      }
      
      if (!(await indexExists('idx_sessions_user_security'))) {
        table.index(['userId', 'securityLevel'], 'idx_sessions_user_security')
      }
      
      if (!(await indexExists('idx_sessions_type'))) {
        table.index(['sessionType'], 'idx_sessions_type')
      }
      
      if (!(await indexExists('idx_sessions_expiry'))) {
        table.index(['expiredAt'], 'idx_sessions_expiry')
      }
      
      if (!(await indexExists('idx_sessions_ip'))) {
        table.index(['ip'], 'idx_sessions_ip')
      }
    })
  })
}

exports.down = async (knex) => {
  return knex.schema.alterTable('sessions', async (table) => {
    // Remove indexes first (if they exist)
    const indexExists = async (indexName) => {
      try {
        const result = await knex.raw(`
          SELECT 1 FROM pg_indexes 
          WHERE tablename = 'sessions' AND indexname = ?
        `, [indexName])
        return result.rows.length > 0
      } catch (error) {
        return false
      }
    }
    
    if (await indexExists('idx_sessions_user_security')) {
      table.dropIndex(['userId', 'securityLevel'], 'idx_sessions_user_security')
    }
    
    if (await indexExists('idx_sessions_type')) {
      table.dropIndex(['sessionType'], 'idx_sessions_type')
    }
    
    if (await indexExists('idx_sessions_expiry')) {
      table.dropIndex(['expiredAt'], 'idx_sessions_expiry')
    }
    
    if (await indexExists('idx_sessions_ip')) {
      table.dropIndex(['ip'], 'idx_sessions_ip')
    }
  })
  .then(async () => {
    // Remove columns (if they exist)
    return knex.schema.alterTable('sessions', async (table) => {
      const hasSecurityLevel = await knex.schema.hasColumn('sessions', 'securityLevel')
      const hasSessionType = await knex.schema.hasColumn('sessions', 'sessionType')
      const hasMetadata = await knex.schema.hasColumn('sessions', 'metadata')
      
      if (hasSecurityLevel) {
        table.dropColumn('securityLevel')
      }
      
      if (hasSessionType) {
        table.dropColumn('sessionType')
      }
      
      if (hasMetadata) {
        table.dropColumn('metadata')
      }
    })
  })
}