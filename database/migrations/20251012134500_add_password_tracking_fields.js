/**
 * Migration: Add Password Tracking Fields
 * 
 * Adds enterprise-grade password tracking and security fields to the users table:
 * - passwordChangedAt: Timestamp when password was last changed
 * - passwordChangeReason: Reason for password change (audit compliance)
 * - passwordChangeBy: User ID who initiated the password change (for admin changes)
 * - passwordStrengthScore: Calculated strength score of the password (0-100)
 * - lastPasswordChangeIp: IP address from which password was changed
 * - forcePasswordChangeOnLogin: Flag to force password change on next login
 * 
 * @author System Enhancement
 * @date 2025-10-12
 */

exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    // Password change timestamp
    table.timestamp('passwordChangedAt')
      .nullable()
      .comment('Timestamp when password was last changed')
    
    // Password change reason for audit compliance
    table.enum('passwordChangeReason', [
      'user_request',
      'scheduled_rotation',
      'security_incident', 
      'compliance_requirement',
      'admin_forced',
      'breach_detected',
      'first_login'
    ])
      .nullable()
      .defaultTo('user_request')
      .comment('Reason for password change - audit compliance')
    
    // User who initiated the password change (for admin-initiated changes)
    table.uuid('passwordChangeBy')
      .nullable()
      .references('id').inTable('users')
      .onDelete('SET NULL')
      .comment('User ID who initiated the password change')
    
    // Password strength score (0-100)
    table.integer('passwordStrengthScore')
      .nullable()
      .checkBetween([0, 100])
      .comment('Calculated password strength score (0-100)')
    
    // IP address from which password was changed
    table.string('lastPasswordChangeIp', 45)
      .nullable()
      .comment('IP address from which password was last changed (supports IPv6)')
    
    // Force password change on next login
    table.boolean('forcePasswordChangeOnLogin')
      .notNullable()
      .defaultTo(false)
      .comment('Flag to force password change on next login')
    
    // Add indexes for performance
    table.index('passwordChangedAt', 'idx_users_password_changed_at')
    table.index('passwordChangeReason', 'idx_users_password_change_reason')
    table.index('forcePasswordChangeOnLogin', 'idx_users_force_password_change')
  })
}

exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    // Drop indexes first
    table.dropIndex('passwordChangedAt', 'idx_users_password_changed_at')
    table.dropIndex('passwordChangeReason', 'idx_users_password_change_reason')
    table.dropIndex('forcePasswordChangeOnLogin', 'idx_users_force_password_change')
    
    // Drop columns
    table.dropColumn('passwordChangedAt')
    table.dropColumn('passwordChangeReason')
    table.dropColumn('passwordChangeBy')
    table.dropColumn('passwordStrengthScore')
    table.dropColumn('lastPasswordChangeIp')
    table.dropColumn('forcePasswordChangeOnLogin')
  })
}