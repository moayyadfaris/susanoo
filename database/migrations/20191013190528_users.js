const roles = require('config').roles

exports.up = knex => {
  return knex.schema
    .raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    .createTable('users', table => {
      table.uuid('id').primary().notNullable().defaultTo(knex.raw('uuid_generate_v4()'))
      table.string('name', 50)
      table.text('bio')
      table.string('role').notNullable().defaultTo(roles.user)
      table.string('email', 50).notNullable()
      table.string('newEmail', 50)
      table.string('mobileNumber', 50).notNullable()
      table.string('newMobileNumber', 50)
      table.text('passwordHash').notNullable()
      table.text('resetPasswordToken')
      table.string('resetPasswordOTP')
      table.string('resetPasswordCode')
      table.boolean('isVerified').notNullable().defaultTo(false)
      table.string('verifyCode')
      table.text('updateToken')
      table.text('emailConfirmToken')
      table.boolean('isActive').notNullable().defaultTo(true)
      table.integer('countryId').references('id').inTable('countries')
      table.string('deviceId').unique()
      table.string('preferredLanguage')
      table.boolean('isConfirmedRegistration').notNullable().defaultTo(false)
      table.integer('profileImageId')

      // Extended registration and compliance tracking
      table.timestamp('lastLogoutAt')
      table.string('referralCode', 20).unique()
      table.timestamp('acceptedTermsAt')
      table.timestamp('acceptedPrivacyAt')
      table.boolean('marketingConsent').notNullable().defaultTo(false)
      table.timestamp('verifyCodeSentAt')

      // Audit and lifecycle metadata
      table.uuid('createdBy')
      table.uuid('updatedBy')
      table.uuid('deletedBy')
      table.timestamp('deletedAt')

      // Password lifecycle tracking
      table.timestamp('passwordChangedAt')
      table.enu('passwordChangeReason', [
        'user_request',
        'scheduled_rotation',
        'security_incident',
        'compliance_requirement',
        'admin_forced',
        'breach_detected',
        'first_login'
      ], {
        useNative: true,
        enumName: 'password_change_reason_enum'
      }).nullable().defaultTo('user_request')
      table.uuid('passwordChangeBy').references('id').inTable('users').onDelete('SET NULL')
      table.integer('passwordStrengthScore')
      table.string('lastPasswordChangeIp', 45)
      table.boolean('forcePasswordChangeOnLogin').notNullable().defaultTo(false)

      // Structured metadata
      table.jsonb('metadata')
      table.integer('version').notNullable().defaultTo(1)

      table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now())
      table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now())

      table.unique(['email'])
      table.unique(['newEmail'])
      table.unique(['mobileNumber'])

      table.index(['deletedAt'], 'users_deleted_at_idx')
      table.index(['createdBy'], 'users_created_by_idx')
      table.index(['updatedBy'], 'users_updated_by_idx')
      table.index(['version'], 'users_version_idx')
      table.index(['passwordChangedAt'], 'idx_users_password_changed_at')
      table.index(['passwordChangeReason'], 'idx_users_password_change_reason')
      table.index(['forcePasswordChangeOnLogin'], 'idx_users_force_password_change')
    })
    .then(() => knex.raw(`
      ALTER TABLE "users"
      ADD CONSTRAINT password_strength_score_check
      CHECK ("passwordStrengthScore" IS NULL OR ("passwordStrengthScore" >= 0 AND "passwordStrengthScore" <= 100))
    `))
    .then(() => knex.raw(`
      ALTER TABLE "users"
      ADD CONSTRAINT users_version_check
      CHECK ("version" >= 1)
    `))
    .then(() => knex.raw(`
      CREATE INDEX IF NOT EXISTS users_deleted_at_perf_idx
      ON "users" ("deletedAt")
      WHERE "deletedAt" IS NULL
    `))
    .then(() => knex.raw(`
      CREATE INDEX IF NOT EXISTS users_active_perf_idx
      ON "users" ("isActive")
      WHERE "isActive" = true
    `))
}

exports.down = knex => {
  return knex.schema.dropTableIfExists('users')
    .then(() => knex.raw('DROP TYPE IF EXISTS "password_change_reason_enum"'))
    .then(() => knex.raw('DROP EXTENSION IF EXISTS "uuid-ossp"'))
}
