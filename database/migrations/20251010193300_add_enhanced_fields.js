/**
 * Migration: Add enhanced fields to existing tables
 * 
 * This migration adds essential enhanced fields to existing tables:
 * - Soft delete capabilities
 * - Audit trail fields
 * - Version control for optimistic locking
 * - Enhanced metadata storage
 * 
 * @description Add enhanced fields to existing tables
 * @author System
 * @date 2025-10-10
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Helper function to safely add column if it doesn't exist
  const addColumnIfNotExists = async (tableName, columnName, columnDef) => {
    const hasColumn = await knex.schema.hasColumn(tableName, columnName)
    if (!hasColumn) {
      await knex.schema.alterTable(tableName, table => {
        columnDef(table)
      })
    }
  }

  // Helper function to safely add index
  const addIndexSafely = async (tableName, columnName, indexName) => {
    try {
      await knex.schema.alterTable(tableName, table => {
        table.index(columnName, indexName)
      })
    } catch {
      // Index might already exist, continue
      console.log(`Index ${indexName} might already exist`)
    }
  }

  // Enhance users table
  await addColumnIfNotExists('users', 'deletedAt', table => 
    table.timestamp('deletedAt').nullable().comment('Soft delete timestamp'))
  await addColumnIfNotExists('users', 'deletedBy', table => 
    table.uuid('deletedBy').nullable().comment('User ID who performed soft delete'))
  await addColumnIfNotExists('users', 'createdBy', table => 
    table.uuid('createdBy').nullable().comment('User ID who created this record'))
  await addColumnIfNotExists('users', 'updatedBy', table => 
    table.uuid('updatedBy').nullable().comment('User ID who last updated this record'))
  await addColumnIfNotExists('users', 'version', table => 
    table.integer('version').defaultTo(1).notNull().comment('Version number for optimistic locking'))
  await addColumnIfNotExists('users', 'metadata', table => 
    table.json('metadata').nullable().comment('Additional metadata and audit information'))

  // Add indexes for users table
  await addIndexSafely('users', 'deletedAt', 'users_deleted_at_idx')
  await addIndexSafely('users', 'createdBy', 'users_created_by_idx')
  await addIndexSafely('users', 'updatedBy', 'users_updated_by_idx')
  await addIndexSafely('users', 'version', 'users_version_idx')

  // Enhance stories table
  await addColumnIfNotExists('stories', 'deletedAt', table => 
    table.timestamp('deletedAt').nullable().comment('Soft delete timestamp'))
  await addColumnIfNotExists('stories', 'deletedBy', table => 
    table.uuid('deletedBy').nullable().comment('User ID who performed soft delete'))
  await addColumnIfNotExists('stories', 'createdBy', table => 
    table.uuid('createdBy').nullable().comment('User ID who created this record'))
  await addColumnIfNotExists('stories', 'updatedBy', table => 
    table.uuid('updatedBy').nullable().comment('User ID who last updated this record'))
  await addColumnIfNotExists('stories', 'version', table => 
    table.integer('version').defaultTo(1).notNull().comment('Version number for optimistic locking'))
  await addColumnIfNotExists('stories', 'metadata', table => 
    table.json('metadata').nullable().comment('Story metadata including workflow, approvals, etc.'))

  // Add indexes for stories table
  await addIndexSafely('stories', 'deletedAt', 'stories_deleted_at_idx')
  await addIndexSafely('stories', 'createdBy', 'stories_created_by_idx')
  await addIndexSafely('stories', 'updatedBy', 'stories_updated_by_idx')
  await addIndexSafely('stories', 'version', 'stories_version_idx')

  // Enhance attachments table
  await addColumnIfNotExists('attachments', 'deletedAt', table => 
    table.timestamp('deletedAt').nullable().comment('Soft delete timestamp'))
  await addColumnIfNotExists('attachments', 'deletedBy', table => 
    table.uuid('deletedBy').nullable().comment('User ID who performed soft delete'))
  await addColumnIfNotExists('attachments', 'createdBy', table => 
    table.uuid('createdBy').nullable().comment('User ID who created this record'))
  await addColumnIfNotExists('attachments', 'updatedBy', table => 
    table.uuid('updatedBy').nullable().comment('User ID who last updated this record'))
  await addColumnIfNotExists('attachments', 'version', table => 
    table.integer('version').defaultTo(1).notNull().comment('Version number for optimistic locking'))
  await addColumnIfNotExists('attachments', 'metadata', table => 
    table.json('metadata').nullable().comment('File metadata including EXIF, processing status, etc.'))
  await addColumnIfNotExists('attachments', 'isEncrypted', table => 
    table.boolean('isEncrypted').defaultTo(false).comment('Whether file content is encrypted'))
  await addColumnIfNotExists('attachments', 'encryptionKey', table => 
    table.string('encryptionKey').nullable().comment('Reference to encryption key (not the actual key)'))
  await addColumnIfNotExists('attachments', 'scanResults', table => 
    table.json('scanResults').nullable().comment('Virus scan and content analysis results'))

  // Add indexes for attachments table
  await addIndexSafely('attachments', 'deletedAt', 'attachments_deleted_at_idx')
  await addIndexSafely('attachments', 'createdBy', 'attachments_created_by_idx')
  await addIndexSafely('attachments', 'updatedBy', 'attachments_updated_by_idx')
  await addIndexSafely('attachments', 'version', 'attachments_version_idx')
  await addIndexSafely('attachments', 'isEncrypted', 'attachments_encrypted_idx')

  // Enhance sessions table
  await addColumnIfNotExists('sessions', 'deletedAt', table => 
    table.timestamp('deletedAt').nullable().comment('Soft delete timestamp'))
  await addColumnIfNotExists('sessions', 'deletedBy', table => 
    table.uuid('deletedBy').nullable().comment('User ID who performed soft delete'))
  await addColumnIfNotExists('sessions', 'createdBy', table => 
    table.uuid('createdBy').nullable().comment('User ID who created this record'))
  await addColumnIfNotExists('sessions', 'updatedBy', table => 
    table.uuid('updatedBy').nullable().comment('User ID who last updated this record'))
  await addColumnIfNotExists('sessions', 'version', table => 
    table.integer('version').defaultTo(1).notNull().comment('Version number for optimistic locking'))
  await addColumnIfNotExists('sessions', 'metadata', table => 
    table.json('metadata').nullable().comment('Session metadata including device info, location, etc.'))
  await addColumnIfNotExists('sessions', 'ipAddress', table => 
    table.string('ipAddress', 45).nullable().comment('IP address of the session'))
  await addColumnIfNotExists('sessions', 'userAgent', table => 
    table.text('userAgent').nullable().comment('Browser user agent'))
  await addColumnIfNotExists('sessions', 'deviceFingerprint', table => 
    table.json('deviceFingerprint').nullable().comment('Device fingerprinting data for security'))
  await addColumnIfNotExists('sessions', 'isActive', table => 
    table.boolean('isActive').defaultTo(true).comment('Whether session is currently active'))
  await addColumnIfNotExists('sessions', 'lastActivity', table => 
    table.timestamp('lastActivity').nullable().comment('Last activity timestamp'))

  // Add indexes for sessions table
  await addIndexSafely('sessions', 'deletedAt', 'sessions_deleted_at_idx')
  await addIndexSafely('sessions', 'createdBy', 'sessions_created_by_idx')
  await addIndexSafely('sessions', 'updatedBy', 'sessions_updated_by_idx')
  await addIndexSafely('sessions', 'version', 'sessions_version_idx')
  await addIndexSafely('sessions', 'ipAddress', 'sessions_ip_address_idx')
  await addIndexSafely('sessions', 'isActive', 'sessions_is_active_idx')
  await addIndexSafely('sessions', 'lastActivity', 'sessions_last_activity_idx')

  // Enhance interests table
  await addColumnIfNotExists('interests', 'deletedAt', table => 
    table.timestamp('deletedAt').nullable().comment('Soft delete timestamp'))
  await addColumnIfNotExists('interests', 'deletedBy', table => 
    table.uuid('deletedBy').nullable().comment('User ID who performed soft delete'))
  await addColumnIfNotExists('interests', 'createdBy', table => 
    table.uuid('createdBy').nullable().comment('User ID who created this record'))
  await addColumnIfNotExists('interests', 'updatedBy', table => 
    table.uuid('updatedBy').nullable().comment('User ID who last updated this record'))
  await addColumnIfNotExists('interests', 'version', table => 
    table.integer('version').defaultTo(1).notNull().comment('Version number for optimistic locking'))
  await addColumnIfNotExists('interests', 'metadata', table => 
    table.json('metadata').nullable().comment('Interest metadata including popularity, trends, etc.'))

  // Add indexes for interests table
  await addIndexSafely('interests', 'deletedAt', 'interests_deleted_at_idx')
  await addIndexSafely('interests', 'createdBy', 'interests_created_by_idx')
  await addIndexSafely('interests', 'updatedBy', 'interests_updated_by_idx')
  await addIndexSafely('interests', 'version', 'interests_version_idx')

  // Enhance tags table
  await addColumnIfNotExists('tags', 'deletedAt', table => 
    table.timestamp('deletedAt').nullable().comment('Soft delete timestamp'))
  await addColumnIfNotExists('tags', 'deletedBy', table => 
    table.uuid('deletedBy').nullable().comment('User ID who performed soft delete'))
  await addColumnIfNotExists('tags', 'createdBy', table => 
    table.uuid('createdBy').nullable().comment('User ID who created this record'))
  await addColumnIfNotExists('tags', 'updatedBy', table => 
    table.uuid('updatedBy').nullable().comment('User ID who last updated this record'))
  await addColumnIfNotExists('tags', 'version', table => 
    table.integer('version').defaultTo(1).notNull().comment('Version number for optimistic locking'))
  await addColumnIfNotExists('tags', 'metadata', table => 
    table.json('metadata').nullable().comment('Tag metadata including usage stats, hierarchy, etc.'))
  await addColumnIfNotExists('tags', 'color', table => 
    table.string('color', 7).nullable().comment('Hex color code for tag display'))
  await addColumnIfNotExists('tags', 'sortOrder', table => 
    table.integer('sortOrder').defaultTo(0).comment('Sort order for tag display'))
  await addColumnIfNotExists('tags', 'isSystem', table => 
    table.boolean('isSystem').defaultTo(false).comment('Whether this is a system-managed tag'))

  // Add indexes for tags table
  await addIndexSafely('tags', 'deletedAt', 'tags_deleted_at_idx')
  await addIndexSafely('tags', 'createdBy', 'tags_created_by_idx')
  await addIndexSafely('tags', 'updatedBy', 'tags_updated_by_idx')
  await addIndexSafely('tags', 'version', 'tags_version_idx')
  await addIndexSafely('tags', 'isSystem', 'tags_is_system_idx')
  await addIndexSafely('tags', 'sortOrder', 'tags_sort_order_idx')
}

exports.down = async function(knex) {
  // Helper function to safely drop column if it exists
  const dropColumnIfExists = async (tableName, columnName) => {
    const hasColumn = await knex.schema.hasColumn(tableName, columnName)
    if (hasColumn) {
      await knex.schema.alterTable(tableName, table => {
        table.dropColumn(columnName)
      })
    }
  }

  const tablesToRevert = ['tags', 'interests', 'sessions', 'attachments', 'stories', 'users']
  const columnsToRemove = [
    'deletedAt', 'deletedBy', 'createdBy', 'updatedBy', 'version', 'metadata',
    // Additional columns for specific tables
    'ipAddress', 'userAgent', 'deviceFingerprint', 'isActive', 'lastActivity', // sessions
    'isEncrypted', 'encryptionKey', 'scanResults', // attachments
    'color', 'sortOrder', 'isSystem' // tags
  ]

  for (const tableName of tablesToRevert) {
    for (const columnName of columnsToRemove) {
      await dropColumnIfExists(tableName, columnName)
    }
  }
}