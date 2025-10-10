exports.up = function (knex, Promise) {
  return knex.schema.table('users', function (table) {
    table.integer('profileImageId').references('id').inTable('attachments')
  })
}

exports.down = function (knex) {

}