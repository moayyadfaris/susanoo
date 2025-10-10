exports.up = function(knex) {
  return knex.schema
    .createTable('attachments', table => {
      table.increments()
      table.uuid('userId').references('id').inTable('users').onDelete('CASCADE')
      table.string('path')
      table.string('mimeType')
      table.integer('size')
      table.string('originalName')
      table.timestamp('createdAt').defaultTo(knex.fn.now()).notNull()
      table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNull()
    })
}

exports.down = knex => knex.schema.dropTable('attachments')


