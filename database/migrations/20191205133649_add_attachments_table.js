exports.up = knex => {
  return knex.schema.createTable('attachments', table => {
    table.increments('id')
    table.uuid('userId').references('id').inTable('users').onDelete('CASCADE')
    table.string('path').notNullable()
    table.string('mimeType').notNullable()
    table.integer('size').notNullable()
    table.string('originalName').notNullable()
    table.string('category', 50)

    table.boolean('isPublic').notNullable().defaultTo(false)
    table.boolean('isEncrypted').notNullable().defaultTo(false)
    table.string('encryptionKey')
    table.string('securityStatus', 20).notNullable().defaultTo('pending')
    table.string('checksum', 64)
    table.integer('downloadCount').notNullable().defaultTo(0)
    table.timestamp('lastAccessedAt')
    table.string('folder', 100)
    table.text('description')
    table.jsonb('tags')
    table.jsonb('metadata')
    table.jsonb('scanResults')
    table.boolean('containsPII').notNullable().defaultTo(false)
    table.string('retentionPeriod', 20)
    table.timestamp('expiresAt')
    table.timestamp('deletionScheduledAt')
    table.string('thumbnailPath')

    table.uuid('createdBy')
    table.uuid('updatedBy')
    table.uuid('deletedBy')
    table.timestamp('deletedAt')
    table.integer('version').notNullable().defaultTo(1)

    table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now())

    table.index(['deletedAt'], 'attachments_deleted_at_idx')
    table.index(['createdBy'], 'attachments_created_by_idx')
    table.index(['updatedBy'], 'attachments_updated_by_idx')
    table.index(['version'], 'attachments_version_idx')
    table.index(['securityStatus'], 'idx_attachments_security_status')
    table.index(['downloadCount'], 'idx_attachments_download_count')
    table.index(['lastAccessedAt'], 'idx_attachments_last_accessed')
    table.index(['folder'], 'idx_attachments_folder')
    table.index(['isPublic'], 'idx_attachments_is_public')
    table.index(['expiresAt'], 'idx_attachments_expires_at')
    table.index(['containsPII'], 'idx_attachments_contains_pii')
    table.index(['deletionScheduledAt'], 'idx_attachments_deletion_scheduled')
  })
}

exports.down = knex => {
  return knex.schema.dropTableIfExists('attachments')
}

