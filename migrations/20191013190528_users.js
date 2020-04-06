require('../globals')()
const roles = require(__folders.config).roles

exports.up = (knex, Promise) => {
  return knex.schema
    .raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    .createTable('users', table => {
      table.uuid('id', 36).unsigned().primary().notNull().defaultTo(knex.raw('uuid_generate_v4()'))
      table.string('name', 50)
      table.text('bio')
      table.string('role').defaultTo(roles.user).notNull()
      table.string('email', 50).unique().notNull()
      table.string('newEmail', 50).unique()
      table.string('mobileNumber', 50).unique().notNull()
      table.string('newMobileNumber', 50)
      table.text('passwordHash').notNull()
      table.text('resetPasswordToken')
      table.string('resetPasswordOTP')
      table.string('resetPasswordCode')
      table.boolean('isVerified').notNull().defaultTo(false)
      table.string('verifyCode');
      table.text('updateToken');
      table.text('emailConfirmToken')
      table.boolean('isActive').defaultTo(true)
      table.integer('countryId').references('id').inTable('countries')
      table.string('deviceId').unique()
      table.string('preferredLanguage')
      table.boolean('isConfirmedRegistration').defaultTo(false).notNull()

      table.timestamp('createdAt').defaultTo(knex.fn.now()).notNull()
      table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNull()


    })
}

exports.down = knex => {
  return knex.schema.dropTable('users').then(() => knex.raw('drop extension if exists "uuid-ossp"'))
}
