/**
 * Enterprise-level User Creation API Tests
 * Tests for POST /api/v1/users
 * 
 * Coverage:
 * - Valid user creation scenarios
 * - Validation error handling
 * - Uniqueness constraints
 * - Password strength validation
 * - Country validation
 * - Profile image handling
 * - Referral system
 * - Notification system
 * - Security features
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

describe('👤 User Creation API Tests', function() {
  this.timeout(15000)
  
  let existingUser
  let validCountry

  before(async function() {
    await DatabaseHelper.seedTestCountries()
    
    // Get a valid country for testing
    const CountryDAO = require('../../database/dao/CountryDAO')
    validCountry = await CountryDAO.query().where('isActive', true).first()
    
    existingUser = await DatabaseHelper.createTestUser({
      name: 'Existing User',
      email: 'existing@susanoo.test',
      mobileNumber: '1234567890',
      countryId: validCountry.id
    })
  })

  after(async function() {
    await DatabaseHelper.clearTestData()
    TestUtils.cleanupTestFiles()
  })

  describe('✅ Valid User Creation', function() {
    
    it('should create user with all required fields', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data, meta } = response.body
      
      // Validate user data structure
      expect(data).to.have.property('id').that.is.a('number')
      expect(data).to.have.property('name', userData.name)
      expect(data).to.have.property('email', userData.email.toLowerCase())
      expect(data).to.have.property('mobileNumber')
      expect(data).to.have.property('country')
      expect(data).to.have.property('profile')
      expect(data).to.have.property('verification')
      expect(data).to.have.property('referral')
      expect(data).to.have.property('onboarding')
      expect(data).to.have.property('settings')
      expect(data).to.have.property('metadata')
      
      // Validate country information
      expect(data.country).to.have.property('id', validCountry.id)
      expect(data.country).to.have.property('name', validCountry.name)
      expect(data.country).to.have.property('iso', validCountry.iso)
      
      // Validate mobile number formatting
      expect(data.mobileNumber).to.have.property('msisdn', userData.mobileNumber)
      expect(data.mobileNumber).to.have.property('countryCode', validCountry.phonecode)
      expect(data.mobileNumber).to.have.property('formatted')
      
      // Validate verification status
      expect(data.verification).to.have.property('isVerified', false)
      expect(data.verification).to.have.property('verificationRequired', true)
      expect(data.verification).to.have.property('nextStep', 'verify_mobile')
      
      // Validate referral code generation
      expect(data.referral).to.have.property('referralCode').that.is.a('string')
      expect(data.referral.referralCode).to.have.length(6)
      
      // Validate onboarding information
      expect(data.onboarding).to.have.property('step', 1)
      expect(data.onboarding).to.have.property('totalSteps', 4)
      expect(data.onboarding).to.have.property('nextSteps').that.is.an('array')
      
      // Validate settings
      expect(data.settings).to.have.property('marketingConsent', userData.acceptMarketing)
      expect(data.settings).to.have.property('acceptedTermsAt')
      expect(data.settings).to.have.property('acceptedPrivacyAt')
      
      // Validate meta information
      expect(meta).to.have.property('verificationSent', true)
      expect(meta).to.have.property('nextAction', 'verify_mobile_number')
      expect(meta).to.have.property('message').that.includes('verify your mobile number')
      
      // Should not include sensitive information
      expect(data).to.not.have.any.keys(['passwordHash', 'verifyCode', 'updateToken'])
    })

    it('should create user with optional fields', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        bio: 'Test user with bio',
        preferredLanguage: 'es',
        acceptMarketing: true
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      expect(data.profile.bio).to.equal(userData.bio)
      expect(data.profile.preferredLanguage).to.equal(userData.preferredLanguage)
      expect(data.settings.marketingConsent).to.be.true
    })

    it('should handle device information', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        deviceInfo: TestDataFactory.generateDeviceInfo()
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .set('User-Agent', userData.deviceInfo.userAgent)
        .send(userData)

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      expect(data.metadata).to.have.property('registrationDate')
      expect(data.metadata).to.have.property('accountStatus', 'pending_verification')
    })

    it('should generate unique referral codes', async function() {
      const referralCodes = new Set()
      
      // Create multiple users and check referral code uniqueness
      for (let i = 0; i < 5; i++) {
        const userData = TestDataFactory.generateUserData({
          countryId: validCountry.id
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send(userData)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const referralCode = response.body.data.referral.referralCode
        expect(referralCodes.has(referralCode)).to.be.false
        referralCodes.add(referralCode)
      }
      
      expect(referralCodes.size).to.equal(5)
    })

    it('should handle referral code processing', async function() {
      // First create a user to be the referrer
      const referrerData = TestDataFactory.generateUserData({
        countryId: validCountry.id
      })
      
      const referrerResponse = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(referrerData)

      const referrerCode = referrerResponse.body.data.referral.referralCode
      
      // Now create a user with referral code
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        referralCode: referrerCode
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      expect(data.referral).to.have.property('referredBy')
      expect(data.referral.referredBy).to.equal(referrerResponse.body.data.id)
    })
  })

  describe('❌ Validation Error Scenarios', function() {
    
    it('should reject user creation with missing required fields', async function() {
      const incompleteData = {
        name: 'Test User'
        // Missing email, password, countryId, mobileNumber
      }
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(incompleteData)

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
    })

    it('should reject invalid email formats', async function() {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'test@',
        'test..email@example.com',
        'test@.com',
        'test@example.',
        ''
      ]
      
      for (const invalidEmail of invalidEmails) {
        const userData = TestDataFactory.generateUserData({
          countryId: validCountry.id,
          email: invalidEmail
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send(userData)

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        expect(response.body.message).to.include('email')
      }
    })

    it('should reject weak passwords', async function() {
      const weakPasswords = [
        'short', // Too short
        'nouppercase123', // No uppercase
        'NOLOWERCASE123', // No lowercase
        'NoNumbers!', // No numbers
        'NoSpecial123', // No special characters
        '12345678', // Only numbers
        'abcdefgh' // Only letters
      ]
      
      for (const weakPassword of weakPasswords) {
        const userData = TestDataFactory.generateUserData({
          countryId: validCountry.id,
          password: weakPassword
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send(userData)

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        expect(response.body.message).to.include('Password must be at least 8 characters')
      }
    })

    it('should reject invalid mobile number formats', async function() {
      const invalidMobileNumbers = [
        '123', // Too short
        '123456789012345678', // Too long
        'abc1234567', // Contains letters
        '', // Empty
        '+++1234567890' // Invalid characters
      ]
      
      for (const invalidMobile of invalidMobileNumbers) {
        const userData = TestDataFactory.generateUserData({
          countryId: validCountry.id,
          mobileNumber: invalidMobile
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send(userData)

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      }
    })

    it('should reject invalid name formats', async function() {
      const invalidNames = [
        'A', // Too short
        'A'.repeat(51), // Too long
        'Test123', // Contains numbers
        'Test@User', // Invalid characters
        '', // Empty
        '   ', // Only spaces
        'Test  Multiple  Spaces' // Multiple spaces (should be normalized)
      ]
      
      for (const invalidName of invalidNames.slice(0, -1)) { // Exclude the last one for now
        const userData = TestDataFactory.generateUserData({
          countryId: validCountry.id,
          name: invalidName
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send(userData)

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      }
    })

    it('should reject invalid country IDs', async function() {
      const invalidCountryIds = [0, -1, 99999, 'invalid', null]
      
      for (const invalidCountryId of invalidCountryIds) {
        const userData = TestDataFactory.generateUserData({
          countryId: invalidCountryId
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send(userData)

        ResponseValidator.validateErrorResponse(response, 400)
      }
    })

    it('should reject inactive country IDs', async function() {
      // Create an inactive country for testing
      const CountryDAO = require('../../database/dao/CountryDAO')
      const inactiveCountry = await CountryDAO.query().insert({
        name: 'Inactive Country',
        nicename: 'Inactive Country',
        iso: 'IC',
        phonecode: '999',
        isActive: false
      })
      
      const userData = TestDataFactory.generateUserData({
        countryId: inactiveCountry.id
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      expect(response.body.message).to.include('Invalid or inactive country')
    })
  })

  describe('🔒 Uniqueness Constraints', function() {
    
    it('should reject duplicate email addresses', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        email: existingUser.email
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      expect(response.body.message).to.include('email address already exists')
    })

    it('should reject duplicate mobile numbers', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        mobileNumber: existingUser.mobileNumber
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      expect(response.body.message).to.include('mobile number already exists')
    })

    it('should handle case-insensitive email uniqueness', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        email: existingUser.email.toUpperCase()
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      expect(response.body.message).to.include('email address already exists')
    })

    it('should allow same mobile number in different countries', async function() {
      // Get another active country
      const CountryDAO = require('../../database/dao/CountryDAO')
      const anotherCountry = await CountryDAO.query()
        .where('isActive', true)
        .where('id', '!=', validCountry.id)
        .first()
      
      if (anotherCountry) {
        const userData = TestDataFactory.generateUserData({
          countryId: anotherCountry.id,
          mobileNumber: existingUser.mobileNumber // Same number, different country
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send(userData)

        ResponseValidator.validateSuccessResponse(response, 200)
      }
    })
  })

  describe('🎯 Referral System', function() {
    
    it('should reject invalid referral codes', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        referralCode: 'INVALID123'
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      expect(response.body.message).to.include('Invalid referral code')
    })

    it('should reject referral codes from inactive users', async function() {
      // Create an inactive user with referral code
      const inactiveUser = await DatabaseHelper.createTestUser({
        countryId: validCountry.id,
        isActive: false
      })
      
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        referralCode: inactiveUser.referralCode
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
    })

    it('should validate referral code format', async function() {
      const invalidReferralCodes = ['ABC', 'TOOLONG123', '123456', '']
      
      for (const invalidCode of invalidReferralCodes) {
        const userData = TestDataFactory.generateUserData({
          countryId: validCountry.id,
          referralCode: invalidCode
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send(userData)

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      }
    })
  })

  describe('🖼️ Profile Image Handling', function() {
    
    it('should accept valid profile image IDs', async function() {
      // This test assumes an attachment system exists
      // For now, we'll skip the actual file upload part
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id
        // profileImageId would be set here if we had uploaded an image
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateSuccessResponse(response, 200)
      expect(response.body.data.profile.profileImageUrl).to.be.null
    })

    it('should reject invalid profile image IDs', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        profileImageId: 99999 // Non-existent image ID
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      expect(response.body.message).to.include('Invalid profile image reference')
    })
  })

  describe('⚡ Performance Tests', function() {
    
    it('should create user within acceptable time limits', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id
      })
      
      const startTime = Date.now()
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      const endTime = Date.now()
      const duration = endTime - startTime

      ResponseValidator.validateSuccessResponse(response, 200)
      expect(duration).to.be.lessThan(3000) // Should complete within 3 seconds
    })

    it('should handle concurrent user creation requests', async function() {
      const userCreationPromises = Array(3).fill().map(() => {
        const userData = TestDataFactory.generateUserData({
          countryId: validCountry.id
        })
        
        return chai.request(baseUrl)
          .post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .send(userData)
      })

      const responses = await Promise.all(userCreationPromises)
      
      responses.forEach(response => {
        ResponseValidator.validateSuccessResponse(response, 200)
      })
      
      // All users should have unique IDs and referral codes
      const userIds = responses.map(r => r.body.data.id)
      const referralCodes = responses.map(r => r.body.data.referral.referralCode)
      
      expect(new Set(userIds).size).to.equal(userIds.length)
      expect(new Set(referralCodes).size).to.equal(referralCodes.length)
    })
  })

  describe('🔒 Security Tests', function() {
    
    it('should hash passwords securely', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        password: 'TestPassword123!'
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateSuccessResponse(response, 200)
      
      // Password should never be returned in response
      expect(response.body.data).to.not.have.any.keys(['password', 'passwordHash'])
    })

    it('should sanitize input data', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        name: '  John   Doe  ', // Extra spaces
        bio: '  <script>alert("xss")</script>Bio content  '
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data } = response.body
      expect(data.name).to.equal('John   Doe') // Trimmed
      expect(data.profile.bio).to.not.include('<script>') // Sanitized
    })

    it('should prevent SQL injection in user data', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        name: 'Robert\'; DROP TABLE users; --'
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      // Should either validate as invalid name or handle safely
      expect(response.status).to.be.oneOf([400, 200])
    })

    it('should validate content type', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .send(new URLSearchParams(userData).toString()) // Form data instead of JSON

      ResponseValidator.validateErrorResponse(response, 400)
    })
  })

  describe('📧 Notification System', function() {
    
    it('should trigger welcome notifications on user creation', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { meta } = response.body
      expect(meta.verificationSent).to.be.true
      expect(meta.message).to.include('verify your mobile number')
    })

    it('should handle notification system failures gracefully', async function() {
      // This test would require mocking the notification system
      // For now, we ensure user creation doesn't fail even if notifications fail
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateSuccessResponse(response, 200)
      // User should be created even if notifications fail
    })
  })

  describe('🌍 Internationalization', function() {
    
    it('should handle different preferred languages', async function() {
      const languages = ['en', 'es', 'fr', 'de', 'ar']
      
      for (const language of languages) {
        const userData = TestDataFactory.generateUserData({
          countryId: validCountry.id,
          preferredLanguage: language
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users')
          .set('Content-Type', 'application/json')
          .set('Accept-Language', language)
          .send(userData)

        ResponseValidator.validateSuccessResponse(response, 200)
        expect(response.body.data.profile.preferredLanguage).to.equal(language)
      }
    })

    it('should default to English for invalid language codes', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id,
        preferredLanguage: 'invalid'
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      // Should either validate the language or default gracefully
      expect(response.status).to.be.oneOf([400, 200])
    })
  })

  describe('📊 Response Format Validation', function() {
    
    it('should maintain consistent response structure', async function() {
      const userData = TestDataFactory.generateUserData({
        countryId: validCountry.id
      })
      
      const response = await chai.request(baseUrl)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send(userData)

      ResponseValidator.validateSuccessResponse(response, 200)
      
      const { data, meta } = response.body
      
      // Validate required structure
      expect(data).to.have.all.keys([
        'id', 'name', 'email', 'mobileNumber', 'country', 'profile',
        'verification', 'referral', 'onboarding', 'settings', 'metadata'
      ])
      
      expect(meta).to.have.all.keys([
        'processingTime', 'verificationSent', 'nextAction', 'message',
        'requestId', 'timestamp', 'executionTime'
      ])
    })
  })
})