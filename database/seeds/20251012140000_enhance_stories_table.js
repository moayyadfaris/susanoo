/**
 * Enhanced Stories Table Migration
 * 
 * This migration enhances the stories table with:
 * - Additional fields for better functionality
 * - Proper constraints and foreign keys
 * - Performance indexes
 * - Data integrity checks
 * - Audit trail support
 * 
 * @version 2.0.0
 * @author Susanoo API Team
 */

exports.up = function(knex) {
  return knex.schema
    .alterTable('stories', table => {
      // Add missing fields for enhanced functionality
      table.integer('countryId').unsigned().nullable()
        .references('id').inTable('countries')
        .onDelete('SET NULL')
        .onUpdate('CASCADE')
      
      table.integer('parentId').unsigned().nullable()
        .references('id').inTable('stories')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')
      
      table.enum('priority', ['LOW', 'NORMAL', 'HIGH', 'URGENT'])
        .defaultTo('NORMAL')
        .notNullable()
      
      table.boolean('isInEditMode').defaultTo(false).notNullable()
      
      // Location data for geographical stories
      table.decimal('latitude', 10, 8).nullable()
      table.decimal('longitude', 11, 8).nullable()
      table.string('address', 500).nullable()
      table.string('city', 100).nullable()
      table.string('region', 100).nullable()
      
      // Audit and soft delete fields
      table.timestamp('deletedAt').nullable()
      table.uuid('deletedBy').nullable()
        .references('id').inTable('users')
        .onDelete('SET NULL')
      
      // Version control for optimistic locking
      table.integer('version').defaultTo(1).notNullable()
      
      // Content metadata
      table.json('metadata').nullable()
      table.text('internalNotes').nullable()
      
      // Publishing and scheduling
      table.timestamp('publishedAt').nullable()
      table.timestamp('scheduledAt').nullable()
      table.timestamp('archivedAt').nullable()
      
      // Statistics and engagement
      table.integer('viewCount').defaultTo(0).notNullable()
      table.integer('shareCount').defaultTo(0).notNullable()
      table.integer('commentCount').defaultTo(0).notNullable()
      
      // Content quality and moderation
      table.decimal('qualityScore', 3, 2).nullable()
      table.boolean('isFeatured').defaultTo(false).notNullable()
      table.boolean('isVerified').defaultTo(false).notNullable()
      table.uuid('verifiedBy').nullable()
        .references('id').inTable('users')
        .onDelete('SET NULL')
      
      // SEO and content discovery
      table.string('slug', 300).nullable()
      table.text('excerpt').nullable()
      table.json('seoMetadata').nullable()
      
      // Add constraints
      table.check('?? > ??', ['toTime', 'fromTime']) // toTime must be after fromTime
      table.check('?? >= 0', ['viewCount']) // viewCount must be non-negative
      table.check('?? >= 0', ['shareCount']) // shareCount must be non-negative
      table.check('?? >= 0', ['commentCount']) // commentCount must be non-negative
      table.check('?? BETWEEN 0 AND 10', ['qualityScore']) // qualityScore between 0-10
      table.check('?? BETWEEN -90 AND 90', ['latitude']) // Valid latitude range
      table.check('?? BETWEEN -180 AND 180', ['longitude']) // Valid longitude range
    })
    .then(() => {
      // Create performance indexes
      return Promise.all([
        // Primary indexes for common queries
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_status ON stories (status) WHERE deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_type ON stories (type) WHERE deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_user_id ON stories (user_id) WHERE deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_country_id ON stories (country_id) WHERE deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_priority ON stories (priority) WHERE deleted_at IS NULL'),
        
        // Temporal indexes
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_created_at ON stories (created_at DESC) WHERE deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_updated_at ON stories (updated_at DESC) WHERE deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_from_time ON stories (from_time) WHERE deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_to_time ON stories (to_time) WHERE deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_published_at ON stories (published_at DESC) WHERE published_at IS NOT NULL'),
        
        // Composite indexes for common query patterns
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_status_created ON stories (status, created_at DESC) WHERE deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_user_status ON stories (user_id, status) WHERE deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_type_status ON stories (type, status) WHERE deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_priority_status ON stories (priority, status) WHERE deleted_at IS NULL'),
        
        // Full-text search index for title and details
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_fulltext ON stories USING gin(to_tsvector(\'english\', title || \' \' || COALESCE(details, \'\'))) WHERE deleted_at IS NULL'),
        
        // Partial indexes for active stories
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_active ON stories (id, updated_at) WHERE deleted_at IS NULL AND status NOT IN (\'DELETED\', \'ARCHIVED\')'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_featured ON stories (id, created_at DESC) WHERE is_featured = true AND deleted_at IS NULL'),
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_verified ON stories (id, verified_by) WHERE is_verified = true AND deleted_at IS NULL'),
        
        // Geographic indexes
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_location ON stories (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND deleted_at IS NULL'),
        
        // Hierarchical queries
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_parent ON stories (parent_id) WHERE parent_id IS NOT NULL AND deleted_at IS NULL'),
        
        // Soft delete index
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_deleted ON stories (deleted_at, deleted_by) WHERE deleted_at IS NOT NULL'),
        
        // Edit mode tracking
        knex.schema.raw('CREATE INDEX CONCURRENTLY idx_stories_edit_mode ON stories (id, updated_at) WHERE is_in_edit_mode = true'),
        
        // Unique constraints
        knex.schema.raw('CREATE UNIQUE INDEX CONCURRENTLY idx_stories_slug_unique ON stories (slug) WHERE slug IS NOT NULL AND deleted_at IS NULL')
      ])
    })
    .then(() => {
      // Update existing data with default values
      return knex('stories')
        .whereNull('priority')
        .update({ priority: 'NORMAL' })
    })
    .then(() => {
      return knex('stories')
        .whereNull('isInEditMode')
        .update({ isInEditMode: false })
    })
    .then(() => {
      return knex('stories')
        .whereNull('version')
        .update({ version: 1 })
    })
    .then(() => {
      return knex('stories')
        .whereNull('viewCount')
        .update({ viewCount: 0 })
    })
    .then(() => {
      return knex('stories')
        .whereNull('shareCount')
        .update({ shareCount: 0 })
    })
    .then(() => {
      return knex('stories')
        .whereNull('commentCount')
        .update({ commentCount: 0 })
    })
    .then(() => {
      return knex('stories')
        .whereNull('isFeatured')
        .update({ isFeatured: false })
    })
    .then(() => {
      return knex('stories')
        .whereNull('isVerified')
        .update({ isVerified: false })
    })
}

exports.down = function(knex) {
  return knex.schema
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_status')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_type')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_user_id')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_country_id')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_priority')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_created_at')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_updated_at')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_from_time')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_to_time')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_published_at')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_status_created')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_user_status')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_type_status')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_priority_status')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_fulltext')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_active')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_featured')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_verified')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_location')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_parent')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_deleted')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_edit_mode')
    .raw('DROP INDEX CONCURRENTLY IF EXISTS idx_stories_slug_unique')
    .then(() => {
      return knex.schema.alterTable('stories', table => {
        // Remove added columns in reverse order
        table.dropColumn('seoMetadata')
        table.dropColumn('excerpt')
        table.dropColumn('slug')
        table.dropColumn('verifiedBy')
        table.dropColumn('isVerified')
        table.dropColumn('isFeatured')
        table.dropColumn('qualityScore')
        table.dropColumn('commentCount')
        table.dropColumn('shareCount')
        table.dropColumn('viewCount')
        table.dropColumn('archivedAt')
        table.dropColumn('scheduledAt')
        table.dropColumn('publishedAt')
        table.dropColumn('internalNotes')
        table.dropColumn('metadata')
        table.dropColumn('version')
        table.dropColumn('deletedBy')
        table.dropColumn('deletedAt')
        table.dropColumn('region')
        table.dropColumn('city')
        table.dropColumn('address')
        table.dropColumn('longitude')
        table.dropColumn('latitude')
        table.dropColumn('isInEditMode')
        table.dropColumn('priority')
        table.dropColumn('parentId')
        table.dropColumn('countryId')
      })
    })
}