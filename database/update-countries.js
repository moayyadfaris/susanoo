/**
 * Update existing countries with enterprise data
 * This script updates the countries table with enhanced metadata without deleting existing records
 */

require('dotenv').config()
const knex = require('knex')
const config = require('../knexfile')
const enhancedCountries = require('./data/enhancedCountries')

const db = knex(config.development || config)

async function updateCountries() {
  try {
    console.log('Starting country data update...')
    
    for (const countryData of enhancedCountries) {
      const { iso, ...rest } = countryData

      const updatePayload = {
        ...rest,
        languages: rest.languages ? JSON.stringify(rest.languages) : null,
        metadata: rest.metadata ? JSON.stringify(rest.metadata) : null
      }

      const updated = await db('countries').where({ iso }).update(updatePayload)

      if (updated === 0) {
        await db('countries').insert({
          iso,
          name: iso,
          nicename: iso,
          isActive: true,
          ...updatePayload
        })
        console.log(`➕ Inserted ${iso} with enterprise data`)
      } else {
        console.log(`✓ Updated ${iso} with enterprise data`)
      }
    }

    console.log('Country data update completed!')

    const sampleCountries = await db('countries')
      .select('iso', 'name', 'currencyCode', 'continent', 'capital')
      .whereIn('iso', enhancedCountries.map(c => c.iso))
      .orderBy('iso')

    console.log('\nSample of updated countries:')
    console.table(sampleCountries)
    
  } catch (error) {
    console.error('Error updating countries:', error)
  } finally {
    await db.destroy()
  }
}

// Run the update
updateCountries()
