/**
 * Migration: Create audit tables for enterprise tracking
 * 
 * This migration creates audit tables for all main entities to track:
 * - All data changes (CREATE, UPDATE, DELETE)
 * - User who made the change
 * - Timestamp of change
 * - Old and new values
 * - IP address and user agent for security
 * 
 * @description Create comprehensive audit trail system
 * @author System
 * @date 2025-10-10
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Create audit log table for users
    .createTable('users_audit', table => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
      table.uuid('record_id').notNull().comment('ID of the affected user record')
      table.string('operation', 10).notNull().comment('CREATE, UPDATE, DELETE')
      table.json('old_values').nullable().comment('Previous values before change')
      table.json('new_values').nullable().comment('New values after change')
      table.uuid('user_id').nullable().comment('ID of user who made the change')
      table.string('ip_address', 45).nullable().comment('IP address of the user')
      table.text('user_agent').nullable().comment('Browser user agent')
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNull()
      
      // Indexes for performance
      table.index('record_id')
      table.index('operation')
      table.index('user_id')
      table.index('created_at')
    })
    
    // Create audit log table for stories
    .createTable('stories_audit', table => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
      table.integer('record_id').notNull().comment('ID of the affected story record')
      table.string('operation', 10).notNull().comment('CREATE, UPDATE, DELETE')
      table.json('old_values').nullable().comment('Previous values before change')
      table.json('new_values').nullable().comment('New values after change')
      table.uuid('user_id').nullable().comment('ID of user who made the change')
      table.string('ip_address', 45).nullable().comment('IP address of the user')
      table.text('user_agent').nullable().comment('Browser user agent')
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNull()
      
      // Indexes for performance
      table.index('record_id')
      table.index('operation')
      table.index('user_id')
      table.index('created_at')
    })
    
    // Create audit log table for attachments
    .createTable('attachments_audit', table => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
      table.integer('record_id').notNull().comment('ID of the affected attachment record')
      table.string('operation', 10).notNull().comment('CREATE, UPDATE, DELETE')
      table.json('old_values').nullable().comment('Previous values before change')
      table.json('new_values').nullable().comment('New values after change')
      table.uuid('user_id').nullable().comment('ID of user who made the change')
      table.string('ip_address', 45).nullable().comment('IP address of the user')
      table.text('user_agent').nullable().comment('Browser user agent')
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNull()
      
      // Indexes for performance
      table.index('record_id')
      table.index('operation')
      table.index('user_id')
      table.index('created_at')
    })
    
    // Create audit log table for sessions
    .createTable('sessions_audit', table => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
      table.string('record_id').notNull().comment('ID of the affected session record')
      table.string('operation', 10).notNull().comment('CREATE, UPDATE, DELETE')
      table.json('old_values').nullable().comment('Previous values before change')
      table.json('new_values').nullable().comment('New values after change')
      table.uuid('user_id').nullable().comment('ID of user who made the change')
      table.string('ip_address', 45).nullable().comment('IP address of the user')
      table.text('user_agent').nullable().comment('Browser user agent')
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNull()
      
      // Indexes for performance
      table.index('record_id')
      table.index('operation')
      table.index('user_id')
      table.index('created_at')
    })
    
    // Create general system audit log
    .createTable('system_audit', table => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
      table.string('event_type', 50).notNull().comment('Type of system event')
      table.string('table_name', 50).nullable().comment('Affected table name')
      table.string('record_id').nullable().comment('Affected record ID')
      table.json('event_data').nullable().comment('Event specific data')
      table.uuid('user_id').nullable().comment('ID of user who triggered event')
      table.string('ip_address', 45).nullable().comment('IP address')
      table.text('user_agent').nullable().comment('Browser user agent')
      table.string('severity', 20).defaultTo('info').comment('Event severity level')
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNull()
      
      // Indexes for performance
      table.index('event_type')
      table.index('table_name')
      table.index('user_id')
      table.index('severity')
      table.index('created_at')
    })
}

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('system_audit')
    .dropTableIfExists('sessions_audit')
    .dropTableIfExists('attachments_audit')
    .dropTableIfExists('stories_audit')
    .dropTableIfExists('users_audit')
}