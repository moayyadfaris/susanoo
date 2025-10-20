exports.up = knex => {
  return knex.schema.createTable('sessions', table => {
    table.increments('id')
    table.uuid('userId').references('id').inTable('users').onDelete('CASCADE')
    table.uuid('refreshToken').notNullable()
    table.string('ua', 500)
    table.string('userAgent', 500)
    table.string('fingerprint', 200).notNullable()
    table.string('deviceFingerprint', 200)
    table.string('ip', 45)
    table.string('ipAddress', 45)
    table.bigInteger('expiredAt').notNullable()

    table.string('securityLevel', 20).defaultTo('low').notNullable()
    table.string('sessionType', 30).defaultTo('standard').notNullable()
    table.boolean('isActive').notNullable().defaultTo(true)
    table.timestamp('lastActivity')
    table.timestamp('lastActivityAt')

    table.jsonb('metadata')
    table.jsonb('deviceInfo')

    table.uuid('createdBy')
    table.uuid('updatedBy')
    table.uuid('deletedBy')
    table.timestamp('deletedAt')
    table.integer('version').notNullable().defaultTo(1)

    table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now())

    table.unique(['refreshToken'])
    table.index(['userId', 'securityLevel'], 'idx_sessions_user_security')
    table.index(['sessionType'], 'idx_sessions_type')
    table.index(['expiredAt'], 'idx_sessions_expiry')
    table.index(['ipAddress'], 'idx_sessions_ip_address')
    table.index(['deletedAt'], 'sessions_deleted_at_idx')
    table.index(['createdBy'], 'sessions_created_by_idx')
    table.index(['updatedBy'], 'sessions_updated_by_idx')
    table.index(['version'], 'sessions_version_idx')
    table.index(['isActive'], 'sessions_is_active_idx')
    table.index(['lastActivity'], 'sessions_last_activity_idx')
  })
}

exports.down = knex => {
  return knex.schema.dropTableIfExists('sessions')
}
