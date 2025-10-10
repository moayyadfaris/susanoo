/**
 * Migration: Add enterprise fields to existing tables
 * 
 * This migration adds essential enterprise fields to existing tables:
 * - Soft delete capabilities
 * - Audit trail fields
 * - Version control for optimistic locking
 * - Enhanced metadata storage
 * 
 * @description Add enterprise fields to existing tables
 * @author System
 * @date 2025-10-10
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Enhance users table
    .alterTable('users', table => {
      // Soft delete fields
      table.timestamp('deletedAt').nullable()
        .comment('Soft delete timestamp')
      table.uuid('deletedBy').nullable()
        .comment('User ID who performed soft delete')
      
      // Audit fields (if not already present)
      table.uuid('createdBy').nullable()
        .comment('User ID who created this record')
      table.uuid('updatedBy').nullable()
        .comment('User ID who last updated this record')
      
      // Version control for optimistic locking
      table.integer('version').defaultTo(1).notNull()
        .comment('Version number for optimistic locking')
      
      // Enhanced metadata (if not already present from previous migration)
      if (!table._hasColumn('metadata')) {
        table.json('metadata').nullable()
          .comment('Additional metadata and audit information')
      }
      
      // Indexes for performance
      table.index('deletedAt')
      table.index('createdBy')
      table.index('updatedBy')
      table.index('version')
    })
    
    // Enhance stories table
    .alterTable('stories', table => {
      // Soft delete fields
      table.timestamp('deletedAt').nullable()
        .comment('Soft delete timestamp')
      table.uuid('deletedBy').nullable()
        .comment('User ID who performed soft delete')
      
      // Audit fields
      table.uuid('createdBy').nullable()
        .comment('User ID who created this record')
      table.uuid('updatedBy').nullable()
        .comment('User ID who last updated this record')
      
      // Version control for optimistic locking
      table.integer('version').defaultTo(1).notNull()
        .comment('Version number for optimistic locking')
      
      // Enhanced metadata
      table.json('metadata').nullable()
        .comment('Story metadata including workflow, approvals, etc.')
      
      // Indexes for performance
      table.index('deletedAt')
      table.index('createdBy')
      table.index('updatedBy')
      table.index('version')
      table.index('status') // Add index on status if not exists
      table.index('type') // Add index on type if not exists
    })
    
    // Enhance attachments table
    .alterTable('attachments', table => {
      // Soft delete fields
      table.timestamp('deletedAt').nullable()
        .comment('Soft delete timestamp')
      table.uuid('deletedBy').nullable()
        .comment('User ID who performed soft delete')
      
      // Audit fields
      table.uuid('createdBy').nullable()
        .comment('User ID who created this record')
      table.uuid('updatedBy').nullable()
        .comment('User ID who last updated this record')
      
      // Version control for optimistic locking
      table.integer('version').defaultTo(1).notNull()
        .comment('Version number for optimistic locking')
      
      // Enhanced metadata
      table.json('metadata').nullable()
        .comment('File metadata including EXIF, processing status, etc.')
      
      // Security and compliance fields
      table.boolean('isEncrypted').defaultTo(false)
        .comment('Whether file content is encrypted')
      table.string('encryptionKey').nullable()
        .comment('Reference to encryption key (not the actual key)')
      table.json('scanResults').nullable()
        .comment('Virus scan and content analysis results')
      
      // Indexes for performance
      table.index('deletedAt')
      table.index('createdBy')
      table.index('updatedBy')
      table.index('version')
      table.index('category') // Add index on category if not exists
      table.index('isEncrypted')
    })
    
    // Enhance sessions table
    .alterTable('sessions', table => {
      // Soft delete fields
      table.timestamp('deletedAt').nullable()
        .comment('Soft delete timestamp')
      table.uuid('deletedBy').nullable()
        .comment('User ID who performed soft delete')
      
      // Audit fields
      table.uuid('createdBy').nullable()
        .comment('User ID who created this record')
      table.uuid('updatedBy').nullable()
        .comment('User ID who last updated this record')
      
      // Version control for optimistic locking
      table.integer('version').defaultTo(1).notNull()
        .comment('Version number for optimistic locking')
      
      // Enhanced session metadata
      table.json('metadata').nullable()
        .comment('Session metadata including device info, location, etc.')
      
      // Security fields
      table.string('ipAddress', 45).nullable()
        .comment('IP address of the session')
      table.text('userAgent').nullable()
        .comment('Browser user agent')
      table.json('deviceFingerprint').nullable()
        .comment('Device fingerprinting data for security')
      table.boolean('isActive').defaultTo(true)
        .comment('Whether session is currently active')
      table.timestamp('lastActivity').nullable()
        .comment('Last activity timestamp')
      
      // Indexes for performance
      table.index('deletedAt')
      table.index('createdBy')
      table.index('updatedBy')
      table.index('version')
      table.index('ipAddress')
      table.index('isActive')
      table.index('lastActivity')
    })
    
    // Enhance interests table
    .alterTable('interests', table => {
      // Soft delete fields
      table.timestamp('deletedAt').nullable()
        .comment('Soft delete timestamp')
      table.uuid('deletedBy').nullable()
        .comment('User ID who performed soft delete')
      
      // Audit fields
      table.uuid('createdBy').nullable()
        .comment('User ID who created this record')
      table.uuid('updatedBy').nullable()
        .comment('User ID who last updated this record')
      
      // Version control for optimistic locking
      table.integer('version').defaultTo(1).notNull()
        .comment('Version number for optimistic locking')
      
      // Enhanced metadata
      table.json('metadata').nullable()
        .comment('Interest metadata including popularity, trends, etc.')
      
      // Indexes for performance
      table.index('deletedAt')
      table.index('createdBy')
      table.index('updatedBy')
      table.index('version')
    })
    
    // Enhance tags table
    .alterTable('tags', table => {
      // Soft delete fields
      table.timestamp('deletedAt').nullable()
        .comment('Soft delete timestamp')
      table.uuid('deletedBy').nullable()
        .comment('User ID who performed soft delete')
      
      // Audit fields
      table.uuid('createdBy').nullable()
        .comment('User ID who created this record')
      table.uuid('updatedBy').nullable()
        .comment('User ID who last updated this record')
      
      // Version control for optimistic locking
      table.integer('version').defaultTo(1).notNull()
        .comment('Version number for optimistic locking')
      
      // Enhanced metadata
      table.json('metadata').nullable()
        .comment('Tag metadata including usage stats, hierarchy, etc.')
      
      // Tag enhancement fields
      table.string('color', 7).nullable()
        .comment('Hex color code for tag display')
      table.integer('sortOrder').defaultTo(0)
        .comment('Sort order for tag display')
      table.boolean('isSystem').defaultTo(false)
        .comment('Whether this is a system-managed tag')
      
      // Indexes for performance
      table.index('deletedAt')
      table.index('createdBy')
      table.index('updatedBy')
      table.index('version')
      table.index('isSystem')
      table.index('sortOrder')
    })
}

exports.down = function(knex) {
  return knex.schema
    // Remove enhancements from tags table
    .alterTable('tags', table => {
      table.dropColumn('deletedAt')
      table.dropColumn('deletedBy')
      table.dropColumn('createdBy')
      table.dropColumn('updatedBy')
      table.dropColumn('version')
      table.dropColumn('metadata')
      table.dropColumn('color')
      table.dropColumn('sortOrder')
      table.dropColumn('isSystem')
    })
    
    // Remove enhancements from interests table
    .alterTable('interests', table => {
      table.dropColumn('deletedAt')
      table.dropColumn('deletedBy')
      table.dropColumn('createdBy')
      table.dropColumn('updatedBy')
      table.dropColumn('version')
      table.dropColumn('metadata')
    })
    
    // Remove enhancements from sessions table
    .alterTable('sessions', table => {
      table.dropColumn('deletedAt')
      table.dropColumn('deletedBy')
      table.dropColumn('createdBy')
      table.dropColumn('updatedBy')
      table.dropColumn('version')
      table.dropColumn('metadata')
      table.dropColumn('ipAddress')
      table.dropColumn('userAgent')
      table.dropColumn('deviceFingerprint')
      table.dropColumn('isActive')
      table.dropColumn('lastActivity')
    })
    
    // Remove enhancements from attachments table
    .alterTable('attachments', table => {
      table.dropColumn('deletedAt')
      table.dropColumn('deletedBy')
      table.dropColumn('createdBy')
      table.dropColumn('updatedBy')
      table.dropColumn('version')
      table.dropColumn('metadata')
      table.dropColumn('isEncrypted')
      table.dropColumn('encryptionKey')
      table.dropColumn('scanResults')
    })
    
    // Remove enhancements from stories table
    .alterTable('stories', table => {
      table.dropColumn('deletedAt')
      table.dropColumn('deletedBy')
      table.dropColumn('createdBy')
      table.dropColumn('updatedBy')
      table.dropColumn('version')
      table.dropColumn('metadata')
    })
    
    // Remove enhancements from users table
    .alterTable('users', table => {
      table.dropColumn('deletedAt')
      table.dropColumn('deletedBy')
      table.dropColumn('createdBy')
      table.dropColumn('updatedBy')
      table.dropColumn('version')
      // Don't drop metadata as it might exist from previous migration
    })
}