/**
 * Enterprise-level Countries API Tests
 * Tests for GET /api/v1/countries
 * 
 * Coverage:
 * - Country listing functionality
 * - Filtering and sorting options
 * - Caching behavior
 * - Performance testing
 * - Response format validation
 * - Error handling
 */

const {
  chai,
  expect,
  baseUrl,
  DatabaseHelper,
  ResponseValidator,
  TestUtils
} = require('../test-utils')

describe('🌍 Countries API Tests', function() {
  this.timeout(10000)

  before(async function() {
    await DatabaseHelper.seedTestCountries()
  })

  after(async function() {
    await DatabaseHelper.clearTestData()
  })

  describe('✅ Basic Country Listing', function() {
    
    it('should return list of all active countries', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .set('Content-Type', 'application/json')

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      expect(data).to.be.an('array')
      expect(data.length).to.be.greaterThan(0)
      
      // Validate country structure
      data.forEach(country => {
        expect(country).to.have.property('id').that.is.a('number')
        expect(country).to.have.property('name').that.is.a('string')
        expect(country).to.have.property('nicename').that.is.a('string')
        expect(country).to.have.property('iso').that.is.a('string').with.length(2)
        expect(country).to.have.property('phonecode').that.is.a('string')
        expect(country).to.have.property('isActive', true)
      })
    })

    it('should return countries in alphabetical order by default', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      const countryNames = data.map(country => country.name)
      const sortedNames = [...countryNames].sort()
      
      expect(countryNames).to.deep.equal(sortedNames)
    })

    it('should only return active countries', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      data.forEach(country => {
        expect(country.isActive).to.be.true
      })
    })

    it('should include proper HTTP caching headers', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')

      ResponseValidator.validateSuccessResponse(response, 200)
      
      // Should include cache control headers for static data
      expect(response.headers).to.have.property('cache-control')
      expect(response.headers['cache-control']).to.include('public')
      expect(response.headers).to.have.property('etag')
    })
  })

  describe('🔍 Filtering and Query Options', function() {
    
    it('should filter countries by search query', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ search: 'United' })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      expect(data.length).to.be.greaterThan(0)
      
      data.forEach(country => {
        const searchable = `${country.name} ${country.nicename}`.toLowerCase()
        expect(searchable).to.include('united')
      })
    })

    it('should filter countries by ISO code', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ iso: 'US' })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      expect(data).to.have.lengthOf(1)
      expect(data[0].iso).to.equal('US')
      expect(data[0].name).to.include('United States')
    })

    it('should filter countries by phone code', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ phonecode: '1' })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      expect(data.length).to.be.greaterThan(0)
      
      data.forEach(country => {
        expect(country.phonecode).to.equal('1')
      })
    })

    it('should handle case-insensitive search', async function() {
      const responses = await Promise.all([
        chai.request(baseUrl).get('/api/v1/countries').query({ search: 'UNITED' }),
        chai.request(baseUrl).get('/api/v1/countries').query({ search: 'united' }),
        chai.request(baseUrl).get('/api/v1/countries').query({ search: 'United' })
      ])

      responses.forEach(response => {
        ResponseValidator.validateSuccessResponse(response, 200)
      })

      // All searches should return the same results
      const resultCounts = responses.map(r => r.body.data.length)
      expect(new Set(resultCounts).size).to.equal(1) // All should be the same
    })

    it('should return empty array for non-existent search terms', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ search: 'NonExistentCountry123' })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      expect(data).to.be.an('array').with.length(0)
    })
  })

  describe('📊 Sorting and Pagination', function() {
    
    it('should support different sorting options', async function() {
      const sortOptions = ['name', 'iso', 'phonecode']
      
      for (const sortBy of sortOptions) {
        const response = await chai.request(baseUrl)
          .get('/api/v1/countries')
          .query({ sortBy })

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        const values = data.map(country => country[sortBy])
        const sortedValues = [...values].sort()
        
        expect(values).to.deep.equal(sortedValues)
      }
    })

    it('should support descending sort order', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ sortBy: 'name', sortOrder: 'desc' })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      const countryNames = data.map(country => country.name)
      const sortedNamesDesc = [...countryNames].sort().reverse()
      
      expect(countryNames).to.deep.equal(sortedNamesDesc)
    })

    it('should support pagination', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ page: 1, limit: 2 })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data, meta } = response.body
      expect(data).to.be.an('array').with.length.at.most(2)
      expect(meta).to.have.property('pagination')
      expect(meta.pagination).to.have.property('page', 1)
      expect(meta.pagination).to.have.property('limit', 2)
      expect(meta.pagination).to.have.property('total')
      expect(meta.pagination).to.have.property('totalPages')
    })

    it('should validate pagination parameters', async function() {
      const invalidParams = [
        { page: 0 },
        { page: -1 },
        { limit: 0 },
        { limit: 1001 }, // Assuming max limit of 1000
        { page: 'invalid' },
        { limit: 'invalid' }
      ]
      
      for (const params of invalidParams) {
        const response = await chai.request(baseUrl)
          .get('/api/v1/countries')
          .query(params)

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      }
    })
  })

  describe('📱 Response Formats', function() {
    
    it('should support minimal response format', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ format: 'minimal' })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      data.forEach(country => {
        expect(country).to.have.all.keys(['id', 'name', 'iso'])
        expect(country).to.not.have.any.keys(['nicename', 'phonecode'])
      })
    })

    it('should support detailed response format', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ format: 'detailed' })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      data.forEach(country => {
        expect(country).to.have.all.keys([
          'id', 'name', 'nicename', 'iso', 'phonecode', 'isActive',
          'region', 'capital', 'currency', 'timezone'
        ])
      })
    })

    it('should default to standard format', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      data.forEach(country => {
        expect(country).to.have.all.keys([
          'id', 'name', 'nicename', 'iso', 'phonecode', 'isActive'
        ])
      })
    })

    it('should validate format parameter', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ format: 'invalid_format' })

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
    })
  })

  describe('⚡ Performance and Caching', function() {
    
    it('should respond within acceptable time limits', async function() {
      const startTime = Date.now()
      
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')

      const endTime = Date.now()
      const duration = endTime - startTime

      ResponseValidator.validateSuccessResponse(response, 200)
      expect(duration).to.be.lessThan(1000) // Should complete within 1 second
    })

    it('should handle concurrent requests efficiently', async function() {
      const concurrentRequests = Array(10).fill().map(() =>
        chai.request(baseUrl).get('/api/v1/countries')
      )

      const startTime = Date.now()
      const responses = await Promise.all(concurrentRequests)
      const endTime = Date.now()
      const totalDuration = endTime - startTime

      responses.forEach(response => {
        ResponseValidator.validateSuccessResponse(response, 200)
      })

      expect(totalDuration).to.be.lessThan(2000) // All requests within 2 seconds
    })

    it('should support conditional requests with ETag', async function() {
      // First request to get ETag
      const firstResponse = await chai.request(baseUrl)
        .get('/api/v1/countries')

      expect(firstResponse.headers).to.have.property('etag')
      const etag = firstResponse.headers.etag

      // Second request with If-None-Match header
      const secondResponse = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .set('If-None-Match', etag)

      expect(secondResponse.status).to.equal(304) // Not Modified
    })

    it('should cache results appropriately', async function() {
      // First request
      const response1 = await chai.request(baseUrl)
        .get('/api/v1/countries')

      // Second request should be faster due to caching
      const startTime = Date.now()
      const response2 = await chai.request(baseUrl)
        .get('/api/v1/countries')
      const endTime = Date.now()

      ResponseValidator.validateSuccessResponse(response1, 200)
      ResponseValidator.validateSuccessResponse(response2, 200)
      
      expect(endTime - startTime).to.be.lessThan(100) // Should be very fast if cached
      expect(response1.body.data).to.deep.equal(response2.body.data)
    })
  })

  describe('🔒 Security and Validation', function() {
    
    it('should handle SQL injection attempts in search', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ search: '\'; DROP TABLE countries; --' })

      // Should either return empty results or validate input safely
      expect(response.status).to.be.oneOf([200, 400])
      
      if (response.status === 200) {
        expect(response.body.data).to.be.an('array')
      }
    })

    it('should handle XSS attempts in parameters', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ search: '<script>alert("xss")</script>' })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      expect(data).to.be.an('array').with.length(0)
    })

    it('should validate parameter types', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ 
          page: 'not_a_number',
          limit: 'also_not_a_number'
        })

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
    })

    it('should not expose sensitive server information', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')

      expect(response.headers).to.not.have.any.keys([
        'server', 'x-powered-by'
      ])
    })
  })

  describe('📊 Response Consistency', function() {
    
    it('should maintain consistent response structure across different queries', async function() {
      const testQueries = [
        {},
        { search: 'United' },
        { sortBy: 'name' },
        { page: 1, limit: 5 },
        { format: 'minimal' }
      ]
      
      for (const query of testQueries) {
        const response = await chai.request(baseUrl)
          .get('/api/v1/countries')
          .query(query)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data, meta } = response.body
        expect(data).to.be.an('array')
        expect(meta).to.have.property('requestId')
        expect(meta).to.have.property('timestamp')
        expect(meta).to.have.property('processingTime')
      }
    })

    it('should include appropriate metadata', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { meta } = response.body
      expect(meta).to.have.property('totalCount')
      expect(meta).to.have.property('filters')
      expect(meta).to.have.property('cacheStatus')
    })

    it('should handle empty results gracefully', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ search: 'NonExistentCountry' })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data, meta } = response.body
      expect(data).to.be.an('array').with.length(0)
      expect(meta.totalCount).to.equal(0)
    })
  })

  describe('🌐 Internationalization', function() {
    
    it('should support different language headers', async function() {
      const languages = ['en', 'es', 'fr', 'de']
      
      for (const lang of languages) {
        const response = await chai.request(baseUrl)
          .get('/api/v1/countries')
          .set('Accept-Language', lang)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        // Response should indicate the language used
        const { meta } = response.body
        expect(meta).to.have.property('language')
      }
    })

    it('should return localized country names when supported', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .set('Accept-Language', 'es')
        .query({ localized: true })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      // Should include localized names if available
      data.forEach(country => {
        if (country.localizedNames) {
          expect(country.localizedNames).to.have.property('es')
        }
      })
    })
  })

  describe('📋 Edge Cases and Error Handling', function() {
    
    it('should handle very large limit values', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries')
        .query({ limit: 10000 })

      // Should either limit to max value or return validation error
      expect(response.status).to.be.oneOf([200, 400])
      
      if (response.status === 200) {
        expect(response.body.data.length).to.be.at.most(1000) // Assumed max limit
      }
    })

    it('should handle special characters in search', async function() {
      const specialChars = ['çôte d\'ivoire', 'åland', 'ñ', '中国']
      
      for (const searchTerm of specialChars) {
        const response = await chai.request(baseUrl)
          .get('/api/v1/countries')
          .query({ search: searchTerm })

        ResponseValidator.validateSuccessResponse(response, 200)
        expect(response.body.data).to.be.an('array')
      }
    })

    it('should handle malformed query parameters gracefully', async function() {
      const response = await chai.request(baseUrl)
        .get('/api/v1/countries?malformed[query=value')

      // Should handle malformed URLs gracefully
      expect(response.status).to.be.oneOf([200, 400])
    })
  })
})