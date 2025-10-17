exports.up = async (knex) => {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

  await knex.schema.dropTableIfExists('settings')

  await knex.schema.createTable('runtime_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('namespace', 100).notNullable()
    table.string('key', 150).notNullable()
    table.jsonb('value').notNullable().defaultTo(knex.raw("'{}'::jsonb"))
    table.string('platform', 30).defaultTo('all')
    table.string('environment', 50).defaultTo('production')
    table.string('channel', 100)
    table.string('minVersion', 50)
    table.integer('minVersionCode')
    table.string('maxVersion', 50)
    table.integer('maxVersionCode')
    table.integer('priority').notNullable().defaultTo(0)
    table.string('status', 30).notNullable().defaultTo('draft')
    table.timestamp('effectiveAt').defaultTo(knex.fn.now())
    table.timestamp('expiresAt')
    table.jsonb('rolloutStrategy')
    table.string('checksum', 255)
    table.jsonb('metadata').defaultTo(knex.raw("'{}'::jsonb"))
    table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now())
    table.string('createdBy')
    table.string('updatedBy')
    table.timestamp('deletedAt')
    table.string('deletedBy')
    table.integer('version').notNullable().defaultTo(1)

    table.index(['namespace', 'status'], 'runtime_settings_namespace_status_idx')
    table.index(['environment', 'platform'], 'runtime_settings_env_platform_idx')
    table.index(['minVersionCode', 'maxVersionCode'], 'runtime_settings_version_range_idx')
  })

  await knex.schema.alterTable('runtime_settings', (table) => {
    table.unique(['namespace', 'key', 'environment', 'platform', 'channel'], 'runtime_settings_scope_unique')
  })

  await knex('runtime_settings').insert([
    {
      namespace: 'client_release',
      key: 'minimum_supported_version',
      value: {
        ios: '2.0.0',
        android: '2.0.0',
        message: 'Please update the app to continue using all features.'
      },
      platform: 'all',
      status: 'published',
      environment: 'production',
      minVersion: '0.0.0',
      minVersionCode: 0,
      priority: 100,
      checksum: 'seed',
      metadata: { seeded: true }
    },
    {
      namespace: 'feature_flags',
      key: 'new_home_feed',
      value: {
        enabled: false,
        description: 'Controls rollout of the redesigned home feed.'
      },
      platform: 'all',
      status: 'draft',
      environment: 'production',
      priority: 10,
      checksum: 'seed',
      metadata: { seeded: true }
    }
  ])
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('runtime_settings')

  await knex.schema.createTable('settings', (table) => {
    table.increments()
    table.string('key').notNullable()
    table.string('value').notNullable()
    table.timestamp('createdAt').defaultTo(knex.fn.now()).notNullable()
    table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNullable()
  })
}
