
exports.up = function(knex) {
    return knex.schema
    .createTable('story_tags', table => {
      table.integer('storyId').references('id').inTable('stories').onDelete('CASCADE')
      table.integer('tagId').references('id').inTable('tags').onDelete('CASCADE')
      table.unique(['storyId', 'tagId'])
      table.timestamp('createdAt').defaultTo(knex.fn.now()).notNull()
      table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNull()
    })
};

exports.down = knex => knex.schema.dropTable('story_tags')
