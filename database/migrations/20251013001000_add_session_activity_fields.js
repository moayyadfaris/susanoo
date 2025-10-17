/**
 * Add session activity tracking fields
 *
 * - lastActivityAt: timestamp to capture recent activity
 * - deviceInfo: JSON payload for merged device metadata
 *
 * Designed to be idempotent (will skip if columns already exist).
 */

exports.up = async function addSessionActivityFields(knex) {
  const hasLastActivityAt = await knex.schema.hasColumn('sessions', 'lastActivityAt')
  const hasDeviceInfo = await knex.schema.hasColumn('sessions', 'deviceInfo')

  await knex.schema.alterTable('sessions', table => {
    if (!hasLastActivityAt) {
      table.timestamp('lastActivityAt').nullable()
    }
    if (!hasDeviceInfo) {
      table.jsonb('deviceInfo').nullable()
    }
  })

  if (!hasLastActivityAt) {
    await knex('sessions')
      .update({
        lastActivityAt: knex.raw('COALESCE("lastActivity", "updatedAt", "createdAt")')
      })
  }
}

exports.down = async function removeSessionActivityFields(knex) {
  const hasLastActivityAt = await knex.schema.hasColumn('sessions', 'lastActivityAt')
  const hasDeviceInfo = await knex.schema.hasColumn('sessions', 'deviceInfo')

  await knex.schema.alterTable('sessions', table => {
    if (hasLastActivityAt) {
      table.dropColumn('lastActivityAt')
    }
    if (hasDeviceInfo) {
      table.dropColumn('deviceInfo')
    }
  })
}
