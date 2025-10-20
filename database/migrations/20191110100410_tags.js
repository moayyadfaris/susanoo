
exports.up = knex => {
  return knex.schema.createTable('tags', table => {
    table.increments('id')
    table.string('name', 200).notNullable().unique()
    table.uuid('createdBy').references('id').inTable('users').notNullable()
    table.uuid('updatedBy')
    table.uuid('deletedBy')
    table.timestamp('deletedAt')
    table.jsonb('metadata')
    table.string('color', 7)
    table.integer('sortOrder').notNullable().defaultTo(0)
    table.boolean('isSystem').notNullable().defaultTo(false)
    table.integer('version').notNullable().defaultTo(1)

    table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now())

    table.index(['deletedAt'], 'tags_deleted_at_idx')
    table.index(['createdBy'], 'tags_created_by_idx')
    table.index(['updatedBy'], 'tags_updated_by_idx')
    table.index(['version'], 'tags_version_idx')
    table.index(['isSystem'], 'tags_is_system_idx')
    table.index(['sortOrder'], 'tags_sort_order_idx')
  })
}

exports.down = knex => {
  return knex.schema.dropTableIfExists('tags')
}
