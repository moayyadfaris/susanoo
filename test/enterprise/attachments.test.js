/**
 * Enterprise-level Attachment API Tests
 * Tests for POST /api/v1/attachments and POST /api/v1/users/current/profile-image
 * 
 * Coverage:
 * - File upload functionality
 * - Profile image upload
 * - File type validation
 * - File size limits
 * - Security validation
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

const fs = require('fs')
const path = require('path')

describe('📎 Attachment API Tests', function() {
  this.timeout(20000)
  
  let testUser
  let authHelper
  let testImagePath
  let testDocumentPath
  let largeFilePath

  before(async function() {
    await DatabaseHelper.seedTestCountries()
    
    testUser = await DatabaseHelper.createTestUser({
      name: 'Test User',
      isVerified: true,
      isActive: true
    })
    
    authHelper = new AuthHelper()
    
    // Create test files
    await this.createTestFiles()
  })

  after(async function() {
    await authHelper.cleanup()
    await DatabaseHelper.clearTestData()
    TestUtils.cleanupTestFiles()
  })

  // Helper method to create test files
  async function createTestFiles() {
    const testDir = path.join(__dirname, '../tmp')
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }

    // Create a small test image (PNG)
    testImagePath = path.join(testDir, 'test-image.png')
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE // Rest of header
    ])
    fs.writeFileSync(testImagePath, pngHeader)

    // Create a test document
    testDocumentPath = path.join(testDir, 'test-document.pdf')
    const pdfHeader = Buffer.from('%PDF-1.4\n%âãÏÓ\n')
    fs.writeFileSync(testDocumentPath, pdfHeader)

    // Create a large file (>5MB) for testing size limits
    largeFilePath = path.join(testDir, 'large-file.txt')
    const largeContent = 'a'.repeat(6 * 1024 * 1024) // 6MB
    fs.writeFileSync(largeFilePath, largeContent)
  }

  describe('POST /api/v1/attachments', function() {
    
    describe('✅ Valid File Upload', function() {
      
      it('should upload image file successfully', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', testImagePath)
          .field('type', 'image')
          .field('isPublic', 'false')

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data).to.have.property('id').that.is.a('number')
        expect(data).to.have.property('filename').that.includes('test-image')
        expect(data).to.have.property('originalName', 'test-image.png')
        expect(data).to.have.property('mimeType', 'image/png')
        expect(data).to.have.property('size').that.is.a('number')
        expect(data).to.have.property('url').that.is.a('string')
        expect(data).to.have.property('type', 'image')
        expect(data).to.have.property('isPublic', false)
        expect(data).to.have.property('uploadedBy', testUser.id)
        expect(data).to.have.property('uploadedAt')
      })

      it('should upload document file successfully', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', testDocumentPath)
          .field('type', 'document')
          .field('isPublic', 'true')

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data).to.have.property('mimeType', 'application/pdf')
        expect(data).to.have.property('type', 'document')
        expect(data).to.have.property('isPublic', true)
      })

      it('should generate unique filenames for duplicate uploads', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        // Upload same file twice
        const responses = await Promise.all([
          chai.request(baseUrl)
            .post('/api/v1/attachments')
            .set('Authorization', `Bearer ${session.accessToken}`)
            .attach('file', testImagePath)
            .field('type', 'image'),
          chai.request(baseUrl)
            .post('/api/v1/attachments')
            .set('Authorization', `Bearer ${session.accessToken}`)
            .attach('file', testImagePath)
            .field('type', 'image')
        ])

        responses.forEach(response => {
          ResponseValidator.validateSuccessResponse(response, 200)
        })

        // Filenames should be different
        const filenames = responses.map(r => r.body.data.filename)
        expect(filenames[0]).to.not.equal(filenames[1])
        expect(new Set(filenames).size).to.equal(2)
      })

      it('should handle metadata and descriptions', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', testImagePath)
          .field('type', 'image')
          .field('description', 'Test image description')
          .field('tags', 'test,image,upload')

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data).to.have.property('description', 'Test image description')
        expect(data).to.have.property('tags').that.is.an('array')
        expect(data.tags).to.include('test')
        expect(data.tags).to.include('image')
      })

      it('should process image metadata', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', testImagePath)
          .field('type', 'image')

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data).to.have.property('metadata')
        expect(data.metadata).to.have.property('dimensions')
        expect(data.metadata).to.have.property('format')
      })
    })

    describe('❌ Invalid File Upload Scenarios', function() {
      
      it('should reject upload without authentication', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .attach('file', testImagePath)

        ResponseValidator.validateErrorResponse(response, 401, 'AUTH_ERROR')
      })

      it('should reject upload without file', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .field('type', 'image')

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        expect(response.body.message).to.include('file is required')
      })

      it('should reject files that are too large', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', largeFilePath)
          .field('type', 'document')

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        expect(response.body.message).to.include('file size')
      })

      it('should reject unsupported file types', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        // Create an executable file
        const execPath = TestUtils.generateTestFile('malicious.exe', 'MZ\x90\x00') // PE header
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', execPath)
          .field('type', 'document')

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        expect(response.body.message).to.include('file type not supported')
      })

      it('should validate file type consistency', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        // Upload image file but claim it's a document
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', testImagePath)
          .field('type', 'document')

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        expect(response.body.message).to.include('file type mismatch')
      })

      it('should validate required fields', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', testImagePath)
          // Missing type field

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      })
    })

    describe('🔒 Security Validation', function() {
      
      it('should scan files for malware signatures', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        // Create a file with EICAR test signature
        const eicarPath = TestUtils.generateTestFile('eicar.txt', 
          'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', eicarPath)
          .field('type', 'document')

        ResponseValidator.validateErrorResponse(response, 400, 'SECURITY_VIOLATION')
        expect(response.body.message).to.include('security scan failed')
      })

      it('should validate image files are actually images', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        // Create a text file with .png extension
        const fakePath = TestUtils.generateTestFile('fake.png', 'This is not an image')
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', fakePath)
          .field('type', 'image')

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      })

      it('should strip EXIF data from images', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', testImagePath)
          .field('type', 'image')

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data.metadata).to.have.property('exifStripped', true)
      })

      it('should validate filename for path traversal attempts', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const maliciousPath = TestUtils.generateTestFile('../../../etc/passwd.txt', 'malicious content')
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', maliciousPath)
          .field('type', 'document')

        // Should either reject or sanitize the filename
        if (response.status === 200) {
          expect(response.body.data.filename).to.not.include('../')
          expect(response.body.data.filename).to.not.include('etc/passwd')
        } else {
          ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        }
      })
    })

    describe('⚡ Performance Tests', function() {
      
      it('should handle file upload within acceptable time', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const startTime = Date.now()
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/attachments')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('file', testImagePath)
          .field('type', 'image')

        const endTime = Date.now()
        const duration = endTime - startTime

        ResponseValidator.validateSuccessResponse(response, 200)
        expect(duration).to.be.lessThan(5000) // Should complete within 5 seconds
      })

      it('should handle concurrent uploads', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const uploadPromises = Array(3).fill().map(() =>
          chai.request(baseUrl)
            .post('/api/v1/attachments')
            .set('Authorization', `Bearer ${session.accessToken}`)
            .attach('file', testImagePath)
            .field('type', 'image')
        )

        const responses = await Promise.all(uploadPromises)
        
        responses.forEach(response => {
          ResponseValidator.validateSuccessResponse(response, 200)
        })

        // All uploads should have unique IDs
        const uploadIds = responses.map(r => r.body.data.id)
        expect(new Set(uploadIds).size).to.equal(uploadIds.length)
      })
    })
  })

  describe('POST /api/v1/users/current/profile-image', function() {
    
    describe('✅ Valid Profile Image Upload', function() {
      
      it('should upload and set profile image successfully', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('profileImage', testImagePath)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data).to.have.property('profileImage')
        expect(data.profileImage).to.have.property('id')
        expect(data.profileImage).to.have.property('url')
        expect(data.profileImage).to.have.property('thumbnails')
        expect(data.profileImage.thumbnails).to.be.an('object')
        expect(data.profileImage.thumbnails).to.have.property('small')
        expect(data.profileImage.thumbnails).to.have.property('medium')
      })

      it('should generate multiple thumbnail sizes', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('profileImage', testImagePath)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        const { thumbnails } = data.profileImage
        
        expect(thumbnails).to.have.property('small') // 64x64
        expect(thumbnails).to.have.property('medium') // 128x128
        expect(thumbnails).to.have.property('large') // 256x256
        
        Object.values(thumbnails).forEach(thumbnailUrl => {
          expect(thumbnailUrl).to.be.a('string').that.includes('http')
        })
      })

      it('should replace existing profile image', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        // Upload first image
        const firstResponse = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('profileImage', testImagePath)

        const firstImageId = firstResponse.body.data.profileImage.id

        // Upload second image
        const secondResponse = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('profileImage', testImagePath)

        const secondImageId = secondResponse.body.data.profileImage.id

        ResponseValidator.validateSuccessResponse(secondResponse, 200)
        expect(secondImageId).to.not.equal(firstImageId)
      })

      it('should update user profile with new image', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        // Upload profile image
        const uploadResponse = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('profileImage', testImagePath)

        const imageId = uploadResponse.body.data.profileImage.id

        // Check user profile
        const profileResponse = await chai.request(baseUrl)
          .get('/api/v1/users/current')
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateSuccessResponse(profileResponse, 200)
        expect(profileResponse.body.data.profile.profileImageId).to.equal(imageId)
      })
    })

    describe('❌ Invalid Profile Image Upload', function() {
      
      it('should reject non-image files', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('profileImage', testDocumentPath)

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        expect(response.body.message).to.include('must be an image')
      })

      it('should reject images that are too large', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('profileImage', largeFilePath)

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
      })

      it('should require authentication', async function() {
        const response = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .attach('profileImage', testImagePath)

        ResponseValidator.validateErrorResponse(response, 401, 'AUTH_ERROR')
      })

      it('should require profile image file', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .set('Authorization', `Bearer ${session.accessToken}`)

        ResponseValidator.validateErrorResponse(response, 400, 'VALIDATION')
        expect(response.body.message).to.include('profileImage is required')
      })

      it('should validate image dimensions', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        // The test image is 1x1 pixel, which might be too small
        const response = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('profileImage', testImagePath)

        // Should either succeed or validate minimum dimensions
        if (response.status === 400) {
          expect(response.body.message).to.include('dimension')
        } else {
          ResponseValidator.validateSuccessResponse(response, 200)
        }
      })
    })

    describe('🎨 Image Processing', function() {
      
      it('should crop images to square aspect ratio', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('profileImage', testImagePath)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data.profileImage.metadata).to.have.property('processed', true)
        expect(data.profileImage.metadata).to.have.property('aspectRatio', '1:1')
      })

      it('should optimize image quality and size', async function() {
        const session = await authHelper.loginUser({
          email: testUser.email,
          password: testUser.password
        })
        
        const response = await chai.request(baseUrl)
          .post('/api/v1/users/current/profile-image')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach('profileImage', testImagePath)

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data } = response.body
        expect(data.profileImage.metadata).to.have.property('optimized', true)
        expect(data.profileImage.metadata).to.have.property('compressionRatio')
      })
    })
  })

  describe('📊 Response Format Validation', function() {
    
    it('should maintain consistent response structure', async function() {
      const session = await authHelper.loginUser({
        email: testUser.email,
        password: testUser.password
      })
      
      const endpoints = [
        {
          method: 'post',
          url: '/api/v1/attachments',
          attach: 'file'
        },
        {
          method: 'post',
          url: '/api/v1/users/current/profile-image',
          attach: 'profileImage'
        }
      ]
      
      for (const endpoint of endpoints) {
        const request = chai.request(baseUrl)[endpoint.method](endpoint.url)
          .set('Authorization', `Bearer ${session.accessToken}`)
          .attach(endpoint.attach, testImagePath)
        
        if (endpoint.attach === 'file') {
          request.field('type', 'image')
        }
        
        const response = await request

        ResponseValidator.validateSuccessResponse(response, 200)
        
        const { data, meta } = response.body
        expect(data).to.be.an('object')
        expect(meta).to.have.property('requestId')
        expect(meta).to.have.property('timestamp')
        expect(meta).to.have.property('processingTime')
      }
    })
  })
})