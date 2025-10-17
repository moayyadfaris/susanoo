/**
 * Migration: Add Enterprise Country Fields
 * 
 * Adds enhanced fields to the countries table to support enterprise-grade
 * country management including currency, geographic, and metadata information.
 */

exports.up = async (knex) => {
  return knex.schema.alterTable('countries', (table) => {
    // Currency information
    table.string('currencyCode', 3).nullable()
      .comment('ISO 4217 currency code (e.g., USD, EUR)')
    
    table.string('currencyName', 50).nullable()
      .comment('Currency name (e.g., US Dollar)')
    
    table.string('currencySymbol', 5).nullable()
      .comment('Currency symbol (e.g., $, €)')
    
    // Geographic and regional information
    table.string('timezone', 50).nullable()
      .comment('IANA timezone identifier (e.g., America/New_York)')
    
    table.string('continent', 30).nullable()
      .comment('Continental classification')
    
    table.string('region', 50).nullable()
      .comment('Regional classification')
    
    table.string('capital', 80).nullable()
      .comment('Capital city name')
    
    // Geographic coordinates
    table.decimal('latitude', 10, 8).nullable()
      .comment('Geographic latitude (-90 to 90)')
    
    table.decimal('longitude', 11, 8).nullable()
      .comment('Geographic longitude (-180 to 180)')
    
    // Demographics and statistics
    table.bigInteger('population').nullable()
      .comment('Population count')
    
    table.decimal('area', 12, 2).nullable()
      .comment('Area in square kilometers')
    
    // Language support
    table.text('languages').nullable()
      .comment('JSON array of ISO 639-1 language codes')
    
    // Additional metadata
    table.text('metadata').nullable()
      .comment('JSON metadata for additional country information')
    
    // Add indexes for performance
    table.index(['currencyCode'], 'idx_countries_currency')
    table.index(['continent'], 'idx_countries_continent')
    table.index(['region'], 'idx_countries_region')
    table.index(['isActive'], 'idx_countries_active')
    table.index(['latitude', 'longitude'], 'idx_countries_coordinates')
  })
}

exports.down = async (knex) => {
  return knex.schema.alterTable('countries', (table) => {
    // Remove indexes first
    table.dropIndex(['currencyCode'], 'idx_countries_currency')
    table.dropIndex(['continent'], 'idx_countries_continent')
    table.dropIndex(['region'], 'idx_countries_region')
    table.dropIndex(['isActive'], 'idx_countries_active')
    table.dropIndex(['latitude', 'longitude'], 'idx_countries_coordinates')
    
    // Remove columns
    table.dropColumn('currencyCode')
    table.dropColumn('currencyName')
    table.dropColumn('currencySymbol')
    table.dropColumn('timezone')
    table.dropColumn('continent')
    table.dropColumn('region')
    table.dropColumn('capital')
    table.dropColumn('latitude')
    table.dropColumn('longitude')
    table.dropColumn('population')
    table.dropColumn('area')
    table.dropColumn('languages')
    table.dropColumn('metadata')
  })
}