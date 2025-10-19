const router = require('express').Router()

const handlers = require('handlers/v1/web/countries')
const { BaseController } = require('controllers/BaseController')

class CountriesController extends BaseController {
  get router () {
    /**
     * @swagger
     * /web/countries:
     *   get:
     *     tags:
     *      - Countries
     *     name: list
     *     summary: List countries (search, filter, paginate)
     *     description: |
     *       Retrieve countries with rich query options for pagination, search, sorting, and filtering.
     *
     *       Query options supported (combine as needed):
     *       - Pagination: `page` (0-based), `limit` (1-1000), `offset`
     *       - Sorting: `orderBy` (e.g. `name:asc`), `sort` (advanced, comma/array)
     *       - Filtering:
     *         - JSON object via `filter` (URL-encoded JSON)
     *         - Bracket notation: `filter[iso]=JO&filter[isActive]=true`
     *         - Common filter keys: `name`, `nicename`, `iso`, `iso3`, `phonecode`, `numcode`, `isActive`, `region`
     *       - Search: `search` across name/nicename/ISO codes
     *       - Field selection: `fields` (comma-separated or array)
     *       - Output tweaks: `format` (json|csv|xml), `locale`, `timezone`
     *
     *       Examples:
     *       - Basic: `/web/countries?page=0&limit=20`
     *       - Search: `/web/countries?search=jordan`
     *       - Filter (brackets): `/web/countries?filter[iso]=JO&filter[isActive]=true`
     *       - Filter (JSON): `/web/countries?filter=%7B%22region%22%3A%22asia%22%2C%22isActive%22%3Atrue%7D`
     *       - Pick fields: `/web/countries?fields=id,name,iso,phonecode`
     *       - Sort: `/web/countries?orderBy=name:asc`
     *
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     parameters:
     *       - in: query
     *         name: page
     *         type: integer
     *         format: int32
     *         default: 0
     *         description: 0-based page number for pagination.
     *       - in: query
     *         name: limit
     *         type: integer
     *         format: int32
     *         default: 10
     *         description: Page size (1-1000).
     *       - in: query
     *         name: offset
     *         type: integer
     *         format: int32
     *         description: Number of records to skip. If not provided, computed from page and limit.
     *       - in: query
     *         name: orderBy
     *         type: string
     *         description: Sort as "field:direction" (e.g., "name:asc").
     *       - in: query
     *         name: sort
     *         type: string
     *         description: Optional advanced sort. Comma-separated or repeatable array (e.g., sort=name:asc,iso:desc).
     *       - in: query
     *         name: search
     *         type: string
     *         description: Free-text search (name, nicename, ISO codes).
     *       - in: query
     *         name: searchFields
     *         type: string
     *         description: Comma-separated list of fields to search in.
     *       - in: query
     *         name: filter
     *         type: string
     *         description: JSON object of filters (URL-encoded). Example: {"iso":"JO","isActive":true}.
     *       - in: query
     *         name: filter[name]
     *         type: string
     *         description: Filter by name (partial match).
     *       - in: query
     *         name: filter[nicename]
     *         type: string
     *         description: Filter by nicename (partial match).
     *       - in: query
     *         name: filter[iso]
     *         type: string
     *         description: Filter by 2-letter ISO code (exact match).
     *       - in: query
     *         name: filter[iso3]
     *         type: string
     *         description: Filter by 3-letter ISO3 code (exact match).
     *       - in: query
     *         name: filter[phonecode]
     *         type: integer
     *         format: int32
     *         description: Filter by phone country code.
     *       - in: query
     *         name: filter[numcode]
     *         type: integer
     *         format: int32
     *         description: Filter by numeric country code.
     *       - in: query
     *         name: filter[isActive]
     *         type: boolean
     *         description: Filter by active status (true/false).
     *       - in: query
     *         name: filter[region]
     *         type: string
     *         description: Filter by region (e.g., europe, asia, africa, north_america, south_america, oceania).
     *       - in: query
     *         name: fields
     *         type: string
     *         description: Comma-separated list of fields to return (e.g., id,name,iso,phonecode).
     *       - in: query
     *         name: include
     *         type: string
     *         description: Comma-separated related resources to include (if available).
     *       - in: query
     *         name: format
     *         type: string
     *         enum: [json, csv, xml]
     *         description: Response format.
     *       - in: query
     *         name: locale
     *         type: string
     *         description: Locale hint (e.g., en, en-US).
     *       - in: query
     *         name: timezone
     *         type: string
     *         description: Timezone hint (e.g., UTC+3, America/New_York).
     *     responses:
     *       '200':
     *         description: Countries list
     *         schema:
     *           type: array
     *           items:
     *             $ref: '#/definitions/Country'
     *         headers:
     *           X-Total-Count:
     *             type: integer
     *             description: Total number of countries matching the query.
     *       '400':
     *         description: Bad request
     *       '422':
     *         description: Validation error in query parameters
     */
    router.get('/countries', this.handlerRunner(handlers.ListCountriesHandler))
    
    return router
  }

  async init () {
    this.logger.debug(`{WEB} ${this.constructor.name} initialized...`)
  }
}

module.exports = { CountriesController }

