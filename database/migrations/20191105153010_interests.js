
exports.up = function(knex) {
  return knex.schema
    .createTable('interests', table => {
      table.increments()
      table.string('name', 200).notNull()

      table.timestamp('createdAt').defaultTo(knex.fn.now()).notNull()
      table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNull()
    })
}

exports.down = knex => knex.schema.dropTable('intrests')
