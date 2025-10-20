
exports.up = knex => {
  return knex.schema.createTable('interests', table => {
    table.increments('id')
    table.string('name', 200).notNullable()
    table.uuid('createdBy')
    table.uuid('updatedBy')
    table.uuid('deletedBy')
    table.timestamp('deletedAt')
    table.jsonb('metadata')
    table.integer('version').notNullable().defaultTo(1)

    table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now())

    table.index(['deletedAt'], 'interests_deleted_at_idx')
    table.index(['createdBy'], 'interests_created_by_idx')
    table.index(['updatedBy'], 'interests_updated_by_idx')
    table.index(['version'], 'interests_version_idx')
  })
}

exports.down = knex => {
  return knex.schema.dropTableIfExists('interests')
}
