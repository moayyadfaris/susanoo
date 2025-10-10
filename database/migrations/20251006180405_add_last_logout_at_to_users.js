/**
 * Migration: Add lastLogoutAt column to users table
 * 
 * This migration adds a timestamp column to track when users last logged out.
 * This is useful for security auditing, session management, and user analytics.
 * 
 * @description Add lastLogoutAt timestamp column to users table
 * @author System
 * @date 2025-10-06
 */

exports.up = function (knex, Promise) {
  return knex.schema.table('users', function (table) {
    // Add lastLogoutAt timestamp column
    table.timestamp('lastLogoutAt').nullable().comment('Timestamp of user\'s last logout')
    
    console.log('✅ Added lastLogoutAt column to users table')
  })
}

exports.down = function (knex, Promise) {
  return knex.schema.table('users', function (table) {
    // Remove lastLogoutAt column
    table.dropColumn('lastLogoutAt')
    
    console.log('✅ Removed lastLogoutAt column from users table')
  })
}