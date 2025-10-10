exports.up = function(knex) {
  return knex.schema
    .createTable('stories', table => {
      table.increments()
      table.string('title',200).notNull()
      table.text('details')
      table.string('type',200)
      table.uuid('userId').references('id').inTable('users')
      table.string('status',200).notNull()
      table.timestamp('fromTime')
      table.timestamp('toTime')
      table.timestamp('createdAt').defaultTo(knex.fn.now()).notNull()
      table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNull()
    })
}

exports.down = knex => knex.schema.dropTable('stories')
