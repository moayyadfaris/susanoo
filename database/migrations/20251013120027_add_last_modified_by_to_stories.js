/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up (knex) {
  const hasColumn = await knex.schema.hasColumn('stories', 'lastModifiedBy')
  if (!hasColumn) {
    await knex.schema.alterTable('stories', table => {
      table.uuid('lastModifiedBy').nullable()
        .references('id').inTable('users')
        .onDelete('SET NULL')
        .onUpdate('CASCADE')
    })
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down (knex) {
  const hasColumn = await knex.schema.hasColumn('stories', 'lastModifiedBy')
  if (hasColumn) {
    await knex.schema.alterTable('stories', table => {
      table.dropColumn('lastModifiedBy')
    })
  }
}
