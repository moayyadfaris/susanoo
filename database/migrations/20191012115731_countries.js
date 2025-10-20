
exports.up = function(knex) {
  return knex.schema.createTable('countries', table => {
    table.increments('id')
    table.specificType('iso', 'char(2)').notNullable().unique()
    table.string('name', 80).notNullable()
    table.string('nicename', 80).notNullable()
    table.specificType('iso3', 'char(3)')
    table.integer('numcode')
    table.integer('phonecode')

    // Enterprise extensions
    table.string('currencyCode', 3).nullable()
    table.string('currencyName', 50).nullable()
    table.string('currencySymbol', 5).nullable()
    table.string('timezone', 50).nullable()
    table.string('continent', 30).nullable()
    table.string('region', 50).nullable()
    table.string('capital', 80).nullable()
    table.decimal('latitude', 10, 8).nullable()
    table.decimal('longitude', 11, 8).nullable()
    table.bigInteger('population').nullable()
    table.decimal('area', 12, 2).nullable()
    table.text('languages').nullable()
    table.text('metadata').nullable()

    table.boolean('isActive').defaultTo(true).notNullable()
    table.timestamp('createdAt').defaultTo(knex.fn.now()).notNullable()
    table.timestamp('updatedAt').defaultTo(knex.fn.now()).notNullable()

    table.index(['currencyCode'], 'idx_countries_currency')
    table.index(['continent'], 'idx_countries_continent')
    table.index(['region'], 'idx_countries_region')
    table.index(['isActive'], 'idx_countries_active')
    table.index(['latitude', 'longitude'], 'idx_countries_coordinates')
  })
}

exports.down = function(knex) {
  return knex.schema.dropTable('countries')
}
