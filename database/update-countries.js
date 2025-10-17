/**
 * Update existing countries with enterprise data
 * This script updates the countries table with enhanced metadata without deleting existing records
 */

require('dotenv').config()
const knex = require('knex')
const config = require('../knexfile')

const db = knex(config.development || config)

// Enhanced country data with enterprise fields
const enhancedCountries = [
  {
    iso: 'AF',
    currencyCode: 'AFN',
    currencyName: 'Afghan Afghani',
    currencySymbol: '؋',
    timezone: 'Asia/Kabul',
    continent: 'Asia',
    region: 'Southern Asia',
    capital: 'Kabul',
    latitude: 33.9391,
    longitude: 67.7100,
    population: 38928346,
    area: 652230,
    languages: ['ps', 'uz', 'tk'],
    metadata: {
      callingCode: '+93',
      tld: '.af',
      borders: ['IRN', 'PAK', 'TJK', 'TKM', 'UZB', 'CHN'],
      flag: '🇦🇫'
    }
  },
  {
    iso: 'AL',
    currencyCode: 'ALL',
    currencyName: 'Albanian Lek',
    currencySymbol: 'L',
    timezone: 'Europe/Tirane',
    continent: 'Europe',
    region: 'Southern Europe',
    capital: 'Tirana',
    latitude: 41.1533,
    longitude: 20.1683,
    population: 2877797,
    area: 28748,
    languages: ['sq'],
    metadata: {
      callingCode: '+355',
      tld: '.al',
      borders: ['MNE', 'GRC', 'MKD', 'UNK'],
      flag: '🇦🇱'
    }
  },
  {
    iso: 'DZ',
    currencyCode: 'DZD',
    currencyName: 'Algerian Dinar',
    currencySymbol: 'د.ج',
    timezone: 'Africa/Algiers',
    continent: 'Africa',
    region: 'Northern Africa',
    capital: 'Algiers',
    latitude: 28.0339,
    longitude: 1.6596,
    population: 43851044,
    area: 2381741,
    languages: ['ar'],
    metadata: {
      callingCode: '+213',
      tld: '.dz',
      borders: ['TUN', 'LBY', 'NER', 'ESH', 'MRT', 'MLI', 'MAR'],
      flag: '🇩🇿'
    }
  },
  {
    iso: 'US',
    currencyCode: 'USD',
    currencyName: 'US Dollar',
    currencySymbol: '$',
    timezone: 'America/New_York',
    continent: 'North America',
    region: 'Northern America',
    capital: 'Washington, D.C.',
    latitude: 37.0902,
    longitude: -95.7129,
    population: 331002651,
    area: 9833517,
    languages: ['en'],
    metadata: {
      callingCode: '+1',
      tld: '.us',
      borders: ['CAN', 'MEX'],
      flag: '🇺🇸'
    }
  },
  {
    iso: 'CA',
    currencyCode: 'CAD',
    currencyName: 'Canadian Dollar',
    currencySymbol: 'C$',
    timezone: 'America/Toronto',
    continent: 'North America',
    region: 'Northern America',
    capital: 'Ottawa',
    latitude: 56.1304,
    longitude: -106.3468,
    population: 37742154,
    area: 9984670,
    languages: ['en', 'fr'],
    metadata: {
      callingCode: '+1',
      tld: '.ca',
      borders: ['USA'],
      flag: '🇨🇦'
    }
  }
]

async function updateCountries() {
  try {
    console.log('Starting country data update...')
    
    for (const countryData of enhancedCountries) {
      const { iso, ...updateData } = countryData
      
      // Convert arrays and objects to JSON strings for database storage
      const dbData = {
        ...updateData,
        languages: JSON.stringify(updateData.languages),
        metadata: JSON.stringify(updateData.metadata)
      }
      
      const result = await db('countries')
        .where({ iso })
        .update(dbData)
      
      if (result > 0) {
        console.log(`✓ Updated ${iso} with enterprise data`)
      } else {
        console.log(`⚠ No country found with ISO: ${iso}`)
      }
    }
    
    console.log('Country data update completed!')
    
    // Show sample of updated data
    console.log('\\nSample of updated countries:')
    const sampleCountries = await db.select('iso', 'name', 'currencyCode', 'continent', 'capital')
      .from('countries')
      .whereIn('iso', ['US', 'CA', 'AF', 'AL', 'DZ'])
      .limit(5)
    
    console.table(sampleCountries)
    
  } catch (error) {
    console.error('Error updating countries:', error)
  } finally {
    await db.destroy()
  }
}

// Run the update
updateCountries()