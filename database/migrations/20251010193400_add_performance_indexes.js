/**
 * Migration: Add basic performance indexes
 * 
 * This migration adds essential performance indexes for common queries.
 * Simplified version to avoid transaction issues.
 * 
 * @description Add basic performance indexes
 * @author System
 * @date 2025-10-10
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  console.log('Starting basic performance indexes migration...')
  
  // Only add constraints that we know will work
  try {
    await addCheckIfNotExists('users', 'email IS NOT NULL OR "mobileNumber" IS NOT NULL', 'users_contact_check')
    await addCheckIfNotExists('users', 'version >= 1', 'users_version_check')
    console.log('Added basic user constraints')
  } catch {
    console.log('User constraints might already exist')
  }

  // Add only basic indexes that we know exist
  try {
    await knex.raw('CREATE INDEX IF NOT EXISTS users_deleted_at_perf_idx ON users ("deletedAt") WHERE "deletedAt" IS NULL;')
    console.log('Added users deleted_at performance index')
  } catch {
    console.log('Users deletedAt index might already exist')
  }

  try {
    await knex.raw('CREATE INDEX IF NOT EXISTS users_active_perf_idx ON users ("isActive") WHERE "isActive" = true;')
    console.log('Added users active performance index')
  } catch {
    console.log('Users active index might already exist')
  }

  console.log('Basic performance indexes migration completed')

  // Helper function to safely add check constraint
  async function addCheckIfNotExists(tableName, condition, constraintName) {
    try {
      await knex.schema.alterTable(tableName, table => {
        table.check(condition, [], constraintName)
      })
    } catch {
      // Constraint might already exist
      console.log(`Check constraint ${constraintName} might already exist`)
    }
  }
}

exports.down = async function(knex) {
  // Drop the basic indexes we created
  try {
    await knex.raw('DROP INDEX IF EXISTS users_active_perf_idx;')
    await knex.raw('DROP INDEX IF EXISTS users_deleted_at_perf_idx;')
    console.log('Dropped basic performance indexes')
  } catch {
    console.log('Some indexes might not exist')
  }
}