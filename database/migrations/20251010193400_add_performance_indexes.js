/**
 * Migration: Add performance optimization indexes and constraints
 * 
 * This migration adds comprehensive database optimizations:
 * - Performance indexes for common queries
 * - Foreign key constraints for data integrity
 * - Partial indexes for soft-deleted records
 * - Composite indexes for complex queries
 * - Database-level constraints
 * 
 * @description Add database performance optimizations and constraints
 * @author System
 * @date 2025-10-10
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Add foreign key constraints for data integrity
    .alterTable('users', table => {
      // Add foreign key constraint for country
      table.foreign('countryId').references('id').inTable('countries')
        .onUpdate('CASCADE').onDelete('SET NULL')
      
      // Add foreign key constraint for profile image
      table.foreign('profileImageId').references('id').inTable('attachments')
        .onUpdate('CASCADE').onDelete('SET NULL')
      
      // Add check constraints
      table.check('email IS NOT NULL OR "mobileNumber" IS NOT NULL', [], 'users_contact_check')
      table.check('version >= 1', [], 'users_version_check')
    })
    
    .alterTable('stories', table => {
      // Add foreign key constraints
      table.foreign('userId').references('id').inTable('users')
        .onUpdate('CASCADE').onDelete('CASCADE')
      
      // Add check constraints
      table.check('version >= 1', [], 'stories_version_check')
      table.check('"fromTime" IS NULL OR "toTime" IS NULL OR "fromTime" <= "toTime"', [], 'stories_time_check')
    })
    
    .alterTable('attachments', table => {
      // Add foreign key constraints
      table.foreign('userId').references('id').inTable('users')
        .onUpdate('CASCADE').onDelete('CASCADE')
      
      // Add check constraints
      table.check('size > 0', [], 'attachments_size_check')
      table.check('version >= 1', [], 'attachments_version_check')
    })
    
    .alterTable('sessions', table => {
      // Add foreign key constraints
      table.foreign('userId').references('id').inTable('users')
        .onUpdate('CASCADE').onDelete('CASCADE')
      
      // Add check constraints
      table.check('version >= 1', [], 'sessions_version_check')
      table.check('"expiredAt" > "createdAt"', [], 'sessions_expiry_check')
    })
    
    .alterTable('user_interests', table => {
      // Add foreign key constraints
      table.foreign('userId').references('id').inTable('users')
        .onUpdate('CASCADE').onDelete('CASCADE')
      table.foreign('interestId').references('id').inTable('interests')
        .onUpdate('CASCADE').onDelete('CASCADE')
      
      // Add unique constraint to prevent duplicates
      table.unique(['userId', 'interestId'], 'user_interests_unique')
    })
    
    .alterTable('story_tags', table => {
      // Add foreign key constraints
      table.foreign('storyId').references('id').inTable('stories')
        .onUpdate('CASCADE').onDelete('CASCADE')
      table.foreign('tagId').references('id').inTable('tags')
        .onUpdate('CASCADE').onDelete('CASCADE')
      
      // Add unique constraint to prevent duplicates
      table.unique(['storyId', 'tagId'], 'story_tags_unique')
    })
    
    .alterTable('story_attachments', table => {
      // Add foreign key constraints
      table.foreign('storyId').references('id').inTable('stories')
        .onUpdate('CASCADE').onDelete('CASCADE')
      table.foreign('attachmentId').references('id').inTable('attachments')
        .onUpdate('CASCADE').onDelete('CASCADE')
      
      // Add unique constraint to prevent duplicates
      table.unique(['storyId', 'attachmentId'], 'story_attachments_unique')
    })
    
    // Create additional performance indexes
    .raw(`
      -- Composite indexes for common query patterns
      
      -- Users table indexes
      CREATE INDEX CONCURRENTLY IF NOT EXISTS users_email_active_idx 
        ON users (email) WHERE "deletedAt" IS NULL AND "isActive" = true;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS users_mobile_active_idx 
        ON users ("mobileNumber") WHERE "deletedAt" IS NULL AND "isActive" = true;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS users_role_active_idx 
        ON users (role) WHERE "deletedAt" IS NULL AND "isActive" = true;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS users_country_idx 
        ON users ("countryId") WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS users_created_at_idx 
        ON users ("createdAt") WHERE "deletedAt" IS NULL;
      
      -- Stories table indexes
      CREATE INDEX CONCURRENTLY IF NOT EXISTS stories_user_status_idx 
        ON stories ("userId", status) WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS stories_status_created_idx 
        ON stories (status, "createdAt") WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS stories_type_status_idx 
        ON stories (type, status) WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS stories_time_range_idx 
        ON stories ("fromTime", "toTime") WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS stories_title_search_idx 
        ON stories USING gin(to_tsvector('english', title)) WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS stories_details_search_idx 
        ON stories USING gin(to_tsvector('english', details)) WHERE "deletedAt" IS NULL;
      
      -- Attachments table indexes
      CREATE INDEX CONCURRENTLY IF NOT EXISTS attachments_user_category_idx 
        ON attachments ("userId", category) WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS attachments_mime_type_idx 
        ON attachments ("mimeType") WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS attachments_size_idx 
        ON attachments (size) WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS attachments_created_at_idx 
        ON attachments ("createdAt") WHERE "deletedAt" IS NULL;
      
      -- Sessions table indexes
      CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_user_active_idx 
        ON sessions ("userId") WHERE "deletedAt" IS NULL AND "isActive" = true;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_expired_cleanup_idx 
        ON sessions ("expiredAt") WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_ip_address_idx 
        ON sessions ("ipAddress") WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_last_activity_idx 
        ON sessions ("lastActivity") WHERE "deletedAt" IS NULL AND "isActive" = true;
      
      -- Interests table indexes
      CREATE INDEX CONCURRENTLY IF NOT EXISTS interests_name_active_idx 
        ON interests (name) WHERE "deletedAt" IS NULL;
      
      -- Tags table indexes
      CREATE INDEX CONCURRENTLY IF NOT EXISTS tags_name_active_idx 
        ON tags (name) WHERE "deletedAt" IS NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS tags_system_sort_idx 
        ON tags ("isSystem", "sortOrder") WHERE "deletedAt" IS NULL;
      
      -- Junction table indexes
      CREATE INDEX CONCURRENTLY IF NOT EXISTS user_interests_user_idx 
        ON user_interests ("userId");
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS user_interests_interest_idx 
        ON user_interests ("interestId");
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS story_tags_story_idx 
        ON story_tags ("storyId");
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS story_tags_tag_idx 
        ON story_tags ("tagId");
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS story_attachments_story_idx 
        ON story_attachments ("storyId");
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS story_attachments_attachment_idx 
        ON story_attachments ("attachmentId");
      
      -- Audit table indexes for performance
      CREATE INDEX CONCURRENTLY IF NOT EXISTS users_audit_record_time_idx 
        ON users_audit (record_id, created_at DESC);
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS stories_audit_record_time_idx 
        ON stories_audit (record_id, created_at DESC);
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS attachments_audit_record_time_idx 
        ON attachments_audit (record_id, created_at DESC);
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_audit_record_time_idx 
        ON sessions_audit (record_id, created_at DESC);
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS system_audit_event_time_idx 
        ON system_audit (event_type, created_at DESC);
      
      -- Metadata JSON indexes (PostgreSQL JSONB)
      CREATE INDEX CONCURRENTLY IF NOT EXISTS users_metadata_gin_idx 
        ON users USING gin(metadata) WHERE metadata IS NOT NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS stories_metadata_gin_idx 
        ON stories USING gin(metadata) WHERE metadata IS NOT NULL;
      
      CREATE INDEX CONCURRENTLY IF NOT EXISTS attachments_metadata_gin_idx 
        ON attachments USING gin(metadata) WHERE metadata IS NOT NULL;
    `)
    
    // Add database-level optimizations
    .raw(`
      -- Set up database optimization settings
      
      -- Update table statistics for better query planning
      ANALYZE users;
      ANALYZE stories;
      ANALYZE attachments;
      ANALYZE sessions;
      ANALYZE interests;
      ANALYZE tags;
      ANALYZE user_interests;
      ANALYZE story_tags;
      ANALYZE story_attachments;
      
      -- Create useful database functions
      
      -- Function to check if user has specific role
      CREATE OR REPLACE FUNCTION user_has_role(user_uuid UUID, required_role TEXT)
      RETURNS BOOLEAN
      LANGUAGE SQL
      STABLE
      AS $$
        SELECT EXISTS (
          SELECT 1 FROM users 
          WHERE id = user_uuid 
            AND role = required_role 
            AND "deletedAt" IS NULL 
            AND "isActive" = true
        );
      $$;
      
      -- Function to get active story count for user
      CREATE OR REPLACE FUNCTION get_user_active_story_count(user_uuid UUID)
      RETURNS INTEGER
      LANGUAGE SQL
      STABLE
      AS $$
        SELECT COUNT(*)::INTEGER FROM stories 
        WHERE "userId" = user_uuid 
          AND "deletedAt" IS NULL 
          AND status NOT IN ('ARCHIVED', 'DRAFT');
      $$;
      
      -- Function to clean old audit records
      CREATE OR REPLACE FUNCTION cleanup_old_audit_records(days_old INTEGER DEFAULT 365)
      RETURNS INTEGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        deleted_count INTEGER := 0;
      BEGIN
        -- Clean users audit
        DELETE FROM users_audit WHERE created_at < NOW() - INTERVAL '1 day' * days_old;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        
        -- Clean stories audit
        DELETE FROM stories_audit WHERE created_at < NOW() - INTERVAL '1 day' * days_old;
        GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
        
        -- Clean attachments audit
        DELETE FROM attachments_audit WHERE created_at < NOW() - INTERVAL '1 day' * days_old;
        GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
        
        -- Clean sessions audit
        DELETE FROM sessions_audit WHERE created_at < NOW() - INTERVAL '1 day' * days_old;
        GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
        
        -- Clean system audit
        DELETE FROM system_audit WHERE created_at < NOW() - INTERVAL '1 day' * days_old;
        GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
        
        RETURN deleted_count;
      END;
      $$;
    `)
}

exports.down = function(knex) {
  return knex.schema
    // Drop database functions
    .raw(`
      DROP FUNCTION IF EXISTS cleanup_old_audit_records(INTEGER);
      DROP FUNCTION IF EXISTS get_user_active_story_count(UUID);
      DROP FUNCTION IF EXISTS user_has_role(UUID, TEXT);
    `)
    
    // Drop performance indexes (PostgreSQL will handle this automatically when dropping constraints)
    .raw(`
      -- Drop custom indexes
      DROP INDEX CONCURRENTLY IF EXISTS users_metadata_gin_idx;
      DROP INDEX CONCURRENTLY IF EXISTS stories_metadata_gin_idx;
      DROP INDEX CONCURRENTLY IF EXISTS attachments_metadata_gin_idx;
      DROP INDEX CONCURRENTLY IF EXISTS system_audit_event_time_idx;
      DROP INDEX CONCURRENTLY IF EXISTS sessions_audit_record_time_idx;
      DROP INDEX CONCURRENTLY IF EXISTS attachments_audit_record_time_idx;
      DROP INDEX CONCURRENTLY IF EXISTS stories_audit_record_time_idx;
      DROP INDEX CONCURRENTLY IF EXISTS users_audit_record_time_idx;
      DROP INDEX CONCURRENTLY IF EXISTS story_attachments_attachment_idx;
      DROP INDEX CONCURRENTLY IF EXISTS story_attachments_story_idx;
      DROP INDEX CONCURRENTLY IF EXISTS story_tags_tag_idx;
      DROP INDEX CONCURRENTLY IF EXISTS story_tags_story_idx;
      DROP INDEX CONCURRENTLY IF EXISTS user_interests_interest_idx;
      DROP INDEX CONCURRENTLY IF EXISTS user_interests_user_idx;
      DROP INDEX CONCURRENTLY IF EXISTS tags_system_sort_idx;
      DROP INDEX CONCURRENTLY IF EXISTS tags_name_active_idx;
      DROP INDEX CONCURRENTLY IF EXISTS interests_name_active_idx;
      DROP INDEX CONCURRENTLY IF EXISTS sessions_last_activity_idx;
      DROP INDEX CONCURRENTLY IF EXISTS sessions_ip_address_idx;
      DROP INDEX CONCURRENTLY IF EXISTS sessions_expired_cleanup_idx;
      DROP INDEX CONCURRENTLY IF EXISTS sessions_user_active_idx;
      DROP INDEX CONCURRENTLY IF EXISTS attachments_created_at_idx;
      DROP INDEX CONCURRENTLY IF EXISTS attachments_size_idx;
      DROP INDEX CONCURRENTLY IF EXISTS attachments_mime_type_idx;
      DROP INDEX CONCURRENTLY IF EXISTS attachments_user_category_idx;
      DROP INDEX CONCURRENTLY IF EXISTS stories_details_search_idx;
      DROP INDEX CONCURRENTLY IF EXISTS stories_title_search_idx;
      DROP INDEX CONCURRENTLY IF EXISTS stories_time_range_idx;
      DROP INDEX CONCURRENTLY IF EXISTS stories_type_status_idx;
      DROP INDEX CONCURRENTLY IF EXISTS stories_status_created_idx;
      DROP INDEX CONCURRENTLY IF EXISTS stories_user_status_idx;
      DROP INDEX CONCURRENTLY IF EXISTS users_created_at_idx;
      DROP INDEX CONCURRENTLY IF EXISTS users_country_idx;
      DROP INDEX CONCURRENTLY IF EXISTS users_role_active_idx;
      DROP INDEX CONCURRENTLY IF EXISTS users_mobile_active_idx;
      DROP INDEX CONCURRENTLY IF EXISTS users_email_active_idx;
    `)
    
    // Remove constraints and foreign keys
    .alterTable('story_attachments', table => {
      table.dropUnique(['storyId', 'attachmentId'], 'story_attachments_unique')
      table.dropForeign(['attachmentId'])
      table.dropForeign(['storyId'])
    })
    
    .alterTable('story_tags', table => {
      table.dropUnique(['storyId', 'tagId'], 'story_tags_unique')
      table.dropForeign(['tagId'])
      table.dropForeign(['storyId'])
    })
    
    .alterTable('user_interests', table => {
      table.dropUnique(['userId', 'interestId'], 'user_interests_unique')
      table.dropForeign(['interestId'])
      table.dropForeign(['userId'])
    })
    
    .alterTable('sessions', table => {
      table.dropChecks('sessions_expiry_check')
      table.dropChecks('sessions_version_check')
      table.dropForeign(['userId'])
    })
    
    .alterTable('attachments', table => {
      table.dropChecks('attachments_version_check')
      table.dropChecks('attachments_size_check')
      table.dropForeign(['userId'])
    })
    
    .alterTable('stories', table => {
      table.dropChecks('stories_time_check')
      table.dropChecks('stories_version_check')
      table.dropForeign(['userId'])
    })
    
    .alterTable('users', table => {
      table.dropChecks('users_version_check')
      table.dropChecks('users_contact_check')
      table.dropForeign(['profileImageId'])
      table.dropForeign(['countryId'])
    })
}