
exports.up = function(knex) {
  return knex.schema
    .createTable('story_attachments', table => {
      table.integer('storyId').references('id').inTable('stories').onDelete('CASCADE')
      table.integer('attachmentId').references('id').inTable('attachments').onDelete('CASCADE')
      table.unique(['storyId', 'attachmentId'])
      table.timestamp('createdAt').defaultTo(knex.fn.now()).notNull()
      table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNull()
    })
}

exports.down = knex => knex.schema.dropTable('story_attachments')
