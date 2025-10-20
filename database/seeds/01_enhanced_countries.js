const enhancedCountries = require('../data/enhancedCountries')

/**
 * Augment a subset of countries with enterprise metadata.
 * Preserves the master list inserted by 00_countries.js while ensuring
 * key markets have the richer attributes required by the application.
 */
exports.seed = async function seedEnhancedCountries(knex) {
  for (const country of enhancedCountries) {
    const { iso, ...rest } = country
    const payload = {
      ...rest,
      languages: rest.languages ? JSON.stringify(rest.languages) : null,
      metadata: rest.metadata ? JSON.stringify(rest.metadata) : null,
      isActive: true
    }

    const updated = await knex('countries').where({ iso }).update(payload)

    if (updated === 0) {
      await knex('countries').insert({
        iso,
        name: iso,
        nicename: iso,
        ...payload
      })
    }
  }
}
