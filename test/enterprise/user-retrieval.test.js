/**
 * Enterprise-level User Retrieval API Tests
 * Tests for GET /api/v1/users/current and GET /api/v1/users/{userId}
 * 
 * Coverage:
 * - Current user profile retrieval
 * - User by ID retrieval
 * - Different access levels and permissions
 * - Response format variations
 * - Privacy and security
 * - Performance testing
 * - Error handling
 */

const {
  chai,
  expect,
  baseUrl,
  TestDataFactory,
  AuthHelper,
  DatabaseHelper,
  ResponseValidator,
  TestUtils
} = require('../test-utils')

describe('👥 User Retrieval API Tests', function() {
  this.timeout(10000)
  
  let testUser
  let otherUser
  let adminUser
  let authHelper

  before(async function() {
    await DatabaseHelper.seedTestCountries()
    
    // Create test users with different roles
    testUser = await DatabaseHelper.createTestUser({
      name: 'Test User',
      role: 'ROLE_USER',
      isVerified: true,
      isActive: true
    })
    
    otherUser = await DatabaseHelper.createTestUser({
      name: 'Other User',
      role: 'ROLE_USER',
      isVerified: true,
      isActive: true
    })
    
    adminUser = await DatabaseHelper.createTestUser({
      name: 'Admin User',
      role: 'ROLE_ADMIN',
      isVerified: true,
      isActive: true
    })
    
    authHelper = new AuthHelper()
  })

  after(async function() {
    await authHelper.cleanup()
    await DatabaseHelper.clearTestData()
  })

  describe('GET /api/v1/users/current', function() {
    
    describe('✅ Authenticated Access', function() {
      
      it('should return current user profile with full details', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .set('Content-Type', 'application/json')

        ResponseValidator.validateSuccessResponse(response, 200)
        ResponseValidator.validateUserObject(response.body.data, true)
        
        const { data } = response.body
        expect(data.id).to.equal(testUser.id)
        expect(data.email).to.equal(testUser.email)
        expect(data.name).to.equal(testUser.name)
        
        // Should include private information for current user
        expect(data).to.have.property('mobileNumber')
        expect(data).to.have.property('countryId')
        expect(data).to.have.property('preferences')
        expect(data).to.have.property('settings')
        expect(data).to.have.property('verification')
      })

      it('should include user preferences and settings', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data.preferences).to.have.property('language')
        expect(data.preferences).to.have.property('notifications')
        expect(data.settings).to.have.property('privacy')
        expect(data.settings).to.have.property('marketing')
      })

      it('should include verification status', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data.verification).to.have.property('emailVerified')
        expect(data.verification).to.have.property('mobileVerified')
        expect(data.verification).to.have.property('isVerified')
        expect(data.verification).to.have.property('nextSteps')
      })

      it('should include account statistics', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data.statistics).to.have.property('accountAge')
        expect(data.statistics).to.have.property('lastLoginAt')
        expect(data.statistics).to.have.property('loginCount')
      })

      it('should not include sensitive information', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data).to.not.have.any.keys([
          'passwordHash', 'verifyCode', 'updateToken', 'resetPasswordToken'
        ])
      })
    })

    describe('❌ Unauthenticated Access', function() {
      
      it('should reject requests without authentication token', async function() {
        const response = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Content-Type', 'application/json')

        ResponseValidator.validateErrorResponse(response, 401, 'AUTH_ERROR')
      })

      it('should reject requests with invalid token', async function() {
        const response = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', 'Bearer invalid_token')
          .set('Content-Type', 'application/json')

        ResponseValidator.validateErrorResponse(response, 401, 'AUTH_ERROR')
      })

      it('should reject requests with expired token', async function() {
        // This test would require token manipulation or time mocking
        // For now, we'll test with a malformed token that looks expired
        const response = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.token')
          .set('Content-Type', 'application/json')

        ResponseValidator.validateErrorResponse(response, 401, 'AUTH_ERROR')
      })
    })

    describe('🔐 Account Status Scenarios', function() {
      
      it('should handle inactive user accounts', async function() {
        const inactiveUser = await DatabaseHelper.createTestUser({
          isActive: false
        })
        
        // Try to login (should fail for inactive account)
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: inactiveUser.email,
            password: inactiveUser.password,
            fingerprint: TestDataFactory.generateFingerprint()
          })

        ResponseValidator.validateErrorResponse(response, 403, 'ACCOUNT_INACTIVE')
      })

      it('should allow access for unverified but active users', async function() {
        const unverifiedUser = await DatabaseHelper.createTestUser({
          isActive: true,
          isVerified: false
        })
        
        const session = await authHelper.loginUser({
          email: unverifiedUser.email,
          password: unverifiedUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        expect(response.body.data.verification.isVerified).to.be.false
      })
    })
  })

  describe('GET /api/v1/users/{userId}', function() {
    
    describe('✅ Valid Access Scenarios', function() {
      
      it('should return user profile with public information for regular users', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get(`/api/v1/users/${otherUser.id}`)
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        ResponseValidator.validateUserObject(response.body.data, false)
        
        const { data } = response.body
        expect(data.id).to.equal(otherUser.id)
        expect(data.name).to.equal(otherUser.name)
        
        // Should not include private information for other users
        expect(data).to.not.have.any.keys([
          'mobileNumber', 'email', 'preferences', 'settings'
        ])
      })

      it('should return own profile when accessing own ID', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get(`/api/v1/users/${testUser.id}`)
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        ResponseValidator.validateUserObject(response.body.data, true)
        
        const { data } = response.body
        expect(data.id).to.equal(testUser.id)
        
        // Should include private information when accessing own profile
        expect(data).to.have.property('email')
        expect(data).to.have.property('mobileNumber')
      })

      it('should allow admin users to see more details', async function() {
        const adminSession = await authHelper.loginUser({
          email: adminUser.email,
          password: adminUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get(`/api/v1/users/${testUser.id}`)
          .set('Authorization', `Bearer ${adminSession.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data.id).to.equal(testUser.id)
        
        // Admin should see more details but still not sensitive information
        expect(data).to.have.property('email')
        expect(data).to.have.property('accountStatus')
        expect(data).to.have.property('createdAt')
        expect(data).to.not.have.any.keys(['passwordHash', 'verifyCode'])
      })

      it('should support different response formats', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const formats = ['summary', 'public', 'full']
        
        for (const format of formats) {
          const response = await chai.request(baseUrl)
            .get(`/api/v1/users/${otherUser.id}`)
            .query({ format })
            .set('Authorization', `Bearer ${session.accessToken}`)

          ResponseValidator.validateSuccessResponse(response, 200)
          
          const { data } = response.body
          expect(data.id).to.equal(otherUser.id)
          
          // Different formats should return different levels of detail
          if (format === 'summary') {
            expect(Object.keys(data)).to.have.length.lessThan(10)
          } else if (format === 'public') {
            expect(data).to.not.have.property('email')
          }
        }
      })

      it('should include profile statistics for public profiles', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get(`/api/v1/users/${otherUser.id}`)
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data.profile).to.have.property('joinedAt')
        expect(data.profile).to.have.property('publicStats')
      })
    })

    describe('❌ Invalid Access Scenarios', function() {
      
      it('should reject requests for non-existent users', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get('/api/v1/users/999999')
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateErrorResponse(response, 404, 'USER_NOT_FOUND')
      })

      it('should reject requests with invalid user ID format', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const invalidIds = ['abc', '0', '-1', 'null', 'undefined']
        
        for (const invalidId of invalidIds) {
          const response = await chai.request(baseUrl)
            .get(`/api/v1/users/${invalidId}`)
            .set('Authorization', `Bearer ${session.accessToken}`)

          ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        }
      })

      it('should reject unauthenticated requests', async function() {
        const response = await chai.request(baseUrl)
          .get(`/api/v1/users/${otherUser.id}`)

        ResponseValidator.validateErrorResponse(response, 401, 'AUTH_ERROR')
      })

      it('should handle deleted/inactive users appropriately', async function() {
        const inactiveUser = await DatabaseHelper.createTestUser({
          isActive: false
        })
        
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get(`/api/v1/users/${inactiveUser.id}`)
          .set('Authorization', `Bearer ${session.accessToken}`)

        // Should either return 404 or limited info depending on business logic
        expect(response.status).to.be.oneOf([404, 200])
        
        if (response.status === 200) {
          expect(response.body.data.accountStatus).to.equal('inactive')
        }
      })
    })

    describe('🔐 Privacy and Security', function() {
      
      it('should not expose private information to unauthorized users', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get(`/api/v1/users/${otherUser.id}`)
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data).to.not.have.any.keys([
          'email', 'mobileNumber', 'passwordHash', 'verifyCode',
          'updateToken', 'preferences', 'settings', 'deviceInfo'
        ])
      })

      it('should respect user privacy settings', async function() {
        // This test assumes privacy settings exist
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get(`/api/v1/users/${otherUser.id}`)
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        // Should only show public information
        expect(data).to.have.property('id')
        expect(data).to.have.property('name')
        expect(data).to.have.property('profile')
      })

      it('should prevent enumeration attacks', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        // Test with sequential IDs to ensure no information leakage
        const responses = await Promise.all([
          chai.request(baseUrl)
            .get('/api/v1/users/999998')
            .set('Authorization', `Bearer ${session.accessToken}`),
          chai.request(baseUrl)
            .get('/api/v1/users/999999')
            .set('Authorization', `Bearer ${session.accessToken}`)
        ])
        
        // Both should return the same error response
        responses.forEach(response => {
          ResponseValidator.validateErrorResponse(response, 404, 'USER_NOT_FOUND')
        })
      })
    })

    describe('📊 Query Parameters and Filtering', function() {
      
      it('should handle include/exclude field parameters', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get(`/api/v1/users/${testUser.id}`)
          .query({ 
            include: 'profile,statistics',
            exclude: 'metadata'
          })
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data).to.have.property('profile')
        expect(data).to.have.property('statistics')
        expect(data).to.not.have.property('metadata')
      })

      it('should validate query parameters', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .get(`/api/v1/users/${testUser.id}`)
          .query({ format: 'invalid_format' })
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      })
    })
  })

  describe('⚡ Performance Tests', function() {
    
    it('should respond within acceptable time limits', async function() {
      const session = await authHelper.loginUser({
        email: testUser.email,
        password: testUser.password
      })
      
      const startTime = Date.now()
      
      const response = await chai.request(baseUrl)
        .get('/api/v1/users/current')
        .set('Authorization', `Bearer ${session.accessToken}`)

      const endTime = Date.now()
      const duration = endTime - startTime

      ResponseValidator.validateSuccessResponse(response, 200)
      expect(duration).to.be.lessThan(1000) // Should complete within 1 second
    })

    it('should handle concurrent requests efficiently', async function() {
      const session = await authHelper.loginUser({
        email: testUser.email,
        password: testUser.password
      })
      
      const concurrentRequests = Array(5).fill().map(() =>
        chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', `Bearer ${session.accessToken}`)
      )

      const responses = await Promise.all(concurrentRequests)
      
      responses.forEach(response => {
        ResponseValidator.validateSuccessResponse(response, 200)
      })
    })

    it('should cache user data appropriately', async function() {
      const session = await authHelper.loginUser({
        email: testUser.email,
        password: testUser.password
      })
      
      // First request
      const response1 = await chai.request(baseUrl)
        .get(`/api/v1/users/${otherUser.id}`)
        .set('Authorization', `Bearer ${session.accessToken}`)

      // Second request (should be faster if cached)
      const startTime = Date.now()
      const response2 = await chai.request(baseUrl)
        .get(`/api/v1/users/${otherUser.id}`)
        .set('Authorization', `Bearer ${session.accessToken}`)
      const endTime = Date.now()

      ResponseValidator.validateSuccessResponse(response1, 200)
      ResponseValidator.validateSuccessResponse(response2, 200)
      
      expect(endTime - startTime).to.be.lessThan(200) // Should be fast if cached
    })
  })

  describe('🔄 Response Format Consistency', function() {
    
    it('should maintain consistent response structure', async function() {
      const session = await authHelper.loginUser({
        email: testUser.email,
        password: testUser.password
      })
      
      const endpoints = [
        '/api/v1/users/current',
        `/api/v1/users/${testUser.id}`,
        `/api/v1/users/${otherUser.id}`
      ]
      
      for (const endpoint of endpoints) {
        const response = await chai.request(baseUrl)
          .get(endpoint)
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data, meta } = response.body
        
        // Basic structure validation
        expect(data).to.have.property('id')
        expect(data).to.have.property('name')
        expect(meta).to.have.property('requestId')
        expect(meta).to.have.property('timestamp')
      }
    })

    it('should include appropriate metadata in responses', async function() {
      const session = await authHelper.loginUser({
        email: testUser.email,
        password: testUser.password
      })
      
      const response = await chai.request(baseUrl)
        .get('/api/v1/users/current')
        .set('Authorization', `Bearer ${session.accessToken}`)

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { meta } = response.body
      expect(meta).to.have.property('processingTime')
      expect(meta).to.have.property('dataFormat')
      expect(meta).to.have.property('accessLevel')
    })
  })

  describe('🌐 API Versioning and Compatibility', function() {
    
    it('should handle version-specific behavior', async function() {
      const session = await authHelper.loginUser({
        email: testUser.email,
        password: testUser.password
      })
      
      const response = await chai.request(baseUrl)
        .get('/api/v1/users/current')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('API-Version', '1.0')

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { meta } = response.body
      expect(meta).to.have.property('apiVersion')
    })

    it('should maintain backward compatibility', async function() {
      const session = await authHelper.loginUser({
        email: testUser.email,
        password: testUser.password
      })
      
      // Test legacy field names or structures if applicable
      const response = await chai.request(baseUrl)
        .get('/api/v1/users/current')
        .set('Authorization', `Bearer ${session.accessToken}`)

      ResponseValidator.validateSuccessResponse(response, 200)
      
      // Should include both new and legacy field formats for compatibility
      const { data } = response.body
      expect(data).to.have.property('id')
      expect(data).to.have.property('name')
    })
  })
})