/**
 * Remove legacy sessions.ip column now that ipAddress is the source of truth.
 */

exports.up = async function removeLegacySessionIp(knex) {
  const indexName = 'idx_sessions_ip'

  try {
    const indexResult = await knex.raw(
      `
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'sessions' AND indexname = ?
      `,
      [indexName]
    )

    if (indexResult.rows.length > 0) {
      await knex.schema.alterTable('sessions', table => {
        table.dropIndex(['ip'], indexName)
      })
    }
  } catch (error) {
    // Proceed even if index lookup fails; column drop will handle residual state.
  }

  const hasIpColumn = await knex.schema.hasColumn('sessions', 'ip')
  if (hasIpColumn) {
    await knex.schema.alterTable('sessions', table => {
      table.dropColumn('ip')
    })
  }
}

exports.down = async function restoreLegacySessionIp(knex) {
  const hasIpColumn = await knex.schema.hasColumn('sessions', 'ip')
  if (!hasIpColumn) {
    await knex.schema.alterTable('sessions', table => {
      table.string('ip', 15).notNullable().defaultTo('0.0.0.0')
    })
  }

  const indexName = 'idx_sessions_ip'
  try {
    const indexResult = await knex.raw(
      `
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'sessions' AND indexname = ?
      `,
      [indexName]
    )

    if (indexResult.rows.length === 0) {
      await knex.schema.alterTable('sessions', table => {
        table.index(['ip'], indexName)
      })
    }
  } catch (error) {
    // Ignore index recreation errors during rollback.
  }
}
