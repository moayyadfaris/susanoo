
exports.up = function(knex) {
  return knex.schema
    .createTable('tags', table => {
      table.increments()

      table.string('name', 200).unique().notNull()
      table.uuid('createdBy').references('id').inTable('users').notNull()

      table.timestamp('createdAt').defaultTo(knex.fn.now()).notNull()
      table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNull()
    })
}

exports.down = knex => knex.schema.dropTable('tags')
