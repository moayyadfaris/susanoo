/**
 * Shared enhanced country dataset used by seeds and update scripts.
 *
 * Fields align with the extended countries schema introduced in the
 * consolidated migrations (currency, geography, demographics, metadata).
 */

module.exports = [
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
  },
  {
    iso: 'GB',
    currencyCode: 'GBP',
    currencyName: 'British Pound',
    currencySymbol: '£',
    timezone: 'Europe/London',
    continent: 'Europe',
    region: 'Northern Europe',
    capital: 'London',
    latitude: 55.3781,
    longitude: -3.4360,
    population: 67886011,
    area: 243610,
    languages: ['en'],
    metadata: {
      callingCode: '+44',
      tld: '.uk',
      borders: ['IRL'],
      flag: '🇬🇧'
    }
  },
  {
    iso: 'FR',
    currencyCode: 'EUR',
    currencyName: 'Euro',
    currencySymbol: '€',
    timezone: 'Europe/Paris',
    continent: 'Europe',
    region: 'Western Europe',
    capital: 'Paris',
    latitude: 46.2276,
    longitude: 2.2137,
    population: 67391582,
    area: 643801,
    languages: ['fr'],
    metadata: {
      callingCode: '+33',
      tld: '.fr',
      borders: ['AND', 'BEL', 'DEU', 'ITA', 'LUX', 'MCO', 'ESP', 'CHE'],
      flag: '🇫🇷'
    }
  },
  {
    iso: 'DE',
    currencyCode: 'EUR',
    currencyName: 'Euro',
    currencySymbol: '€',
    timezone: 'Europe/Berlin',
    continent: 'Europe',
    region: 'Western Europe',
    capital: 'Berlin',
    latitude: 51.1657,
    longitude: 10.4515,
    population: 83240525,
    area: 357114,
    languages: ['de'],
    metadata: {
      callingCode: '+49',
      tld: '.de',
      borders: ['AUT', 'BEL', 'CZE', 'DNK', 'FRA', 'LUX', 'NLD', 'POL', 'CHE'],
      flag: '🇩🇪'
    }
  },
  {
    iso: 'JP',
    currencyCode: 'JPY',
    currencyName: 'Japanese Yen',
    currencySymbol: '¥',
    timezone: 'Asia/Tokyo',
    continent: 'Asia',
    region: 'Eastern Asia',
    capital: 'Tokyo',
    latitude: 36.2048,
    longitude: 138.2529,
    population: 125836021,
    area: 377930,
    languages: ['ja'],
    metadata: {
      callingCode: '+81',
      tld: '.jp',
      borders: [],
      flag: '🇯🇵'
    }
  },
  {
    iso: 'IN',
    currencyCode: 'INR',
    currencyName: 'Indian Rupee',
    currencySymbol: '₹',
    timezone: 'Asia/Kolkata',
    continent: 'Asia',
    region: 'Southern Asia',
    capital: 'New Delhi',
    latitude: 20.5937,
    longitude: 78.9629,
    population: 1380004385,
    area: 3287263,
    languages: ['hi', 'en'],
    metadata: {
      callingCode: '+91',
      tld: '.in',
      borders: ['BGD', 'BTN', 'CHN', 'MMR', 'NPL', 'PAK'],
      flag: '🇮🇳'
    }
  }
]
