/**
 * Enterprise-level Authentication API Tests
 * Tests for POST /api/v1/auth/login and POST /api/v1/auth/logout
 * 
 * Coverage:
 * - Valid login scenarios
 * - Invalid credentials
 * - Account status validation
 * - Session management
 * - Security features
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

describe('🔐 Authentication API Tests', function() {
  this.timeout(10000)
  
  let testUser
  let authHelper

  before(async function() {
    await DatabaseHelper.seedTestCountries()
    testUser = await DatabaseHelper.createTestUser({
      name: 'Auth Test User',
      isVerified: true,
      isActive: true
    })
    authHelper = new AuthHelper()
  })

  after(async function() {
    await authHelper.cleanup()
    await DatabaseHelper.clearTestData()
    TestUtils.cleanupTestFiles()
  })

  describe('POST /api/v1/auth/login', function() {
    
    describe('✅ Valid Login Scenarios', function() {
      
      it('should successfully login with valid email and password', async function() {
        const fingerprint = TestDataFactory.generateFingerprint()
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: testUser.email,
            password: testUser.password,
            fingerprint
          })

        ResponseValidator.validateAuthResponse(response)
        
        const { data } = response.body
        expect(data.user.email).to.equal(testUser.email)
        expect(data.user.name).to.equal(testUser.name)
        expect(data.session).to.have.property('fingerprint', fingerprint)
        expect(data.session).to.have.property('expiresAt')
        expect(data.session).to.have.property('deviceInfo')
      })

      it('should login with email in different case', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: testUser.email.toUpperCase(),
            password: testUser.password,
            fingerprint: TestDataFactory.generateFingerprint()
          })

        ResponseValidator.validateAuthResponse(response)
        expect(response.body.data.user.email).to.equal(testUser.email.toLowerCase())
      })

      it('should include device information in session', async function() {
        const deviceInfo = TestDataFactory.generateDeviceInfo()
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .set('User-Agent', deviceInfo.userAgent)
          .send({
            email: testUser.email,
            password: testUser.password,
            fingerprint: TestDataFactory.generateFingerprint(),
            deviceInfo
          })

        ResponseValidator.validateAuthResponse(response)
        
        const { session } = response.body.data
        expect(session.deviceInfo).to.deep.include(deviceInfo)
      })

      it('should handle remember me functionality', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: testUser.email,
            password: testUser.password,
            fingerprint: TestDataFactory.generateFingerprint(),
            rememberMe: true
          })

        ResponseValidator.validateAuthResponse(response)
        
        // Check that remember me affects session duration
        const { session } = response.body.data
        const expiresAt = new Date(session.expiresAt)
        const now = new Date()
        const hoursDiff = (expiresAt - now) / (1000 * 60 * 60)
        
        expect(hoursDiff).to.be.greaterThan(24) // Should be longer than default
      })
    })

    describe('❌ Invalid Credentials', function() {
      
      it('should reject login with incorrect password', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: testUser.email,
            password: 'wrongpassword',
            fingerprint: TestDataFactory.generateFingerprint()
          })

        ResponseValidator.validateErrorResponse(response, 401, 'AUTH_ERROR')
        expect(response.body.message).to.include('Invalid credentials')
      })

      it('should reject login with non-existent email', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: 'nonexistent@susanoo.test',
            password: testUser.password,
            fingerprint: TestDataFactory.generateFingerprint()
          })

        ResponseValidator.validateErrorResponse(response, 404, 'USER_NOT_FOUND')
      })

      it('should reject login with malformed email', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: 'invalid-email',
            password: testUser.password,
            fingerprint: TestDataFactory.generateFingerprint()
          })

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      })
    })

    describe('🔒 Account Status Validation', function() {
      
      it('should reject login for inactive account', async function() {
        const inactiveUser = await DatabaseHelper.createTestUser({
          isActive: false,
          isVerified: true
        })

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

      it('should allow login for unverified but active account', async function() {
        const unverifiedUser = await DatabaseHelper.createTestUser({
          isActive: true,
          isVerified: false
        })

        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: unverifiedUser.email,
            password: unverifiedUser.password,
            fingerprint: TestDataFactory.generateFingerprint()
          })

        ResponseValidator.validateAuthResponse(response)
        expect(response.body.data.user.isVerified).to.be.false
      })
    })

    describe('🛡️ Security Features', function() {
      
      it('should require fingerprint parameter', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: testUser.email,
            password: testUser.password
          })

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        expect(response.body.message).to.include('fingerprint')
      })

      it('should rate limit login attempts', async function() {
        this.timeout(15000)
        
        const failedAttempts = []
        const fingerprint = TestDataFactory.generateFingerprint()
        
        // Make multiple failed login attempts
        for (let i = 0; i < 6; i++) {
          const attempt = chai.request(baseUrl)
            .post('/api/v1/auth/login')
            .set('Content-Type', 'application/json')
            .send({
              email: testUser.email,
              password: 'wrongpassword',
              fingerprint
            })
          
          failedAttempts.push(attempt)
          await TestUtils.delay(200) // Small delay between attempts
        }

        const responses = await Promise.all(failedAttempts)
        
        // Later attempts should be rate limited
        const rateLimitedResponse = responses[responses.length - 1]
        expect(rateLimitedResponse.status).to.be.oneOf([429, 403])
      }).timeout(15000)

      it('should validate fingerprint format', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: testUser.email,
            password: testUser.password,
            fingerprint: '123' // Too short
          })

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      })
    })

    describe('📊 Response Format Validation', function() {
      
      it('should include all required response fields', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: testUser.email,
            password: testUser.password,
            fingerprint: TestDataFactory.generateFingerprint()
          })

        ResponseValidator.validateAuthResponse(response)
        
        const { data, meta } = response.body
        
        // Validate user object structure
        expect(data.user).to.have.all.keys([
          'id', 'name', 'email', 'mobileNumber', 'countryId', 
          'isVerified', 'isActive', 'role', 'preferredLanguage',
          'createdAt', 'profile'
        ])
        
        // Validate session object structure
        expect(data.session).to.have.all.keys([
          'id', 'fingerprint', 'expiresAt', 'deviceInfo', 'lastAccessAt'
        ])
        
        // Validate meta information
        expect(meta).to.have.property('processingTime')
        expect(meta).to.have.property('loginMethod', 'email')
      })

      it('should exclude sensitive information from response', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: testUser.email,
            password: testUser.password,
            fingerprint: TestDataFactory.generateFingerprint()
          })

        const { data } = response.body
        
        // Should not include password hash or verification codes
        expect(data.user).to.not.have.any.keys([
          'passwordHash', 'verifyCode', 'updateToken', 'resetPasswordToken'
        ])
      })
    })
  })

  describe('POST /api/v1/auth/logout', function() {
    let userSession

    beforeEach(async function() {
      userSession = await authHelper.loginUser({
        email: testUser.email,
        password: testUser.password
      })
    })

    describe('✅ Valid Logout Scenarios', function() {
      
      it('should successfully logout with valid tokens', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/logout')
          .set('Content-Type', 'application/json')
          .set('Authorization', `Bearer ${userSession.accessToken}`)
          .send({
            refreshToken: userSession.refreshToken
          })

        ResponseValidator.validateSuccessResponse(response, 200)
        expect(response.body.message).to.include('logged out successfully')
      })

      it('should invalidate session after logout', async function() {
        // First logout
        await chai.request(baseUrl)
          .post('/api/v1/auth/logout')
          .set('Content-Type', 'application/json')
          .set('Authorization', `Bearer ${userSession.accessToken}`)
          .send({
            refreshToken: userSession.refreshToken
          })

        // Try to access protected endpoint with same token
        const response = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', `Bearer ${userSession.accessToken}`)

        ResponseValidator.validateErrorResponse(response, 401, 'AUTH_ERROR')
      })

      it('should allow logout all sessions', async function() {
        // Create multiple sessions
        const session2 = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })

        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/logout')
          .set('Content-Type', 'application/json')
          .set('Authorization', `Bearer ${userSession.accessToken}`)
          .send({
            refreshToken: userSession.refreshToken,
            logoutAll: true
          })

        ResponseValidator.validateSuccessResponse(response, 200)
        
        // Both sessions should be invalidated
        const test1 = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', `Bearer ${userSession.accessToken}`)

        const test2 = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', `Bearer ${session2.accessToken}`)

        expect(test1.status).to.equal(401)
        expect(test2.status).to.equal(401)
      })
    })

    describe('❌ Invalid Logout Scenarios', function() {
      
      it('should reject logout without access token', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/logout')
          .set('Content-Type', 'application/json')
          .send({
            refreshToken: userSession.refreshToken
          })

        ResponseValidator.validateErrorResponse(response, 401, 'AUTH_ERROR')
      })

      it('should reject logout with invalid access token', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/logout')
          .set('Content-Type', 'application/json')
          .set('Authorization', 'Bearer invalid_token')
          .send({
            refreshToken: userSession.refreshToken
          })

        ResponseValidator.validateErrorResponse(response, 401, 'AUTH_ERROR')
      })

      it('should reject logout without refresh token', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/logout')
          .set('Content-Type', 'application/json')
          .set('Authorization', `Bearer ${userSession.accessToken}`)
          .send({})

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      })

      it('should reject logout with mismatched tokens', async function() {
        const anotherSession = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })

        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/logout')
          .set('Content-Type', 'application/json')
          .set('Authorization', `Bearer ${userSession.accessToken}`)
          .send({
            refreshToken: anotherSession.refreshToken
          })

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        expect(response.body.message).to.include('token mismatch')
      })
    })

    describe('🔄 Session Management', function() {
      
      it('should handle concurrent logout attempts gracefully', async function() {
        const logoutPromises = Array(3).fill().map(() =>
          chai.request(baseUrl)
            .post('/api/v1/auth/logout')
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${userSession.accessToken}`)
            .send({
              refreshToken: userSession.refreshToken
            })
        )

        const responses = await Promise.all(logoutPromises)
        
        // First should succeed, others should handle gracefully
        const successCount = responses.filter(r => r.status === 200).length
        expect(successCount).to.be.at.least(1)
      })

      it('should clean up session metadata on logout', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/auth/logout')
          .set('Content-Type', 'application/json')
          .set('Authorization', `Bearer ${userSession.accessToken}`)
          .send({
            refreshToken: userSession.refreshToken
          })

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { meta } = response.body
        expect(meta).to.have.property('sessionDuration')
        expect(meta).to.have.property('logoutTime')
      })
    })
  })

  describe('🔄 Token Refresh Flow', function() {
    let userSession

    beforeEach(async function() {
      userSession = await authHelper.loginUser({
        email: testUser.email,
        password: testUser.password
      })
    })

    it('should refresh tokens with valid refresh token', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/auth/refresh-tokens')
        .set('Content-Type', 'application/json')
        .send({
          refreshToken: userSession.refreshToken,
          fingerprint: userSession.fingerprint
        })

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      expect(data).to.have.property('accessToken').that.is.a('string')
      expect(data).to.have.property('refreshToken').that.is.a('string')
      expect(data.accessToken).to.not.equal(userSession.accessToken)
      expect(data.refreshToken).to.not.equal(userSession.refreshToken)
    })

    it('should reject refresh with invalid refresh token', async function() {
      const response = await chai.request(baseUrl)
        .post('/api/v1/auth/refresh-tokens')
        .set('Content-Type', 'application/json')
        .send({
          refreshToken: 'invalid_refresh_token',
          fingerprint: userSession.fingerprint
        })

      ResponseValidator.validateErrorResponse(response, 401, 'AUTH_ERROR')
    })
  })

  describe('⚡ Performance Tests', function() {
    
    it('should handle login within acceptable time limits', async function() {
      const startTime = Date.now()
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send({
          email: testUser.email,
          password: testUser.password,
          fingerprint: TestDataFactory.generateFingerprint()
        })

      const endTime = Date.now()
      const duration = endTime - startTime

      ResponseValidator.validateAuthResponse(response)
      expect(duration).to.be.lessThan(2000) // Should complete within 2 seconds
    })

    it('should handle concurrent login requests', async function() {
      const concurrentLogins = Array(5).fill().map(() =>
        chai.request(baseUrl)
          .post('/api/v1/auth/login')
          .set('Content-Type', 'application/json')
          .send({
            email: testUser.email,
            password: testUser.password,
            fingerprint: TestDataFactory.generateFingerprint()
          })
      )

      const responses = await Promise.all(concurrentLogins)
      
      responses.forEach(response => {
        ResponseValidator.validateAuthResponse(response)
      })
    })
  })
})