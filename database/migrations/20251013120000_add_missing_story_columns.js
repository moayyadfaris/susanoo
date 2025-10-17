/**
 * Migration: Add missing enterprise story columns.
 *
 * The application expects the stories table to include fields such as
 * priority, isInEditMode, version, metadata, etc.  In environments where
 * earlier enterprise migrations were not applied, inserts currently fail.
 * This migration patches the table defensively, only adding columns that
 * are not already present.
 */

exports.up = async function up (knex) {
  await ensureColumn(knex, 'stories', 'priority', table => {
    table.string('priority', 16).notNullable().defaultTo('NORMAL')
  })

  await ensureColumn(knex, 'stories', 'isInEditMode', table => {
    table.boolean('isInEditMode').notNullable().defaultTo(false)
  })

  await ensureColumn(knex, 'stories', 'version', table => {
    table.integer('version').notNullable().defaultTo(1)
  })

  await ensureColumn(knex, 'stories', 'metadata', table => {
    table.jsonb('metadata').nullable()
  })

  await ensureColumn(knex, 'stories', 'internalNotes', table => {
    table.text('internalNotes').nullable()
  })

  await ensureColumn(knex, 'stories', 'deletedAt', table => {
    table.timestamp('deletedAt').nullable()
  })

  await ensureColumn(knex, 'stories', 'deletedBy', table => {
    table.uuid('deletedBy').nullable()
  })
}

exports.down = async function down (knex) {
  await dropColumnIfExists(knex, 'stories', 'deletedBy')
  await dropColumnIfExists(knex, 'stories', 'deletedAt')
  await dropColumnIfExists(knex, 'stories', 'internalNotes')
  await dropColumnIfExists(knex, 'stories', 'metadata')
  await dropColumnIfExists(knex, 'stories', 'version')
  await dropColumnIfExists(knex, 'stories', 'isInEditMode')
  await dropColumnIfExists(knex, 'stories', 'priority')
}

async function ensureColumn (knex, tableName, columnName, columnBuilder) {
  const exists = await knex.schema.hasColumn(tableName, columnName)
  if (!exists) {
    await knex.schema.alterTable(tableName, columnBuilder)
  }
}

async function dropColumnIfExists (knex, tableName, columnName) {
  const exists = await knex.schema.hasColumn(tableName, columnName)
  if (exists) {
    await knex.schema.alterTable(tableName, table => {
      table.dropColumn(columnName)
    })
  }
}
