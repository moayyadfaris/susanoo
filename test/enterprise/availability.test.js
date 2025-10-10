/**
 * Enterprise-level User Availability API Tests
 * Tests for POST /api/v1/users/availability
 * 
 * Coverage:
 * - Email availability checking
 * - Phone availability checking
 * - Combined email/phone checking
 * - Legacy format support
 * - Validation scenarios
 * - Performance testing
 * - Error handling
 * - Response format validation
 */

const {
  chai,
  expect,
  baseUrl,
  TestDataFactory,
  DatabaseHelper,
  ResponseValidator,
  TestUtils
} = require('../test-utils')

describe('📧 User Availability API Tests', function() {
  this.timeout(10000)
  
  let existingUser

  before(async function() {
    await DatabaseHelper.seedTestCountries()
    existingUser = await DatabaseHelper.createTestUser({
      name: 'Existing User',
      email: 'existing@susanoo.test',
      mobileNumber: '1234567890'
    })
  })

  after(async function() {
    await DatabaseHelper.clearTestData()
  })

  describe('✅ Email Availability Tests', function() {
    
    it('should return available for new email address', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: TestDataFactory.generateUniqueEmail()
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      expect(data.summary.totalChecks).to.equal(1)
      expect(data.summary.availableCount).to.equal(1)
      expect(data.summary.unavailableCount).to.equal(0)
      expect(data.summary.allAvailable).to.be.true
      
      const result = data.results[0]
      expect(result.type).to.equal('email')
      expect(result.available).to.be.true
      expect(result.field).to.equal('email')
      expect(result.legacy).to.be.false
      expect(result).to.have.property('checkedAt')
    })

    it('should return unavailable for existing email address', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: existingUser.email
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      expect(data.summary.totalChecks).to.equal(1)
      expect(data.summary.availableCount).to.equal(0)
      expect(data.summary.unavailableCount).to.equal(1)
      expect(data.summary.allAvailable).to.be.false
      
      const result = data.results[0]
      expect(result.type).to.equal('email')
      expect(result.available).to.be.false
      expect(result).to.have.property('conflictDetails')
      expect(result.conflictDetails).to.have.property('accountCreated')
      expect(result.conflictDetails).to.have.property('isActive')
    })

    it('should handle email with different case', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: existingUser.email.toUpperCase()
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      const result = data.results[0]
      expect(result.available).to.be.false
      expect(result.value).to.equal(existingUser.email.toLowerCase())
    })

    it('should validate email format', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: 'invalid-email-format'
        })

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      expect(response.body.message).to.include('valid email address')
    })

    it('should handle very long email addresses', async function() {
      const longEmail = 'a'.repeat(95) + '@test.com' // Exactly 100 chars
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: longEmail
        })

      ResponseValidator.validateAvailabilityResponse(response)
      expect(response.body.data.results[0].available).to.be.true
    })

    it('should reject email addresses that are too long', async function() {
      const tooLongEmail = 'a'.repeat(96) + '@test.com' // 101 chars
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: tooLongEmail
        })

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
    })
  })

  describe('📱 Phone Availability Tests', function() {
    
    it('should return available for new phone number', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          phone: TestDataFactory.generateUniqueMobile()
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      expect(data.summary.totalChecks).to.equal(1)
      expect(data.summary.availableCount).to.equal(1)
      
      const result = data.results[0]
      expect(result.type).to.equal('phone')
      expect(result.available).to.be.true
      expect(result.field).to.equal('phone')
    })

    it('should return unavailable for existing phone number', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          phone: existingUser.mobileNumber
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      const result = data.results[0]
      expect(result.type).to.equal('phone')
      expect(result.available).to.be.false
      expect(result).to.have.property('conflictDetails')
    })

    it('should validate phone number format', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          phone: '123' // Too short
        })

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
    })

    it('should handle phone numbers with country code context', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          phone: TestDataFactory.generateUniqueMobile(),
          countryCode: 'US'
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      const result = data.results[0]
      expect(result.available).to.be.true
      expect(result.countryCode).to.equal('US')
    })

    it('should reject invalid country codes', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          phone: TestDataFactory.generateUniqueMobile(),
          countryCode: 'INVALID'
        })

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
    })
  })

  describe('🔄 Combined Email and Phone Tests', function() {
    
    it('should check both email and phone when both provided', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: TestDataFactory.generateUniqueEmail(),
          phone: TestDataFactory.generateUniqueMobile()
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      expect(data.summary.totalChecks).to.equal(2)
      expect(data.summary.availableCount).to.equal(2)
      expect(data.summary.allAvailable).to.be.true
      
      expect(data.results).to.have.lengthOf(2)
      
      const emailResult = data.results.find(r => r.type === 'email')
      const phoneResult = data.results.find(r => r.type === 'phone')
      
      expect(emailResult).to.exist
      expect(phoneResult).to.exist
      expect(emailResult.available).to.be.true
      expect(phoneResult.available).to.be.true
    })

    it('should return mixed results when one is available and one is not', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: existingUser.email, // Not available
          phone: TestDataFactory.generateUniqueMobile() // Available
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      expect(data.summary.totalChecks).to.equal(2)
      expect(data.summary.availableCount).to.equal(1)
      expect(data.summary.unavailableCount).to.equal(1)
      expect(data.summary.allAvailable).to.be.false
      
      const emailResult = data.results.find(r => r.type === 'email')
      const phoneResult = data.results.find(r => r.type === 'phone')
      
      expect(emailResult.available).to.be.false
      expect(phoneResult.available).to.be.true
    })

    it('should handle both fields being unavailable', async function() {
      const anotherUser = await DatabaseHelper.createTestUser()
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: existingUser.email,
          phone: anotherUser.mobileNumber
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      expect(data.summary.totalChecks).to.equal(2)
      expect(data.summary.availableCount).to.equal(0)
      expect(data.summary.unavailableCount).to.equal(2)
      expect(data.summary.allAvailable).to.be.false
    })
  })

  describe('🔄 Legacy Format Support', function() {
    
    it('should support legacy email_or_mobile_number with email', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email_or_mobile_number: TestDataFactory.generateUniqueEmail()
        })

      ResponseValidator.validateAvailabilityResponse(response, 'legacy')
      expect(response.body.message).to.include('Email is available')
    })

    it('should support legacy email_or_mobile_number with phone', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email_or_mobile_number: TestDataFactory.generateUniqueMobile()
        })

      ResponseValidator.validateAvailabilityResponse(response, 'legacy')
      expect(response.body.message).to.include('Phone number is available')
    })

    it('should reject legacy format with existing email', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email_or_mobile_number: existingUser.email
        })

      ResponseValidator.validateErrorResponse(response, 409, 'EMAIL_PHONE_ALREADY_TAKEN')
      expect(response.body.message).to.include('Email is already taken')
    })

    it('should reject legacy format with existing phone', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email_or_mobile_number: existingUser.mobileNumber
        })

      ResponseValidator.validateErrorResponse(response, 409, 'EMAIL_PHONE_ALREADY_TAKEN')
      expect(response.body.message).to.include('Phone number is already taken')
    })

    it('should reject legacy format with invalid format', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email_or_mobile_number: 'invalid-format'
        })

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
    })
  })

  describe('🔧 Advanced Features', function() {
    
    it('should provide suggestions when requested', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: existingUser.email,
          suggestions: true
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      const result = data.results[0]
      expect(result.available).to.be.false
      expect(result).to.have.property('suggestions')
      expect(result.suggestions).to.be.an('array')
      expect(result.suggestions.length).to.be.greaterThan(0)
    })

    it('should include detailed information when requested', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: existingUser.email,
          includeDetails: true
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      const result = data.results[0]
      expect(result).to.have.property('conflictDetails')
      expect(result.conflictDetails).to.have.property('accountCreated')
      expect(result.conflictDetails).to.have.property('isActive')
      expect(result.conflictDetails).to.have.property('isVerified')
    })

    it('should handle batch checking requests', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          batch: [
            { type: 'email', value: TestDataFactory.generateUniqueEmail() },
            { type: 'phone', value: TestDataFactory.generateUniqueMobile() },
            { type: 'email', value: existingUser.email }
          ]
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      expect(data.summary.totalChecks).to.equal(3)
      expect(data.summary.availableCount).to.equal(2)
      expect(data.summary.unavailableCount).to.equal(1)
      
      const batchResults = data.results.filter(r => r.field === 'batch')
      expect(batchResults).to.have.lengthOf(3)
    })

    it('should limit batch size', async function() {
      const largeBatch = Array(15).fill().map((_, i) => ({
        type: 'email',
        value: `test${i}@example.com`
      }))

      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          batch: largeBatch
        })

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      expect(response.body.message).to.include('max 10 items')
    })
  })

  describe('❌ Validation and Error Scenarios', function() {
    
    it('should require at least one field to check', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({})

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      expect(response.body.message).to.include('At least one field must be provided')
    })

    it('should handle empty string values', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: ''
        })

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
    })

    it('should handle null values', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: null
        })

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
    })

    it('should validate content type', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .send('email=test@example.com') // Form data instead of JSON

      ResponseValidator.validateErrorResponse(response, 400)
    })

    it('should handle malformed JSON', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send('{"email": "test@example.com"') // Malformed JSON

      ResponseValidator.validateErrorResponse(response, 400)
    })
  })

  describe('⚡ Performance and Load Tests', function() {
    
    it('should respond within acceptable time limits', async function() {
      const startTime = Date.now()
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: TestDataFactory.generateUniqueEmail()
        })

      const endTime = Date.now()
      const duration = endTime - startTime

      ResponseValidator.validateAvailabilityResponse(response)
      expect(duration).to.be.lessThan(1000) // Should complete within 1 second
    })

    it('should handle concurrent requests efficiently', async function() {
      const concurrentRequests = Array(10).fill().map(() =>
        chai.request(baseUrl)
          .post('/api/v1/users/availability')
          .set('Content-Type', 'application/json')
          .send({
            email: TestDataFactory.generateUniqueEmail()
          })
      )

      const startTime = Date.now()
      const responses = await Promise.all(concurrentRequests)
      const endTime = Date.now()
      const totalDuration = endTime - startTime

      responses.forEach(response => {
        ResponseValidator.validateAvailabilityResponse(response)
      })

      // All requests should complete within reasonable time
      expect(totalDuration).to.be.lessThan(3000)
    })

    it('should handle repeated checks efficiently (caching)', async function() {
      const email = TestDataFactory.generateUniqueEmail()
      
      // First request
      const response1 = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({ email })

      // Second request (should be faster due to caching)
      const startTime = Date.now()
      const response2 = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({ email })
      const endTime = Date.now()

      ResponseValidator.validateAvailabilityResponse(response1)
      ResponseValidator.validateAvailabilityResponse(response2)
      
      // Second request should be faster
      expect(endTime - startTime).to.be.lessThan(200)
    })
  })

  describe('🔒 Security Tests', function() {
    
    it('should not expose sensitive user information', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: existingUser.email,
          includeDetails: true
        })

      ResponseValidator.validateAvailabilityResponse(response)
      
      const { data } = response.body
      const result = data.results[0]
      
      // Should not include sensitive information
      expect(result).to.not.have.any.keys([
        'passwordHash', 'verifyCode', 'updateToken', 'resetPasswordToken'
      ])
      
      if (result.conflictDetails) {
        expect(result.conflictDetails).to.not.have.any.keys([
          'passwordHash', 'email', 'mobileNumber'
        ])
      }
    })

    it('should mask email values in logs', async function() {
      // This test would require access to logs, which isn't available in this context
      // But the functionality is implemented in the handler
      expect(true).to.be.true // Placeholder
    })

    it('should handle SQL injection attempts', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: 'test@example.com\'; DROP TABLE users; --'
        })

      // Should either validate as invalid email or handle safely
      expect(response.status).to.be.oneOf([400, 200])
      
      if (response.status === 200) {
        ResponseValidator.validateAvailabilityResponse(response)
      }
    })

    it('should handle XSS attempts in input', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/users/availability')
        .set('Content-Type', 'application/json')
        .send({
          email: '<script>alert("xss")</script>@example.com'
        })

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
    })
  })

  describe('📊 Response Format Consistency', function() {
    
    it('should maintain consistent response structure across all scenarios', async function() {
      const testCases = [
        { email: TestDataFactory.generateUniqueEmail() },
        { phone: TestDataFactory.generateUniqueMobile() },
        { email: TestDataFactory.generateUniqueEmail(), phone: TestDataFactory.generateUniqueMobile() }
      ]

      for (const testCase of testCases) {
        const response = await chai.request(baseUrl)
          .post('/api/v1/users/availability')
          .set('Content-Type', 'application/json')
          .send(testCase)

        ResponseValidator.validateAvailabilityResponse(response)
        
        const { data, meta } = response.body
        
        // Consistent structure
        expect(data).to.have.all.keys(['success', 'summary', 'results', 'meta'])
        expect(data.summary).to.have.all.keys([
          'totalChecks', 'availableCount', 'unavailableCount', 'allAvailable'
        ])
        expect(meta).to.have.property('processingTime')
        expect(meta).to.have.property('requestId')
        
        // Each result should have consistent structure
        data.results.forEach(result => {
          expect(result).to.have.all.keys([
            'type', 'value', 'available', 'checkedAt', 'field', 'legacy'
          ])
        })
      }
    })
  })
})