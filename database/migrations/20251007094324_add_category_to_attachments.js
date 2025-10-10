/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('attachments', table => {
    table.string('category', 50).nullable().after('originalName')
      .comment('File category for organization (e.g., profile_image, document, etc.)')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('attachments', table => {
    table.dropColumn('category')
  })
}
