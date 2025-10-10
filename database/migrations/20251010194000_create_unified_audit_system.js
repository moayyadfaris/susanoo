/**
 * Migration: Replace separate audit tables with unified audit system
 * 
 * This migration:
 * 1. Drops the separate audit tables (users_audit, stories_audit, etc.)
 * 2. Creates a single unified audit_logs table to handle all entities
 * 3. Creates an audit_config table to manage audit settings per table
 * 
 * Benefits:
 * - Single table to maintain instead of multiple audit tables
 * - Configurable audit on/off per table
 * - Better performance with unified indexing
 * - Easier to query audit history across all entities
 * - Configurable retention policies per table
 * 
 * @description Create unified audit system with configuration
 * @author System
 * @date 2025-10-10
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  console.log('Starting unified audit system migration...')
  
  // First, drop all the separate audit tables
  console.log('Dropping separate audit tables...')
  await knex.schema.dropTableIfExists('system_audit')
  await knex.schema.dropTableIfExists('sessions_audit')
  await knex.schema.dropTableIfExists('attachments_audit')
  await knex.schema.dropTableIfExists('stories_audit')
  await knex.schema.dropTableIfExists('users_audit')
  
  // Create the unified audit_logs table
  console.log('Creating unified audit_logs table...')
  await knex.schema.createTable('audit_logs', table => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
    
    // Core audit fields
    table.string('table_name', 50).notNull().comment('Name of the table being audited')
    table.string('record_id', 50).notNull().comment('ID of the affected record (supports UUID, integer, string)')
    table.string('operation', 10).notNull().comment('CREATE, UPDATE, DELETE, RESTORE')
    
    // Change tracking
    table.json('old_values').nullable().comment('Previous values before change (for UPDATE/DELETE)')
    table.json('new_values').nullable().comment('New values after change (for CREATE/UPDATE)')
    table.json('changed_fields').nullable().comment('Array of field names that changed (for UPDATE)')
    
    // User and session context
    table.uuid('user_id').nullable().comment('ID of user who made the change')
    table.string('session_id').nullable().comment('Session ID for this change')
    table.string('ip_address', 45).nullable().comment('IP address of the user')
    table.text('user_agent').nullable().comment('Browser user agent')
    
    // Additional context
    table.string('event_type', 50).nullable().comment('Type of event (api_call, system_action, migration, etc.)')
    table.json('metadata').nullable().comment('Additional context-specific data')
    table.string('source', 50).defaultTo('application').comment('Source of the change (application, migration, system)')
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNull()
    
    // Performance indexes
    table.index(['table_name', 'record_id'], 'audit_logs_table_record_idx')
    table.index(['table_name', 'operation'], 'audit_logs_table_operation_idx')
    table.index('user_id', 'audit_logs_user_idx')
    table.index('created_at', 'audit_logs_created_at_idx')
    table.index(['table_name', 'created_at'], 'audit_logs_table_time_idx')
    table.index('event_type', 'audit_logs_event_type_idx')
  })
  
  // Create the audit configuration table
  console.log('Creating audit_config table...')
  await knex.schema.createTable('audit_config', table => {
    table.increments('id').primary()
    
    // Configuration fields
    table.string('table_name', 50).notNull().unique().comment('Name of the table to configure audit for')
    table.boolean('is_enabled').defaultTo(true).notNull().comment('Whether audit is enabled for this table')
    table.boolean('track_creates').defaultTo(true).notNull().comment('Track CREATE operations')
    table.boolean('track_updates').defaultTo(true).notNull().comment('Track UPDATE operations')
    table.boolean('track_deletes').defaultTo(true).notNull().comment('Track DELETE operations')
    table.boolean('track_restores').defaultTo(true).notNull().comment('Track RESTORE/undelete operations')
    
    // Data retention settings
    table.integer('retention_days').nullable().comment('Days to keep audit logs (null = forever)')
    table.boolean('compress_old_data').defaultTo(false).comment('Compress audit data older than retention period')
    
    // Field-specific settings
    table.json('excluded_fields').nullable().comment('Array of field names to exclude from audit')
    table.json('sensitive_fields').nullable().comment('Array of field names to hash/mask in audit logs')
    
    // Performance settings
    table.boolean('async_logging').defaultTo(true).comment('Whether to log audit entries asynchronously')
    table.integer('batch_size').defaultTo(100).comment('Batch size for async audit logging')
    
    // Metadata
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNull()
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNull()
    
    // Indexes
    table.index('table_name', 'audit_config_table_name_idx')
    table.index('is_enabled', 'audit_config_enabled_idx')
  })
  
  // Insert default audit configurations for all main tables
  console.log('Setting up default audit configurations...')
  const defaultConfigs = [
    {
      table_name: 'users',
      is_enabled: true,
      track_creates: true,
      track_updates: true,
      track_deletes: true,
      track_restores: true,
      retention_days: 2555, // 7 years for user data (compliance)
      excluded_fields: JSON.stringify(['passwordHash', 'resetPasswordToken']),
      sensitive_fields: JSON.stringify(['email', 'mobileNumber']),
      async_logging: true,
      batch_size: 50
    },
    {
      table_name: 'stories',
      is_enabled: true,
      track_creates: true,
      track_updates: true,
      track_deletes: true,
      track_restores: true,
      retention_days: 1095, // 3 years for content
      excluded_fields: JSON.stringify([]),
      sensitive_fields: JSON.stringify(['details']),
      async_logging: true,
      batch_size: 100
    },
    {
      table_name: 'attachments',
      is_enabled: true,
      track_creates: true,
      track_updates: true,
      track_deletes: true,
      track_restores: true,
      retention_days: 1095, // 3 years
      excluded_fields: JSON.stringify(['fileData']),
      sensitive_fields: JSON.stringify(['originalFileName']),
      async_logging: true,
      batch_size: 50
    },
    {
      table_name: 'sessions',
      is_enabled: true,
      track_creates: true,
      track_updates: false, // Sessions are usually short-lived
      track_deletes: true,
      track_restores: false,
      retention_days: 90, // 3 months for sessions
      excluded_fields: JSON.stringify(['token', 'refreshToken']),
      sensitive_fields: JSON.stringify(['ipAddress', 'userAgent']),
      async_logging: true,
      batch_size: 200
    },
    {
      table_name: 'interests',
      is_enabled: false, // Less critical, can enable if needed
      track_creates: true,
      track_updates: true,
      track_deletes: true,
      track_restores: true,
      retention_days: 365,
      excluded_fields: JSON.stringify([]),
      sensitive_fields: JSON.stringify([]),
      async_logging: true,
      batch_size: 100
    },
    {
      table_name: 'tags',
      is_enabled: false, // Less critical, can enable if needed
      track_creates: true,
      track_updates: true,
      track_deletes: true,
      track_restores: true,
      retention_days: 365,
      excluded_fields: JSON.stringify([]),
      sensitive_fields: JSON.stringify([]),
      async_logging: true,
      batch_size: 100
    }
  ]
  
  for (const config of defaultConfigs) {
    await knex('audit_config').insert(config)
  }
  
  // Create useful database functions for audit management
  console.log('Creating audit management functions...')
  
  // Function to enable/disable audit for a table
  await knex.raw(`
    CREATE OR REPLACE FUNCTION enable_audit_for_table(table_name TEXT, enabled BOOLEAN DEFAULT true)
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    AS $$
    BEGIN
      UPDATE audit_config 
      SET is_enabled = enabled, updated_at = NOW()
      WHERE audit_config.table_name = enable_audit_for_table.table_name;
      
      IF FOUND THEN
        RETURN true;
      ELSE
        -- Insert new config if table doesn't exist
        INSERT INTO audit_config (table_name, is_enabled, updated_at)
        VALUES (enable_audit_for_table.table_name, enabled, NOW());
        RETURN true;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN false;
    END;
    $$;
  `)
  
  // Function to check if audit is enabled for a table
  await knex.raw(`
    CREATE OR REPLACE FUNCTION is_audit_enabled(table_name TEXT)
    RETURNS BOOLEAN
    LANGUAGE SQL
    STABLE
    AS $$
      SELECT COALESCE(
        (SELECT is_enabled FROM audit_config WHERE audit_config.table_name = is_audit_enabled.table_name),
        false
      );
    $$;
  `)
  
  // Function to clean up old audit logs based on retention policy
  await knex.raw(`
    CREATE OR REPLACE FUNCTION cleanup_audit_logs()
    RETURNS INTEGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
      config_record RECORD;
      deleted_count INTEGER := 0;
      temp_count INTEGER;
    BEGIN
      -- Loop through each audit config with retention policy
      FOR config_record IN 
        SELECT table_name, retention_days 
        FROM audit_config 
        WHERE retention_days IS NOT NULL 
        AND retention_days > 0
      LOOP
        -- Delete old audit logs for this table
        DELETE FROM audit_logs 
        WHERE table_name = config_record.table_name
        AND created_at < NOW() - INTERVAL '1 day' * config_record.retention_days;
        
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        deleted_count := deleted_count + temp_count;
        
        RAISE NOTICE 'Cleaned % audit logs for table %', temp_count, config_record.table_name;
      END LOOP;
      
      RETURN deleted_count;
    END;
    $$;
  `)
  
  // Function to get audit statistics
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_audit_stats()
    RETURNS TABLE(
      table_name TEXT,
      total_logs BIGINT,
      creates BIGINT,
      updates BIGINT,
      deletes BIGINT,
      oldest_log TIMESTAMP,
      newest_log TIMESTAMP
    )
    LANGUAGE SQL
    STABLE
    AS $$
      SELECT 
        audit_logs.table_name::TEXT,
        COUNT(*)::BIGINT as total_logs,
        COUNT(CASE WHEN operation = 'CREATE' THEN 1 END)::BIGINT as creates,
        COUNT(CASE WHEN operation = 'UPDATE' THEN 1 END)::BIGINT as updates,
        COUNT(CASE WHEN operation = 'DELETE' THEN 1 END)::BIGINT as deletes,
        MIN(created_at) as oldest_log,
        MAX(created_at) as newest_log
      FROM audit_logs
      GROUP BY audit_logs.table_name
      ORDER BY total_logs DESC;
    $$;
  `)
  
  console.log('Unified audit system migration completed successfully!')
}

exports.down = async function(knex) {
  console.log('Rolling back unified audit system...')
  
  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS get_audit_stats();')
  await knex.raw('DROP FUNCTION IF EXISTS cleanup_audit_logs();')
  await knex.raw('DROP FUNCTION IF EXISTS is_audit_enabled(TEXT);')
  await knex.raw('DROP FUNCTION IF EXISTS enable_audit_for_table(TEXT, BOOLEAN);')
  
  // Drop unified tables
  await knex.schema.dropTableIfExists('audit_config')
  await knex.schema.dropTableIfExists('audit_logs')
  
  // Recreate the original separate audit tables (basic version)
  await knex.schema.createTable('users_audit', table => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
    table.uuid('record_id').notNull()
    table.string('operation', 10).notNull()
    table.json('old_values').nullable()
    table.json('new_values').nullable()
    table.uuid('user_id').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNull()
    table.index('record_id')
  })
  
  console.log('Unified audit system rollback completed')
}