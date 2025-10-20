exports.up = knex => {
  return knex.schema.createTable('stories', table => {
    table.increments('id')
    table.string('title', 200).notNullable()
    table.text('details')
    table.string('type', 50).notNullable().defaultTo('STORY')
    table.uuid('userId').references('id').inTable('users').onDelete('SET NULL')
    table.string('status', 50).notNullable().defaultTo('DRAFT')
    table.timestamp('fromTime')
    table.timestamp('toTime')

    table.string('priority', 16).notNullable().defaultTo('NORMAL')
    table.boolean('isInEditMode').notNullable().defaultTo(false)
    table.integer('parentId').references('id').inTable('stories').onDelete('SET NULL')

    table.jsonb('metadata')
    table.text('internalNotes')

    table.uuid('createdBy')
    table.uuid('updatedBy')
    table.uuid('deletedBy')
    table.timestamp('deletedAt')
    table.uuid('lastModifiedBy').references('id').inTable('users').onDelete('SET NULL')
    table.integer('version').notNullable().defaultTo(1)

    table.decimal('latitude', 10, 8)
    table.decimal('longitude', 11, 8)
    table.string('address', 255)
    table.string('city', 100)
    table.string('region', 100)
    table.integer('countryId').references('id').inTable('countries')

    table.string('deletionReason', 255)

    table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now())

    table.index(['deletedAt'], 'stories_deleted_at_idx')
    table.index(['createdBy'], 'stories_created_by_idx')
    table.index(['updatedBy'], 'stories_updated_by_idx')
    table.index(['version'], 'stories_version_idx')
    table.index(['status'], 'stories_status_idx')
    table.index(['priority'], 'stories_priority_idx')
    table.index(['userId'], 'stories_user_id_idx')
    table.index(['countryId'], 'stories_country_id_idx')
  })
}

exports.down = knex => {
  return knex.schema.dropTableIfExists('stories')
}
