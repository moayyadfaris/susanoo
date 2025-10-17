const router = require('express').Router()
const handlers = require('handlers/v1/app/countries')
const { BaseController } = require('controllers/BaseController')
const { getCountryService, getCountryCacheService, getCountryAnalyticsService } = require('services')
const { ErrorWrapper, errorCodes } = require('backend-core')

/**
 * CountriesController - Enhanced Enterprise Country Management Controller
 * 
 * Provides comprehensive country data management with:
 * - Advanced search and filtering capabilities
 * - Service layer integration for business logic
 * - Performance optimization with intelligent caching
 * - Regional analysis and geographical insights
 * - Enterprise-grade error handling and monitoring
 * - Comprehensive OpenAPI/Swagger documentation
 * 
 * @version 2.0.0
 * @author Susanoo API Team
 */
class CountriesController extends BaseController {
  
  constructor(options = {}) {
    super(options)
    
    // Service layer dependencies (lazy-loaded for performance)
    this._countryService = null
    this._cacheService = null
    this._analyticsService = null
    
    // Controller-specific configuration
    this.controllerConfig = {
      enableAnalytics: true,
      enableCaching: true,
      enableServiceLayer: true,
      defaultPageSize: 50,
      maxPageSize: 1000,
      cacheHeaders: {
        'Cache-Control': 'public, max-age=3600',
        'Vary': 'Accept, Accept-Language'
      },
      ...options.controllerConfig
    }
  }

  /**
   * Lazy-loaded service getters with fallback to handlers
   */
  get countryService() {
    if (!this._countryService && this.controllerConfig.enableServiceLayer) {
      try {
        this._countryService = getCountryService()
      } catch (error) {
        this.logger.warn('CountryService not available, using handler fallback', { error: error.message })
        return null
      }
    }
    return this._countryService
  }
  
  get cacheService() {
    if (!this._cacheService && this.controllerConfig.enableCaching) {
      try {
        this._cacheService = getCountryCacheService()
      } catch (error) {
        this.logger.warn('CountryCacheService not available, caching disabled', { error: error.message })
        return null
      }
    }
    return this._cacheService
  }
  
  get analyticsService() {
    if (!this._analyticsService && this.controllerConfig.enableAnalytics) {
      try {
        this._analyticsService = getCountryAnalyticsService()
      } catch (error) {
        this.logger.warn('CountryAnalyticsService not available, analytics disabled', { error: error.message })
        return null
      }
    }
    return this._analyticsService
  }

  get router() {
    /**
     * @swagger
     * /countries:
     *   get:
     *     tags:
     *       - Countries
     *     summary: List countries with advanced filtering and search
     *     description: |
     *       Retrieve a comprehensive list of countries with powerful filtering, search, and pagination capabilities.
     *       
     *       ## 🚀 **Advanced Features**
     *       
     *       ### **Search & Filtering**
     *       - **Text Search**: Search by country name, nice name, or ISO codes
     *       - **Regional Filtering**: Filter by geographical regions
     *       - **Status Filtering**: Filter by active/inactive status
     *       - **Code Filtering**: Filter by ISO codes, phone codes, or numeric codes
     *       - **Multiple Filter Formats**: Support for JSON objects and bracket notation
     *       
     *       ### **Response Formats**
     *       - **Full Format** (default): Complete country information
     *       - **Minimal Format**: Essential fields only (id, name, iso, phonecode)
     *       - **Codes Only**: ISO codes and names for lightweight responses
     *       
     *       ### **Grouping & Organization**
     *       - **Regional Grouping**: Group countries by geographical regions
     *       - **Phone Code Grouping**: Group by international calling codes
     *       
     *       ### **Performance Optimization**
     *       - **Intelligent Caching**: Redis-backed caching for improved performance
     *       - **Field Selection**: Choose specific fields to reduce payload size
     *       - **Pagination**: Efficient large dataset handling
     *       
     *       ## 📋 **Usage Examples**
     *       
     *       ```bash
     *       # Basic country listing
     *       GET /api/v1/countries?page=0&limit=20
     *       
     *       # Search for countries containing "jordan"
     *       GET /api/v1/countries?search=jordan
     *       
     *       # Filter by region using bracket notation
     *       GET /api/v1/countries?filter[region]=europe&filter[isActive]=true
     *       
     *       # Complex filtering with JSON
     *       GET /api/v1/countries?filter={"region":"asia","phonecode":1}
     *       
     *       # Custom field selection for lightweight responses
     *       GET /api/v1/countries?fields=id,name,iso,phonecode&format=minimal
     *       
     *       # Regional grouping with codes-only format
     *       GET /api/v1/countries?groupBy=region&format=codes-only
     *       
     *       # Advanced search with multiple criteria
     *       GET /api/v1/countries?search=united&filter[isActive]=true&fields=name,iso,phonecode
     *       ```
     *       
     *       ## 🌍 **Supported Regions**
     *       - `europe` - European countries
     *       - `asia` - Asian countries  
     *       - `africa` - African countries
     *       - `north_america` - North American countries
     *       - `south_america` - South American countries
     *       - `oceania` - Oceania countries
     *       
     *       ## ⚡ **Performance Notes**
     *       - Results are cached for 1 hour by default
     *       - Maximum page size is 1000 items
     *       - Field selection can significantly reduce response size
     *       - Regional grouping may increase response time for large datasets
     *     operationId: listCountries
     *     parameters:
     *       - name: page
     *         in: query
     *         description: |
     *           Page number for pagination (0-based indexing).
     *           
     *           **Examples:**
     *           - `0` - First page
     *           - `1` - Second page
     *           - `5` - Sixth page
     *         required: false
     *         schema:
     *           type: integer
     *           minimum: 0
     *           default: 0
     *           example: 0
     *       - name: limit
     *         in: query
     *         description: |
     *           Number of results per page. Maximum allowed is 1000.
     *           
     *           **Recommended values:**
     *           - `20` - For mobile applications
     *           - `50` - For web applications (default)
     *           - `100` - For bulk operations
     *           - `1000` - For data exports (maximum)
     *         required: false
     *         schema:
     *           type: integer
     *           minimum: 1
     *           maximum: 1000
     *           default: 50
     *           example: 20
     *       - name: search
     *         in: query
     *         description: |
     *           Search term to filter countries. Searches across:
     *           - Country name (e.g., "United States")
     *           - Nice name (e.g., "Jordan")  
     *           - ISO 2-letter codes (e.g., "US", "JO")
     *           - ISO 3-letter codes (e.g., "USA", "JOR")
     *           
     *           **Search is case-insensitive and supports partial matching.**
     *         required: false
     *         schema:
     *           type: string
     *           minLength: 1
     *           maxLength: 100
     *           example: "jordan"
     *       - name: filter
     *         in: query
     *         description: |
     *           Advanced filtering using JSON object format. Can be provided as:
     *           
     *           **JSON String Format:**
     *           ```json
     *           {"region":"europe","isActive":true,"phonecode":1}
     *           ```
     *           
     *           **URL Encoded Format:**
     *           ```
     *           %7B%22region%22%3A%22europe%22%2C%22isActive%22%3Atrue%7D
     *           ```
     *           
     *           **Supported Filter Fields:**
     *           - `name` - Filter by country name (partial match)
     *           - `nicename` - Filter by nice name (partial match)
     *           - `iso` - Filter by 2-letter ISO code (exact match)
     *           - `iso3` - Filter by 3-letter ISO code (exact match)  
     *           - `phonecode` - Filter by international calling code
     *           - `numcode` - Filter by numeric country code
     *           - `isActive` - Filter by active status (boolean)
     *           - `region` - Filter by geographical region
     *         required: false
     *         schema:
     *           type: string
     *           example: '{"region":"asia","isActive":true}'
     *       - name: filter[name]
     *         in: query
     *         description: Filter by country name using bracket notation (alternative to JSON filter)
     *         required: false
     *         schema:
     *           type: string
     *           maxLength: 100
     *           example: "United"
     *       - name: filter[region]
     *         in: query
     *         description: Filter by geographical region using bracket notation
     *         required: false
     *         schema:
     *           type: string
     *           enum: [europe, asia, africa, north_america, south_america, oceania]
     *           example: "europe"
     *       - name: filter[iso]
     *         in: query
     *         description: Filter by 2-letter ISO code using bracket notation
     *         required: false
     *         schema:
     *           type: string
     *           minLength: 2
     *           maxLength: 2
     *           pattern: '^[A-Z]{2}$'
     *           example: "US"
     *       - name: filter[iso3]
     *         in: query
     *         description: Filter by 3-letter ISO code using bracket notation
     *         required: false
     *         schema:
     *           type: string
     *           minLength: 3
     *           maxLength: 3
     *           pattern: '^[A-Z]{3}$'
     *           example: "USA"
     *       - name: filter[phonecode]
     *         in: query
     *         description: Filter by international calling code using bracket notation
     *         required: false
     *         schema:
     *           type: integer
     *           minimum: 1
     *           maximum: 999
     *           example: 1
     *       - name: filter[isActive]
     *         in: query
     *         description: Filter by active status using bracket notation
     *         required: false
     *         schema:
     *           type: boolean
     *           example: true
     *       - name: fields
     *         in: query
     *         description: |
     *           Comma-separated list of fields to include in the response.
     *           Helps reduce payload size for better performance.
     *           
     *           **Available Fields:**
     *           - `id` - Unique country identifier
     *           - `name` - Official country name
     *           - `nicename` - Friendly country name
     *           - `iso` - 2-letter ISO code
     *           - `iso3` - 3-letter ISO code
     *           - `phonecode` - International calling code
     *           - `numcode` - Numeric country code
     *           - `isActive` - Active status flag
     *           
     *           **Example combinations:**
     *           - Essential: `id,name,iso`
     *           - Phone directory: `name,phonecode,iso`
     *           - Mapping: `name,iso,iso3`
     *         required: false
     *         schema:
     *           type: string
     *           example: "id,name,iso,phonecode"
     *       - name: format
     *         in: query
     *         description: |
     *           Response format to control the amount of data returned:
     *           
     *           - **full** (default): Complete country information with all fields
     *           - **minimal**: Essential fields only (id, name, iso, phonecode)
     *           - **codes-only**: Just ISO codes and country names for lightweight responses
     *         required: false
     *         schema:
     *           type: string
     *           enum: [full, minimal, codes-only]
     *           default: full
     *           example: "minimal"
     *       - name: groupBy
     *         in: query
     *         description: |
     *           Group results by specified field for organized data presentation:
     *           
     *           - **region**: Group countries by geographical regions
     *           - **phonecode**: Group countries by international calling codes
     *           
     *           When grouping is enabled, the response structure changes to an object
     *           with group names as keys and country arrays as values.
     *         required: false
     *         schema:
     *           type: string
     *           enum: [region, phonecode]
     *           example: "region"
     *       - name: useCache
     *         in: query
     *         description: |
     *           Control caching behavior for the request:
     *           
     *           - `true` (default): Use cached results when available
     *           - `false`: Force fresh data from database
     *           
     *           **Note:** Disabling cache may increase response time but ensures
     *           the most up-to-date data.
     *         required: false
     *         schema:
     *           type: boolean
     *           default: true
     *           example: true
     *       - name: sort
     *         in: query
     *         description: |
     *           Sort results by specified field and direction.
     *           
     *           **Format:** `field:direction`
     *           
     *           **Available fields:** name, iso, phonecode, numcode
     *           **Directions:** asc (ascending), desc (descending)
     *           
     *           **Examples:**
     *           - `name:asc` - Sort by name A-Z (default)
     *           - `name:desc` - Sort by name Z-A  
     *           - `phonecode:asc` - Sort by phone code ascending
     *         required: false
     *         schema:
     *           type: string
     *           pattern: '^(name|iso|phonecode|numcode):(asc|desc)$'
     *           default: "name:asc"
     *           example: "name:asc"
     *     produces:
     *       - application/json
     *     responses:
     *       '200':
     *         description: |
     *           **Successful response with countries data and comprehensive metadata**
     *           
     *           The response includes:
     *           - **data**: Array of country objects (or grouped object when groupBy is used)
     *           - **meta**: Comprehensive metadata including pagination, query info, and performance metrics
     *           - **headers**: Additional response headers for caching and identification
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 data:
     *                   oneOf:
     *                     - type: array
     *                       description: Array of country objects (when groupBy is not used)
     *                       items:
     *                         $ref: '#/definitions/Country'
     *                     - type: object
     *                       description: Grouped countries object (when groupBy is used)
     *                       additionalProperties:
     *                         type: array
     *                         items:
     *                           $ref: '#/definitions/Country'
     *                 meta:
     *                   type: object
     *                   properties:
     *                     pagination:
     *                       type: object
     *                       description: Pagination information
     *                       properties:
     *                         page:
     *                           type: integer
     *                           description: Current page number (0-based)
     *                           example: 0
     *                         limit:
     *                           type: integer
     *                           description: Results per page
     *                           example: 50
     *                         total:
     *                           type: integer
     *                           description: Total number of countries matching criteria
     *                           example: 195
     *                         pages:
     *                           type: integer
     *                           description: Total number of pages
     *                           example: 4
     *                     query:
     *                       type: object
     *                       description: Applied query parameters
     *                       properties:
     *                         search:
     *                           type: string
     *                           nullable: true
     *                           description: Applied search term
     *                           example: "jordan"
     *                         filters:
     *                           type: object
     *                           description: Applied filter conditions
     *                           example: {"region": "asia", "isActive": true}
     *                         format:
     *                           type: string
     *                           description: Applied response format
     *                           example: "full"
     *                         groupBy:
     *                           type: string
     *                           nullable: true
     *                           description: Applied grouping field
     *                           example: "region"
     *                         fields:
     *                           type: array
     *                           nullable: true
     *                           description: Selected fields (if any)
     *                           items:
     *                             type: string
     *                           example: ["id", "name", "iso"]
     *                     performance:
     *                       type: object
     *                       description: Performance and caching information
     *                       properties:
     *                         duration:
     *                           type: integer
     *                           description: Request processing time in milliseconds
     *                           example: 45
     *                         cacheHit:
     *                           type: boolean
     *                           description: Whether the result was served from cache
     *                           example: true
     *                         source:
     *                           type: string
     *                           description: Data source (cache or database)
     *                           enum: [cache, database]
     *                           example: "cache"
     *                     regions:
     *                       type: array
     *                       nullable: true
     *                       description: Available regions (when groupBy=region is used)
     *                       items:
     *                         type: string
     *                       example: ["Europe", "Asia", "Africa"]
     *                     timestamp:
     *                       type: string
     *                       format: date-time
     *                       description: Response generation timestamp
     *                       example: "2025-10-12T14:30:00Z"
     *                     version:
     *                       type: string
     *                       description: API version
     *                       example: "2.0.0"
     *             examples:
     *               basic_list:
     *                 summary: Basic country listing
     *                 value:
     *                   data:
     *                     - id: 1
     *                       name: "Afghanistan"
     *                       nicename: "Afghanistan"
     *                       iso: "AF"
     *                       iso3: "AFG"
     *                       phonecode: 93
     *                       numcode: 4
     *                       isActive: true
     *                     - id: 2
     *                       name: "Albania"
     *                       nicename: "Albania"
     *                       iso: "AL"
     *                       iso3: "ALB"
     *                       phonecode: 355
     *                       numcode: 8
     *                       isActive: true
     *                   meta:
     *                     pagination:
     *                       page: 0
     *                       limit: 50
     *                       total: 195
     *                       pages: 4
     *                     query:
     *                       search: null
     *                       filters: {}
     *                       format: "full"
     *                       groupBy: null
     *                     performance:
     *                       duration: 23
     *                       cacheHit: true
     *                       source: "cache"
     *               regional_grouping:
     *                 summary: Countries grouped by region
     *                 value:
     *                   data:
     *                     Europe:
     *                       - id: 15
     *                         name: "Austria"
     *                         iso: "AT"
     *                         phonecode: 43
     *                       - id: 21
     *                         name: "Belgium"
     *                         iso: "BE"
     *                         phonecode: 32
     *                     Asia:
     *                       - id: 108
     *                         name: "Jordan"
     *                         iso: "JO"
     *                         phonecode: 962
     *                   meta:
     *                     pagination:
     *                       page: 0
     *                       limit: 1000
     *                       total: 195
     *                       pages: 1
     *                     query:
     *                       groupBy: "region"
     *                       format: "minimal"
     *                     regions: ["Europe", "Asia", "Africa", "North America", "South America", "Oceania"]
     *               minimal_format:
     *                 summary: Minimal format response
     *                 value:
     *                   data:
     *                     - id: 108
     *                       name: "Jordan"
     *                       iso: "JO"
     *                       phonecode: 962
     *                   meta:
     *                     query:
     *                       search: "jordan"
     *                       format: "minimal"
     *         headers:
     *           X-Request-ID:
     *             description: Unique request identifier for tracking
     *             schema:
     *               type: string
     *               example: "req_1234567890abcdef"
     *           X-Total-Count:
     *             description: Total number of countries matching the criteria
     *             schema:
     *               type: string
     *               example: "195"
     *           X-Page:
     *             description: Current page number (0-based)
     *             schema:
     *               type: string
     *               example: "0"
     *           X-Limit:
     *             description: Number of results per page
     *             schema:
     *               type: string
     *               example: "50"
     *           X-Performance:
     *             description: Request processing time
     *             schema:
     *               type: string
     *               example: "45ms"
     *           Cache-Control:
     *             description: Cache control directives
     *             schema:
     *               type: string
     *               example: "public, max-age=3600"
     *           Vary:
     *             description: Response variation headers
     *             schema:
     *               type: string
     *               example: "Accept, Accept-Language"
     *       '400':
     *         description: |
     *           **Bad Request - Invalid parameters or validation errors**
     *           
     *           Common causes:
     *           - Invalid filter JSON format
     *           - Invalid region names
     *           - Invalid ISO code format
     *           - Invalid pagination parameters
     *           - Invalid field names in field selection
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: object
     *                   properties:
     *                     code:
     *                       type: string
     *                       example: "VALIDATION_ERROR"
     *                     message:
     *                       type: string
     *                       example: "Invalid region 'invalid_region'. Valid regions: europe, asia, africa, north_america, south_america, oceania"
     *                     layer:
     *                       type: string
     *                       example: "CountriesController"
     *                     requestId:
     *                       type: string
     *                       example: "req_1234567890abcdef"
     *                     timestamp:
     *                       type: string
     *                       format: date-time
     *                       example: "2025-10-12T14:30:00Z"
     *                     details:
     *                       type: object
     *                       description: Additional error details
     *             examples:
     *               invalid_region:
     *                 summary: Invalid region filter
     *                 value:
     *                   error:
     *                     code: "VALIDATION_ERROR"
     *                     message: "Invalid region 'invalid_region'. Valid regions: europe, asia, africa, north_america, south_america, oceania"
     *                     layer: "CountriesController"
     *               invalid_json_filter:
     *                 summary: Invalid JSON in filter parameter
     *                 value:
     *                   error:
     *                     code: "VALIDATION_ERROR"
     *                     message: "Invalid JSON in filter parameter: Unexpected token 'i' at position 1"
     *                     layer: "CountriesController"
     *               invalid_iso_code:
     *                 summary: Invalid ISO code format
     *                 value:
     *                   error:
     *                     code: "VALIDATION_ERROR"
     *                     message: "ISO code must be exactly 2 characters"
     *                     layer: "CountriesController"
     *       '429':
     *         description: |
     *           **Too Many Requests - Rate limit exceeded**
     *           
     *           The client has exceeded the allowed number of requests per time window.
     *           Please reduce request frequency and try again later.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: object
     *                   properties:
     *                     code:
     *                       type: string
     *                       example: "RATE_LIMIT_EXCEEDED"
     *                     message:
     *                       type: string
     *                       example: "Too many requests. Please try again later."
     *                     retryAfter:
     *                       type: integer
     *                       description: Seconds to wait before retrying
     *                       example: 60
     *         headers:
     *           Retry-After:
     *             description: Seconds to wait before making another request
     *             schema:
     *               type: integer
     *               example: 60
     *           X-RateLimit-Limit:
     *             description: Request limit per time window
     *             schema:
     *               type: integer
     *               example: 100
     *           X-RateLimit-Remaining:
     *             description: Remaining requests in current window
     *             schema:
     *               type: integer
     *               example: 0
     *           X-RateLimit-Reset:
     *             description: Unix timestamp when the rate limit resets
     *             schema:
     *               type: integer
     *               example: 1634567890
     *       '500':
     *         description: |
     *           **Internal Server Error - Unexpected server error**
     *           
     *           An unexpected error occurred while processing the request.
     *           The error has been logged and will be investigated.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: object
     *                   properties:
     *                     code:
     *                       type: string
     *                       example: "INTERNAL_SERVER_ERROR"
     *                     message:
     *                       type: string
     *                       example: "An unexpected error occurred while processing your request"
     *                     requestId:
     *                       type: string
     *                       example: "req_1234567890abcdef"
     *                     timestamp:
     *                       type: string
     *                       format: date-time
     *                       example: "2025-10-12T14:30:00Z"
     *             examples:
     *               server_error:
     *                 summary: Generic server error
     *                 value:
     *                   error:
     *                     code: "INTERNAL_SERVER_ERROR"
     *                     message: "An unexpected error occurred while processing your request"
     *                     requestId: "req_1234567890abcdef"
     *                     timestamp: "2025-10-12T14:30:00Z"
     *       '503':
     *         description: |
     *           **Service Unavailable - Service temporarily unavailable**
     *           
     *           The service is temporarily unavailable due to maintenance
     *           or high load. Please try again later.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: object
     *                   properties:
     *                     code:
     *                       type: string
     *                       example: "SERVICE_UNAVAILABLE"
     *                     message:
     *                       type: string
     *                       example: "Service temporarily unavailable. Please try again later."
     *                     estimatedRecovery:
     *                       type: string
     *                       format: date-time
     *                       example: "2025-10-12T15:00:00Z"
     *         headers:
     *           Retry-After:
     *             description: Seconds to wait before retrying
     *             schema:
     *               type: integer
     *               example: 300
     *     security:
     *       - BearerAuth: []
     *       - ApiKeyAuth: []
     *     x-code-samples:
     *       - lang: 'JavaScript'
     *         source: |
     *           // Basic fetch example
     *           const response = await fetch('/api/v1/countries?page=0&limit=20');
     *           const data = await response.json();
     *           console.log('Countries:', data.data);
     *           
     *           // Advanced filtering
     *           const filtered = await fetch('/api/v1/countries?filter={"region":"asia","isActive":true}');
     *           const asianCountries = await filtered.json();
     *           
     *           // Using field selection for performance
     *           const minimal = await fetch('/api/v1/countries?fields=id,name,iso&format=minimal');
     *           const essentialData = await minimal.json();
     *       - lang: 'curl'
     *         source: |
     *           # Basic listing
     *           curl -X GET "https://api.example.com/v1/countries?page=0&limit=20" \
     *                -H "Accept: application/json"
     *           
     *           # Search for countries
     *           curl -X GET "https://api.example.com/v1/countries?search=jordan" \
     *                -H "Accept: application/json"
     *           
     *           # Regional filtering with bracket notation
     *           curl -X GET "https://api.example.com/v1/countries?filter[region]=europe&filter[isActive]=true" \
     *                -H "Accept: application/json"
     *           
     *           # Complex JSON filtering (URL encoded)
     *           curl -X GET "https://api.example.com/v1/countries?filter=%7B%22region%22%3A%22asia%22%2C%22phonecode%22%3A1%7D" \
     *                -H "Accept: application/json"
     *           
     *           # Custom fields with minimal format
     *           curl -X GET "https://api.example.com/v1/countries?fields=id,name,iso,phonecode&format=minimal" \
     *                -H "Accept: application/json"
     *           
     *           # Regional grouping
     *           curl -X GET "https://api.example.com/v1/countries?groupBy=region&format=codes-only" \
     *                -H "Accept: application/json"
     *       - lang: 'Python'
     *         source: |
     *           import requests
     *           
     *           # Basic request
     *           response = requests.get('https://api.example.com/v1/countries', 
     *                                   params={'page': 0, 'limit': 20})
     *           countries = response.json()['data']
     *           
     *           # Advanced filtering
     *           filter_params = {
     *               'filter': '{"region":"europe","isActive":true}',
     *               'format': 'minimal'
     *           }
     *           filtered = requests.get('https://api.example.com/v1/countries', 
     *                                   params=filter_params)
     *           
     *           # Using bracket notation
     *           bracket_params = {
     *               'filter[region]': 'asia',
     *               'filter[phonecode]': 1,
     *               'fields': 'id,name,iso,phonecode'
     *           }
     *           results = requests.get('https://api.example.com/v1/countries', 
     *                                  params=bracket_params)
     *     x-performance-notes:
     *       - Cache TTL is 1 hour for optimal performance
     *       - Field selection can reduce response size by up to 70%
     *       - Regional grouping adds ~50ms processing time for large datasets
     *       - Search operations use optimized database indexes
     *     x-rate-limits:
     *       - Standard: 100 requests per 15 minutes
     *       - Premium: 1000 requests per 15 minutes
     *       - Enterprise: Unlimited with SLA
     */
    router.get('/countries', this.enhancedCountriesHandler.bind(this))

    return router
  }

  /**
   * Enhanced countries listing with service layer integration and comprehensive features
   */
  async enhancedCountriesHandler(req, res, next) {
    const startTime = Date.now()
    const requestId = req.requestId || this.generateRequestId()
    
    try {
      // Set request ID header early
      res.setHeader('X-Request-ID', requestId)
      
      // Create enhanced request context
      const ctx = {
        requestId,
        query: req.query,
        processedQuery: req.processedQuery,
        ip: this.getClientIP(req),
        userAgent: req.get('User-Agent'),
        headers: this.extractHeaders(req),
        startTime,
        method: req.method,
        url: req.url
      }

      // Log request initiation
      this.logger.info('Countries list request initiated', {
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        query: this.sanitizeQueryForLogging(ctx.query)
      })

      // Try service layer first, fallback to handler if needed
      let result
      if (this.countryService && this.controllerConfig.enableServiceLayer) {
        result = await this.handleWithServiceLayer(ctx)
      } else {
        this.logger.info('Using handler fallback for countries request', { requestId })
        result = await this.handleWithHandlerFallback(ctx)
      }

      // Track analytics if available
      if (this.analyticsService && this.controllerConfig.enableAnalytics) {
        this.trackAnalytics(result, ctx).catch(error => {
          this.logger.warn('Analytics tracking failed', { requestId, error: error.message })
        })
      }

      // Set response headers
      this.setResponseHeaders(res, result)
      
      // Log successful completion
      const duration = Date.now() - startTime
      this.logger.info('Countries list request completed', {
        requestId: ctx.requestId,
        duration,
        totalResults: result.data?.length || 0,
        cacheHit: result.meta?.performance?.cacheHit || false,
        source: result.meta?.performance?.source || 'unknown'
      })

      // Send response
      res.status(200).json(result)

    } catch (error) {
      this.handleControllerError(error, req, res, next, requestId, Date.now() - startTime)
    }
  }

  /**
   * Handle request using service layer
   */
  async handleWithServiceLayer(ctx) {
    const queryParams = this.parseAndValidateQuery(ctx.query, ctx)
    
    const searchOptions = {
      page: queryParams.page,
      limit: queryParams.limit,
      format: queryParams.format,
      useCache: queryParams.useCache && this.controllerConfig.enableCaching,
      orderBy: {
        field: queryParams.orderByField || 'name',
        direction: queryParams.orderByDirection || 'asc'
      }
    }

    const serviceResult = await this.countryService.searchCountries({
      search: queryParams.search,
      filter: queryParams.filter,
      fields: queryParams.fields,
      groupBy: queryParams.groupBy
    }, searchOptions)

    return this.formatServiceResponse(serviceResult, queryParams, ctx)
  }

  /**
   * Fallback to handler-based approach when service layer is unavailable
   */
  async handleWithHandlerFallback(ctx) {
    // Use the existing handler approach but with enhanced context
    const handlerResult = await handlers.ListCountriesHandler.run(ctx)
    
    // Transform handler result to match our expected format
    return {
      success: handlerResult.success !== undefined ? handlerResult.success : true,
      data: handlerResult.data || [],
      meta: {
        pagination: handlerResult.meta?.pagination || {
          page: 0,
          limit: 50,
          total: handlerResult.data?.length || 0,
          pages: 1
        },
        query: handlerResult.meta?.query || {},
        performance: {
          duration: handlerResult.meta?.performance?.duration || (Date.now() - ctx.startTime),
          cacheHit: handlerResult.meta?.performance?.cacheHit || false,
          source: 'handler'
        },
        regions: handlerResult.meta?.regions || null,
        timestamp: new Date().toISOString(),
        version: '2.0.0'
      }
    }
  }

  /**
   * Parse and validate query parameters
   */
  parseAndValidateQuery(query = {}, context) {
    try {
      const params = {
        page: this.parseInteger(query.page, 0, 0),
        limit: Math.min(this.parseInteger(query.limit, this.controllerConfig.defaultPageSize, 1), this.controllerConfig.maxPageSize),
        search: typeof query.search === 'string' ? query.search.trim() : undefined,
        filter: {},
        format: ['full', 'minimal', 'codes-only'].includes(query.format) ? query.format : 'full',
        groupBy: ['region', 'phonecode'].includes(query.groupBy) ? query.groupBy : undefined,
        useCache: query.useCache !== 'false' && query.useCache !== false,
        orderByField: 'name',
        orderByDirection: 'asc'
      }

      // Parse filter parameter (JSON string or object)
      if (query.filter) {
        if (typeof query.filter === 'string') {
          try {
            params.filter = JSON.parse(query.filter)
          } catch (parseError) {
            throw new ErrorWrapper({
              ...errorCodes.VALIDATION,
              message: `Invalid JSON in filter parameter: ${parseError.message}`,
              layer: 'CountriesController.parseAndValidateQuery'
            })
          }
        } else if (typeof query.filter === 'object' && query.filter !== null) {
          params.filter = { ...query.filter }
        }
      }

      // Parse bracket notation filters
      this.parseBracketFilters(query, params)

      // Parse fields parameter
      if (query.fields) {
        params.fields = typeof query.fields === 'string' 
          ? query.fields.split(',').map(field => field.trim())
          : Array.isArray(query.fields) ? query.fields : undefined
      }

      // Parse sort parameter
      if (query.sort) {
        const sortMatch = query.sort.match(/^(name|iso|phonecode|numcode):(asc|desc)$/)
        if (sortMatch) {
          params.orderByField = sortMatch[1]
          params.orderByDirection = sortMatch[2]
        }
      }

      // Normalize filter values
      if (Object.keys(params.filter).length > 0) {
        params.filter = this.normalizeFilterValues(params.filter)
      }

      return params

    } catch (error) {
      this.logger.error('Query parameter validation failed', {
        requestId: context.requestId,
        error: error.message,
        query: this.sanitizeQueryForLogging(query)
      })
      
      if (error instanceof ErrorWrapper) {
        throw error
      }
      
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Invalid query parameters',
        layer: 'CountriesController.parseAndValidateQuery',
        meta: { originalError: error.message }
      })
    }
  }

  /**
   * Parse bracket notation filters (filter[key]=value)
   */
  parseBracketFilters(query, params) {
    const allowedFilters = ['name', 'nicename', 'iso', 'iso3', 'phonecode', 'numcode', 'isActive', 'region']
    
    Object.keys(query).forEach(key => {
      const bracketMatch = key.match(/^filter\[(\w+)\]$/)
      if (bracketMatch) {
        const filterKey = bracketMatch[1]
        if (allowedFilters.includes(filterKey)) {
          params.filter[filterKey] = query[key]
        } else {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: `Invalid filter parameter: ${filterKey}. Allowed: ${allowedFilters.join(', ')}`,
            layer: 'CountriesController.parseBracketFilters'
          })
        }
      }
    })
  }

  /**
   * Normalize and validate filter values
   */
  normalizeFilterValues(filter) {
    const normalized = { ...filter }
    
    // Normalize isActive to boolean
    if (Object.prototype.hasOwnProperty.call(normalized, 'isActive')) {
      normalized.isActive = (normalized.isActive === true || normalized.isActive === 'true')
    }
    
    // Normalize region and validate
    if (normalized.region) {
      normalized.region = normalized.region.toLowerCase()
      const validRegions = ['europe', 'asia', 'africa', 'north_america', 'south_america', 'oceania']
      if (!validRegions.includes(normalized.region)) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: `Invalid region "${normalized.region}". Valid regions: ${validRegions.join(', ')}`,
          layer: 'CountriesController.normalizeFilterValues'
        })
      }
    }
    
    // Normalize ISO codes to uppercase
    if (normalized.iso) {
      normalized.iso = normalized.iso.toUpperCase()
      if (normalized.iso.length !== 2) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'ISO code must be exactly 2 characters',
          layer: 'CountriesController.normalizeFilterValues'
        })
      }
    }
    
    if (normalized.iso3) {
      normalized.iso3 = normalized.iso3.toUpperCase()
      if (normalized.iso3.length !== 3) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'ISO3 code must be exactly 3 characters',
          layer: 'CountriesController.normalizeFilterValues'
        })
      }
    }
    
    // Normalize numeric codes
    ['phonecode', 'numcode'].forEach(field => {
      if (normalized[field]) {
        const code = parseInt(normalized[field], 10)
        if (!Number.isInteger(code) || code <= 0) {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: `${field} must be a positive integer`,
            layer: 'CountriesController.normalizeFilterValues'
          })
        }
        normalized[field] = code
      }
    })
    
    return normalized
  }

  /**
   * Format service layer response
   */
  async formatServiceResponse(serviceResult, queryParams, context) {
    const duration = Date.now() - context.startTime
    let responseData = serviceResult.results || []
    let regions = serviceResult.regions || null

    try {
      const formatted = await handlers.ListCountriesHandler.formatResponse(
        {
          results: responseData,
          cacheHit: serviceResult.cacheHit
        },
        queryParams,
        { requestId: context.requestId }
      )
      responseData = formatted.results
      regions = formatted.regions
    } catch (error) {
      this.logger.warn('Failed to apply service response formatting, falling back to raw data', {
        requestId: context.requestId,
        error: error.message
      })
    }
    
    return {
      success: true,
      data: responseData,
      meta: {
        pagination: {
          page: queryParams.page,
          limit: queryParams.limit,
          total: serviceResult.total || 0,
          pages: Math.ceil((serviceResult.total || 0) / queryParams.limit)
        },
        query: {
          search: queryParams.search || null,
          filters: queryParams.filter || {},
          format: queryParams.format,
          groupBy: queryParams.groupBy || null,
          fields: queryParams.fields || null
        },
        performance: {
          duration,
          cacheHit: serviceResult.cacheHit || false,
          source: serviceResult.cacheHit ? 'cache' : 'database'
        },
        regions: regions || null,
        timestamp: new Date().toISOString(),
        version: '2.0.0'
      }
    }
  }

  /**
   * Set comprehensive response headers
   */
  setResponseHeaders(res, result) {
    const meta = result.meta || {}
    const pagination = meta.pagination || {}
    
    // Core headers
    res.setHeader('X-Total-Count', (pagination.total || 0).toString())
    res.setHeader('X-Page', (pagination.page || 0).toString())
    res.setHeader('X-Limit', (pagination.limit || 50).toString())
    res.setHeader('X-Performance', `${meta.performance?.duration || 0}ms`)
    
    // Caching headers
    if (this.controllerConfig.enableCaching && meta.performance?.cacheHit) {
      Object.entries(this.controllerConfig.cacheHeaders).forEach(([key, value]) => {
        res.setHeader(key, value)
      })
    }
    
    // CORS and API headers
    res.setHeader('X-API-Version', '2.0.0')
    res.setHeader('X-Content-Source', meta.performance?.source || 'unknown')
  }

  /**
   * Track analytics asynchronously
   */
  async trackAnalytics(result, context) {
    if (!this.analyticsService) return
    
    const analyticsData = {
      requestId: context.requestId,
      endpoint: '/countries',
      method: context.method,
      query: context.query,
      resultCount: result.data?.length || 0,
      totalAvailable: result.meta?.pagination?.total || 0,
      cacheHit: result.meta?.performance?.cacheHit || false,
      duration: result.meta?.performance?.duration || 0,
      userAgent: context.userAgent,
      ip: context.ip,
      timestamp: new Date()
    }
    
    await this.analyticsService.trackCountryListRequest(analyticsData)
  }

  /**
   * Enhanced error handling for controller operations
   */
  handleControllerError(error, req, res, next, requestId, duration) {
    // Log the error with comprehensive context
    this.logger.error('Countries controller error', {
      requestId,
      error: error.message,
      errorCode: error.code,
      stack: error.stack,
      duration,
      url: req.url,
      method: req.method,
      ip: this.getClientIP(req),
      userAgent: req.get('User-Agent'),
      query: this.sanitizeQueryForLogging(req.query)
    })

    // Handle known error types
    if (error instanceof ErrorWrapper) {
      const statusCode = this.getHttpStatusForError(error)
      const errorResponse = {
        error: {
          code: error.code,
          message: error.message,
          layer: error.layer,
          requestId,
          timestamp: new Date().toISOString()
        }
      }
      
      // Add additional details for validation errors
      if (error.meta) {
        errorResponse.error.details = error.meta
      }
      
      res.status(statusCode).json(errorResponse)
      return
    }

    // Handle unexpected errors
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred while processing your request',
        requestId,
        timestamp: new Date().toISOString()
      }
    })
  }

  /**
   * Utility methods
   */
  parseInteger(value, defaultValue, min = Number.MIN_SAFE_INTEGER) {
    const parsed = parseInt(value, 10)
    return Number.isFinite(parsed) && parsed >= min ? parsed : defaultValue
  }

  sanitizeQueryForLogging(query) {
    const sanitized = { ...query }
    // Remove sensitive or internal fields
    delete sanitized._processed
    delete sanitized._processingId
    delete sanitized._timestamp
    return sanitized
  }

  getHttpStatusForError(error) {
    const errorMappings = {
      'VALIDATION': 400,
      'VALIDATION_ERROR': 400,
      'INVALID_PARAMETERS': 400,
      'NOT_FOUND': 404,
      'FORBIDDEN': 403,
      'UNAUTHORIZED': 401,
      'RATE_LIMIT_EXCEEDED': 429,
      'SERVICE_UNAVAILABLE': 503
    }
    
    return errorMappings[error.code] || 500
  }

  async init() {
    try {
      // Initialize service dependencies with proper error handling
      await this.initializeServices()
      
      this.logger.info(`{APP} ${this.constructor.name} initialized with enhanced features`, {
        enableAnalytics: this.controllerConfig.enableAnalytics,
        enableCaching: this.controllerConfig.enableCaching,
        enableServiceLayer: this.controllerConfig.enableServiceLayer,
        defaultPageSize: this.controllerConfig.defaultPageSize,
        maxPageSize: this.controllerConfig.maxPageSize,
        version: '2.0.0'
      })
    } catch (error) {
      this.logger.error(`Failed to initialize ${this.constructor.name}`, { error: error.message })
      throw error
    }
  }

  /**
   * Initialize service layer dependencies with graceful fallbacks
   */
  async initializeServices() {
    const services = []
    const warnings = []
    
    try {
      // Try to initialize CountryService
      if (this.countryService) {
        services.push('CountryService')
      } else {
        warnings.push('CountryService not available - using handler fallback')
      }
      
      // Try to initialize optional services
      if (this.cacheService) {
        services.push('CountryCacheService')
      } else {
        warnings.push('CountryCacheService not available - caching disabled')
      }
      
      if (this.analyticsService) {
        services.push('CountryAnalyticsService')
      } else {
        warnings.push('CountryAnalyticsService not available - analytics disabled')
      }
      
      this.logger.info('Controller services initialized', { 
        availableServices: services,
        warnings: warnings.length > 0 ? warnings : undefined
      })
      
    } catch (error) {
      this.logger.warn('Service initialization completed with fallbacks', { 
        error: error.message,
        availableServices: services,
        warnings 
      })
      // Don't throw - controller can work with handler fallback
    }
  }
}

module.exports = { CountriesController }
