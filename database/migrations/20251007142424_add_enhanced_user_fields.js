/**
 * Migration: Add enhanced user fields for comprehensive user registration
 * 
 * This migration adds fields to support:
 * - Referral system with unique referral codes
 * - Terms and privacy policy acceptance tracking
 * - Marketing consent management
 * - Verification code timestamp tracking
 * - Rich metadata storage for registration details
 * 
 * @description Add enhanced user registration fields
 * @author System
 * @date 2025-10-07
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('users', function (table) {
    // Referral system
    table.string('referralCode', 20).unique().nullable()
      .comment('Unique referral code for this user')
    
    // Terms and privacy acceptance tracking
    table.timestamp('acceptedTermsAt').nullable()
      .comment('Timestamp when user accepted terms and conditions')
    
    table.timestamp('acceptedPrivacyAt').nullable()
      .comment('Timestamp when user accepted privacy policy')
    
    // Marketing and communication preferences
    table.boolean('marketingConsent').defaultTo(false).notNull()
      .comment('User consent for marketing communications')
    
    // Verification tracking
    table.timestamp('verifyCodeSentAt').nullable()
      .comment('Timestamp when verification code was last sent')
    
    // Rich metadata storage (JSON)
    table.json('metadata').nullable()
      .comment('Registration metadata including IP, device info, etc.')
    
    console.log('✅ Added enhanced user fields: referralCode, acceptedTermsAt, acceptedPrivacyAt, marketingConsent, verifyCodeSentAt, metadata')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('users', function (table) {
    // Remove enhanced user fields in reverse order
    table.dropColumn('metadata')
    table.dropColumn('verifyCodeSentAt')
    table.dropColumn('marketingConsent')
    table.dropColumn('acceptedPrivacyAt')
    table.dropColumn('acceptedTermsAt')
    table.dropColumn('referralCode')
    
    console.log('✅ Removed enhanced user fields')
  })
}
