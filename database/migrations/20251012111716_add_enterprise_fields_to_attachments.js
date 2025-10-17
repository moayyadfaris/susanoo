/**
 * Enterprise Attachment Fields Migration
 * Adds comprehensive fields for enhanced attachment management including
 * security, metadata, analytics, and GDPR compliance
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Helper function to safely add column if it doesn't exist
  const addColumnIfNotExists = async (columnName, columnDef) => {
    const hasColumn = await knex.schema.hasColumn('attachments', columnName)
    if (!hasColumn) {
      await knex.schema.alterTable('attachments', table => {
        columnDef(table)
      })
    }
  }

  // Helper function to safely add index
  const addIndexSafely = async (columnName, indexName) => {
    try {
      await knex.schema.alterTable('attachments', table => {
        table.index(columnName, indexName)
      })
    } catch {
      // Index might already exist, continue
      console.log(`Index ${indexName} might already exist`)
    }
  }

  // Security and validation fields
  await addColumnIfNotExists('securityStatus', table => 
    table.string('securityStatus', 20)
      .defaultTo('pending')
      .notNullable()
      .comment('Security scan status: pending, safe, suspicious, malicious'))
  
  await addColumnIfNotExists('checksum', table => 
    table.string('checksum', 64)
      .nullable()
      .comment('File checksum for integrity verification'))
  
  // Analytics fields
  await addColumnIfNotExists('downloadCount', table => 
    table.integer('downloadCount')
      .defaultTo(0)
      .notNullable()
      .comment('Number of times file has been downloaded'))
  
  await addColumnIfNotExists('lastAccessedAt', table => 
    table.timestamp('lastAccessedAt')
      .nullable()
      .comment('Last time the file was accessed'))
  
  // Organization and management
  await addColumnIfNotExists('folder', table => 
    table.string('folder', 100)
      .nullable()
      .comment('Virtual folder for file organization'))
  
  await addColumnIfNotExists('description', table => 
    table.text('description')
      .nullable()
      .comment('Optional file description'))
  
  await addColumnIfNotExists('tags', table => 
    table.json('tags')
      .nullable()
      .comment('Tags for file categorization and search'))
  
  // Performance and storage
  await addColumnIfNotExists('isPublic', table => 
    table.boolean('isPublic')
      .defaultTo(false)
      .notNullable()
      .comment('Whether file is publicly accessible'))
  
  await addColumnIfNotExists('expiresAt', table => 
    table.timestamp('expiresAt')
      .nullable()
      .comment('Expiration date for temporary files'))
  
  await addColumnIfNotExists('thumbnailPath', table => 
    table.string('thumbnailPath')
      .nullable()
      .comment('Path to generated thumbnail for images/videos'))
  
  // GDPR and compliance
  await addColumnIfNotExists('containsPII', table => 
    table.boolean('containsPII')
      .defaultTo(false)
      .notNullable()
      .comment('Whether file contains personally identifiable information'))
  
  await addColumnIfNotExists('retentionPeriod', table => 
    table.string('retentionPeriod', 20)
      .nullable()
      .comment('Data retention period (e.g., 7y, 30d)'))
  
  await addColumnIfNotExists('deletionScheduledAt', table => 
    table.timestamp('deletionScheduledAt')
      .nullable()
      .comment('Scheduled deletion date for compliance'))
  
  // Add indexes for performance
  await addIndexSafely(['securityStatus'], 'idx_attachments_security_status')
  await addIndexSafely(['downloadCount'], 'idx_attachments_download_count')
  await addIndexSafely(['lastAccessedAt'], 'idx_attachments_last_accessed')
  await addIndexSafely(['folder'], 'idx_attachments_folder')
  await addIndexSafely(['isPublic'], 'idx_attachments_is_public')
  await addIndexSafely(['expiresAt'], 'idx_attachments_expires_at')
  await addIndexSafely(['containsPII'], 'idx_attachments_contains_pii')
  await addIndexSafely(['deletionScheduledAt'], 'idx_attachments_deletion_scheduled')
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Helper function to safely drop column if it exists
  const dropColumnIfExists = async (columnName) => {
    const hasColumn = await knex.schema.hasColumn('attachments', columnName)
    if (hasColumn) {
      await knex.schema.alterTable('attachments', table => {
        table.dropColumn(columnName)
      })
    }
  }

  // Helper function to safely drop index
  const dropIndexSafely = async (indexName) => {
    try {
      await knex.schema.alterTable('attachments', table => {
        table.dropIndex([], indexName)
      })
    } catch {
      // Index might not exist, continue
      console.log(`Index ${indexName} might not exist`)
    }
  }

  // Drop indexes first
  await dropIndexSafely('idx_attachments_security_status')
  await dropIndexSafely('idx_attachments_download_count')
  await dropIndexSafely('idx_attachments_last_accessed')
  await dropIndexSafely('idx_attachments_folder')
  await dropIndexSafely('idx_attachments_is_public')
  await dropIndexSafely('idx_attachments_expires_at')
  await dropIndexSafely('idx_attachments_contains_pii')
  await dropIndexSafely('idx_attachments_deletion_scheduled')
  
  // Drop columns
  await dropColumnIfExists('securityStatus')
  await dropColumnIfExists('checksum')
  await dropColumnIfExists('downloadCount')
  await dropColumnIfExists('lastAccessedAt')
  await dropColumnIfExists('folder')
  await dropColumnIfExists('description')
  await dropColumnIfExists('tags')
  await dropColumnIfExists('isPublic')
  await dropColumnIfExists('expiresAt')
  await dropColumnIfExists('thumbnailPath')
  await dropColumnIfExists('containsPII')
  await dropColumnIfExists('retentionPeriod')
  await dropColumnIfExists('deletionScheduledAt')
}
