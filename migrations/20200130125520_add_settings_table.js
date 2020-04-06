
exports.up = function(knex) {
  return knex.schema
    .createTable('settings', table => {
      table.increments()
      table.string('key').notNull()
      table.string('value').notNull()
      table.timestamp('createdAt').defaultTo(knex.fn.now()).notNull()
      table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNull()
    })
};

exports.down = knex => knex.schema.dropTable('settings')
