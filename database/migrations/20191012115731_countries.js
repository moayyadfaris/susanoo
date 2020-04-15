
exports.up = function(knex) {
    return knex.schema
    .createTable('countries', table => {
      table.increments()
      table.specificType('iso', 'char(2)')
      .unique()
      .notNullable()
      table.string('name', 80).notNull()
      table.string('nicename', 80).notNull()
      table.specificType('iso3', 'char(3)')
      table.integer('numcode')
      table.integer('phonecode')
      table.boolean('isActive').defaultTo(true)
      table.timestamp('createdAt').defaultTo(knex.fn.now()).notNull()
      table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNull()
    })
};

exports.down = knex => knex.schema.dropTable('countries')
