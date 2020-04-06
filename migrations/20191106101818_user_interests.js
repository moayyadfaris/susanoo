
exports.up = function(knex) {
    return knex.schema
    .createTable('user_interests', table => {
      table.uuid('userId').references('id').inTable('users').onDelete('CASCADE')
      table.integer('interestId').references('id').inTable('interests').onDelete('CASCADE')
      table.unique(['userId', 'interestId'])
      table.timestamp('createdAt').defaultTo(knex.fn.now()).notNull()
      table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNull()
    })
};

exports.down = knex => knex.schema.dropTable('user_interests')
