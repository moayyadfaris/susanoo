/**
 * Simple availability API test
 */

const { 
  expect, 
  initializeTestEnvironment, 
  getRequest, 
  TestDataFactory 
} = require('./test-utils')

describe('Availability API - Simple Test', function() {
  this.timeout(15000)
  
  let request

  before(async function() {
    console.log('🔧 Setting up availability test environment...')
    await initializeTestEnvironment()
    request = getRequest()
    console.log('✅ Availability test environment ready')
  })

  describe('POST /api/v1/users/check-availability', function() {
    it('should check email availability for non-existing email', async function() {
      const testEmail = TestDataFactory.generateUniqueEmail()
      
      const response = await request
        .post('/api/v1/users/check-availability')
        .send({ email: testEmail })
        .expect(200)
      
      expect(response.body).to.be.an('object')
      expect(response.body.success).to.be.true
      expect(response.body.data).to.be.an('object')
      expect(response.body.data.available).to.be.true
      
      console.log('✅ Email availability check passed for new email')
    })

    it('should handle email and phone combination', async function() {
      const testEmail = TestDataFactory.generateUniqueEmail()
      const testPhone = TestDataFactory.generateUniqueMobile()
      
      const response = await request
        .post('/api/v1/users/check-availability')
        .send({ 
          email: testEmail,
          phone: testPhone 
        })
        .expect(200)
      
      expect(response.body).to.be.an('object')
      expect(response.body.success).to.be.true
      expect(response.body.data).to.be.an('object')
      
      console.log('✅ Email and phone availability check passed')
    })

    it('should return validation error for invalid email format', async function() {
      const response = await request
        .post('/api/v1/users/check-availability')
        .send({ email: 'invalid-email' })
        .expect(400)
      
      expect(response.body).to.be.an('object')
      expect(response.body.success).to.be.false
      
      console.log('✅ Invalid email format properly rejected')
    })
  })
})