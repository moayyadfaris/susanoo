/**
 * Migration: Create editors table if it does not exist.
 * The StoryDAO relationMappings reference an editors table. In environments
 * that haven't run the enterprise migrations yet, that table may be missing,
 * causing runtime errors when Objection resolves the relation.
 */

exports.up = async function up (knex) {
  const exists = await knex.schema.hasTable('editors')
  if (!exists) {
    await knex.schema.createTable('editors', table => {
      table.increments('id').primary()
      table.integer('storyId').unsigned().notNullable()
        .references('id').inTable('stories')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')
      table.uuid('userId').notNullable()
        .references('id').inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')
      table.boolean('isActive').notNullable().defaultTo(true)
      table.timestamp('assignedAt').notNullable().defaultTo(knex.fn.now())
      table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now())
      table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now())

      table.unique(['storyId', 'userId'])
      table.index(['storyId', 'isActive'])
    })
  }
}

exports.down = async function down (knex) {
  const exists = await knex.schema.hasTable('editors')
  if (exists) {
    await knex.schema.dropTable('editors')
  }
}
