/**
 * Country Utilities
 * 
 * Pure utility functions for country data formatting and validation.
 * No database access - all DB operations should go through CountryDAO.
 * 
 * @version 1.0.0
 * @author Susanoo API Team
 */

const CountryModel = require('../../models/CountryModel')
const logger = require('../../util/logger')

/**
 * Country utility manager for data formatting and validation
 * No database operations - purely functional utilities
 */
class CountryUtils {
  /**
   * Validates and enriches country data
   * @param {Object} countryData - Raw country data
   * @returns {Object} Validated and enriched country data
   */
  static validateAndEnrich(countryData) {
    const enriched = { ...countryData }

    try {
      // Validate using the model's validation schema
      const validationResult = CountryModel.validate(countryData)
      if (validationResult.error) {
        logger.warn('Country data validation failed', { 
          error: validationResult.error.message,
          data: countryData 
        })
      }
      
      // Enrich with derived data
      if (enriched.population && enriched.area) {
        enriched.populationDensity = enriched.population / enriched.area
      }

      // Validate and format coordinates
      if (enriched.latitude) {
        enriched.latitude = parseFloat(enriched.latitude)
      }
      if (enriched.longitude) {
        enriched.longitude = parseFloat(enriched.longitude)
      }

      // Parse languages if string
      if (typeof enriched.languages === 'string') {
        try {
          enriched.languages = JSON.parse(enriched.languages)
        } catch (parseError) {
          logger.debug('Failed to parse languages JSON, treating as string', { 
            languages: enriched.languages,
            error: parseError.message 
          })
          enriched.languages = [enriched.languages]
        }
      }

      // Parse metadata if string
      if (typeof enriched.metadata === 'string') {
        try {
          enriched.metadata = JSON.parse(enriched.metadata)
        } catch (parseError) {
          logger.debug('Failed to parse metadata JSON, setting to empty object', { 
            metadata: enriched.metadata,
            error: parseError.message 
          })
          enriched.metadata = {}
        }
      }

      return enriched
    } catch (error) {
      logger.error('Error validating country data', { error: error.message, data: countryData })
      return countryData
    }
  }

  /**
   * Format country data using model methods
   * @param {Object} countryData - Raw country data
   * @param {string} format - Format type (api, compact, search)
   * @returns {Object} Formatted country data
   */
  static formatCountry(countryData, format = 'api') {
    const model = new CountryModel()
    Object.assign(model, countryData)

    switch (format) {
      case 'compact':
        return model.toCompact()
      case 'search':
        return model.toSearchResult()
      case 'api':
      default:
        return model.toAPI()
    }
  }

  /**
   * Format array of countries
   * @param {Array} countries - Array of country data
   * @param {string} format - Format type
   * @returns {Array} Formatted countries
   */
  static formatCountries(countries, format = 'api') {
    return countries.map(country => this.formatCountry(country, format))
  }

  /**
   * Validate ISO country code format
   * @param {string} iso - ISO country code
   * @returns {boolean} True if valid
   */
  static isValidISOCode(iso) {
    return CountryModel.isValidISOCode(iso)
  }

  /**
   * Validate currency code format
   * @param {string} currencyCode - Currency code
   * @returns {boolean} True if valid
   */
  static isValidCurrencyCode(currencyCode) {
    return CountryModel.isValidCurrencyCode(currencyCode)
  }

  /**
   * Calculate distance between two countries using their coordinates
   * @param {Object} country1 - First country with lat/lng
   * @param {Object} country2 - Second country with lat/lng
   * @returns {number|null} Distance in kilometers or null if invalid
   */
  static calculateDistance(country1, country2) {
    if (!country1.latitude || !country1.longitude || !country2.latitude || !country2.longitude) {
      return null
    }

    const model1 = new CountryModel()
    Object.assign(model1, country1)
    
    return model1.distanceTo(country2)
  }

  /**
   * Group countries by a specific field
   * @param {Array} countries - Array of country objects
   * @param {string} field - Field to group by (continent, region, etc.)
   * @returns {Object} Grouped countries
   */
  static groupCountriesBy(countries, field) {
    return countries.reduce((groups, country) => {
      const key = country[field] || 'Unknown'
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(country)
      return groups
    }, {})
  }

  /**
   * Filter countries by criteria (in-memory filtering)
   * @param {Array} countries - Array of country objects
   * @param {Object} criteria - Filter criteria
   * @returns {Array} Filtered countries
   */
  static filterCountries(countries, criteria) {
    return countries.filter(country => {
      // Check continent
      if (criteria.continent && country.continent !== criteria.continent) {
        return false
      }

      // Check region
      if (criteria.region && country.region !== criteria.region) {
        return false
      }

      // Check currency
      if (criteria.currencyCode && country.currencyCode !== criteria.currencyCode) {
        return false
      }

      // Check active status
      if (criteria.isActive !== undefined && country.isActive !== criteria.isActive) {
        return false
      }

      // Check languages
      if (criteria.languages && Array.isArray(criteria.languages)) {
        const countryLanguages = country.languages || []
        const hasLanguage = criteria.languages.some(lang => countryLanguages.includes(lang))
        if (!hasLanguage) {
          return false
        }
      }

      return true
    })
  }

  /**
   * Search countries by name (in-memory search)
   * @param {Array} countries - Array of country objects
   * @param {string} query - Search query
   * @returns {Array} Matching countries
   */
  static searchCountriesByName(countries, query) {
    if (!query || query.length < 2) {
      return countries
    }

    const searchTerm = query.toLowerCase()
    
    return countries.filter(country => {
      const name = (country.name || '').toLowerCase()
      const niceName = (country.niceName || '').toLowerCase()
      const iso = (country.iso || '').toLowerCase()
      const iso3 = (country.iso3 || '').toLowerCase()
      
      return name.includes(searchTerm) ||
             niceName.includes(searchTerm) ||
             iso.includes(searchTerm) ||
             iso3.includes(searchTerm)
    })
  }

  /**
   * Sort countries by field
   * @param {Array} countries - Array of country objects
   * @param {string} field - Field to sort by
   * @param {string} direction - Sort direction (asc/desc)
   * @returns {Array} Sorted countries
   */
  static sortCountries(countries, field = 'name', direction = 'asc') {
    return [...countries].sort((a, b) => {
      const aVal = a[field] || ''
      const bVal = b[field] || ''
      
      if (direction === 'desc') {
        return bVal.localeCompare(aVal)
      }
      return aVal.localeCompare(bVal)
    })
  }

  /**
   * Convert search criteria to display-friendly format
   * @param {Object} criteria - Search criteria object
   * @returns {Object} Display-friendly criteria
   */
  static formatSearchCriteria(criteria) {
    const formatted = {}
    
    if (criteria.query) {
      formatted.searchTerm = criteria.query
    }
    
    if (criteria.continent) {
      formatted.continent = criteria.continent
    }
    
    if (criteria.region) {
      formatted.region = criteria.region
    }
    
    if (criteria.currencyCode) {
      formatted.currency = criteria.currencyCode
    }
    
    if (criteria.languages) {
      formatted.languages = Array.isArray(criteria.languages) 
        ? criteria.languages.join(', ') 
        : criteria.languages
    }
    
    return formatted
  }
}

module.exports = CountryUtils