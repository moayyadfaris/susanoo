exports.up = async (knex) => {
  await knex.schema.createTable('categories', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name', 120).notNullable()
    table.string('slug', 140).notNullable().unique()
    table.string('description', 500)
    table.boolean('isActive').defaultTo(true)
    table.jsonb('metadata').defaultTo(knex.raw("'{}'::jsonb"))
    table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now())
    table.timestamp('deletedAt')
    table.string('createdBy')
    table.string('updatedBy')
    table.string('deletedBy')
    table.integer('version').notNullable().defaultTo(1)
  })

  await knex.schema.createTable('story_categories', (table) => {
    table.integer('storyId').notNullable()
    table.uuid('categoryId').notNullable()
    table.primary(['storyId', 'categoryId'])
    table.foreign('storyId').references('stories.id').onDelete('CASCADE')
    table.foreign('categoryId').references('categories.id').onDelete('CASCADE')
    table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now())
    table.string('createdBy')
  })

  await knex.schema.alterTable('categories', (table) => {
    table.index(['isActive'], 'categories_is_active_idx')
    table.index(['slug'], 'categories_slug_idx')
  })
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('story_categories')
  await knex.schema.dropTableIfExists('categories')
}
