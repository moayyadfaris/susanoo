const { expect } = require('chai')
const sinon = require('sinon')
const EnterpriseBaseDAO = require('../../core/lib/EnterpriseBaseDAO')
const EnterpriseBaseModel = require('../../core/lib/EnterpriseBaseModel')
const EnterpriseEncryption = require('../../core/lib/EnterpriseEncryption')
const EnterpriseCacheService = require('../../core/lib/EnterpriseCacheService')

describe('Enterprise Database Layer Tests', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('EnterpriseBaseDAO', () => {
    describe('Audit Trails', () => {
      it('should set audit fields on insert', () => {
        const dao = new EnterpriseBaseDAO()
        const queryContext = { user: { id: 'user-123' } }
        
        dao.$beforeInsert(queryContext)
        
        expect(dao.createdBy).to.equal('user-123')
        expect(dao.updatedBy).to.equal('user-123')
        expect(dao.version).to.equal(1)
        expect(dao.createdAt).to.be.a('string')
        expect(dao.updatedAt).to.be.a('string')
      })

      it('should update audit fields on update', () => {
        const dao = new EnterpriseBaseDAO()
        dao.version = 1
        const queryContext = { user: { id: 'user-456' } }
        
        dao.$beforeUpdate({}, queryContext)
        
        expect(dao.updatedBy).to.equal('user-456')
        expect(dao.version).to.equal(2)
        expect(dao.updatedAt).to.be.a('string')
      })

      it('should format JSON with audit field removal', () => {
        const dao = new EnterpriseBaseDAO()
        const json = {
          id: '123',
          name: 'Test',
          createdBy: 'user-123',
          updatedBy: 'user-456',
          version: 2,
          createdAt: '2025-01-01T00:00:00Z'
        }
        
        const formatted = dao.$formatJson(json)
        
        expect(formatted.id).to.equal('123')
        expect(formatted.name).to.equal('Test')
        expect(formatted.createdBy).to.be.undefined
        expect(formatted.updatedBy).to.be.undefined
        expect(formatted.version).to.be.undefined
        expect(formatted.createdAt).to.be.a('string')
      })
    })

    describe('Soft Deletes', () => {
      it('should perform soft delete', async () => {
        const mockQuery = {
          findById: sandbox.stub().returnsThis(),
          patch: sandbox.stub().resolves(1)
        }
        
        sandbox.stub(EnterpriseBaseDAO, 'query').returns(mockQuery)
        
        const result = await EnterpriseBaseDAO.softDelete('123', 'user-456')
        
        expect(mockQuery.findById).to.have.been.calledWith('123')
        expect(mockQuery.patch).to.have.been.calledWith(
          sinon.match({
            deletedAt: sinon.match.string,
            deletedBy: 'user-456',
            updatedAt: sinon.match.string
          })
        )
        expect(result).to.equal(1)
      })

      it('should restore soft deleted record', async () => {
        const mockQuery = {
          findById: sandbox.stub().returnsThis(),
          patch: sandbox.stub().resolves(1)
        }
        
        sandbox.stub(EnterpriseBaseDAO, 'queryWithDeleted').returns(mockQuery)
        
        const result = await EnterpriseBaseDAO.restore('123', 'user-456')
        
        expect(mockQuery.patch).to.have.been.calledWith(
          sinon.match({
            deletedAt: null,
            deletedBy: null,
            updatedBy: 'user-456'
          })
        )
        expect(result).to.equal(1)
      })
    })

    describe('Optimistic Locking', () => {
      it('should update with version check', async () => {
        const mockQuery = {
          context: sandbox.stub().returnsThis(),
          findById: sandbox.stub().returnsThis(),
          where: sandbox.stub().returnsThis(),
          patch: sandbox.stub().resolves(1)
        }
        
        sandbox.stub(EnterpriseBaseDAO, 'query').returns(mockQuery)
        
        const result = await EnterpriseBaseDAO.updateWithAudit(
          '123', 
          { name: 'Updated' }, 
          'user-456', 
          2
        )
        
        expect(mockQuery.where).to.have.been.calledWith('version', 2)
        expect(result).to.equal(1)
      })

      it('should throw error on version conflict', async () => {
        const mockQuery = {
          context: sandbox.stub().returnsThis(),
          findById: sandbox.stub().returnsThis(),
          where: sandbox.stub().returnsThis(),
          patch: sandbox.stub().resolves(0)
        }
        
        sandbox.stub(EnterpriseBaseDAO, 'query').returns(mockQuery)
        
        try {
          await EnterpriseBaseDAO.updateWithAudit(
            '123', 
            { name: 'Updated' }, 
            'user-456', 
            2
          )
          expect.fail('Should have thrown version conflict error')
        } catch (error) {
          expect(error.message).to.include('Optimistic locking conflict')
        }
      })
    })
  })

  describe('EnterpriseBaseModel', () => {
    describe('Enhanced Validation', () => {
      it('should validate email with normalization', async () => {
        const rule = new EnterpriseBaseModel.Rule({
          validator: (v) => {
            if (typeof v === 'string' && v.includes('@')) return true
            return 'Invalid email'
          },
          normalizer: (v) => v ? v.toLowerCase().trim() : v,
          sanitizer: (v) => v ? v.replace(/[<>]/g, '') : v
        })
        
        const result = await rule.validate('  TEST@EXAMPLE.COM<script>  ')
        
        expect(result.isValid).to.be.true
        expect(result.normalizedValue).to.equal('test@example.com<script>')
        expect(result.sanitizedValue).to.equal('  TEST@EXAMPLE.COMscript  ')
      })

      it('should handle cross-field validation', async () => {
        const rule = new EnterpriseBaseModel.Rule({
          crossFieldValidator: (value, allData) => {
            if (allData.confirmPassword && value !== allData.confirmPassword) {
              return 'Passwords do not match'
            }
            return true
          }
        })
        
        const result = await rule.validate('password123', {}, {
          password: 'password123',
          confirmPassword: 'different'
        })
        
        expect(result.isValid).to.be.false
        expect(result.errors).to.include('Passwords do not match')
      })

      it('should handle conditional required fields', async () => {
        const rule = new EnterpriseBaseModel.Rule({
          conditional: (allData) => allData.type === 'premium',
          validator: (v) => v ? true : 'Required for premium'
        })
        
        const result1 = await rule.validate(null, {}, { type: 'premium' })
        expect(result1.isValid).to.be.false
        expect(result1.errors).to.include('Field is required')
        
        const result2 = await rule.validate(null, {}, { type: 'basic' })
        expect(result2.isValid).to.be.true
      })
    })

    describe('GDPR Compliance', () => {
      it('should identify PII fields', () => {
        class TestModel extends EnterpriseBaseModel {
          static get schema() {
            return {
              email: new this.Rule({ pii: true, gdprCategory: 'contact_info' }),
              name: new this.Rule({ pii: true, gdprCategory: 'personal_info' }),
              age: new this.Rule({ pii: false })
            }
          }
        }
        
        const piiFields = TestModel.getPIIFields()
        
        expect(piiFields).to.have.length(2)
        expect(piiFields.find(f => f.field === 'email')).to.exist
        expect(piiFields.find(f => f.field === 'name')).to.exist
        expect(piiFields.find(f => f.field === 'age')).to.not.exist
      })

      it('should anonymize PII data', () => {
        class TestModel extends EnterpriseBaseModel {
          static get schema() {
            return {
              email: new this.Rule({ pii: true, gdprCategory: 'contact_info' }),
              name: new this.Rule({ pii: true, gdprCategory: 'personal_info' }),
              age: new this.Rule({ pii: false })
            }
          }
        }
        
        const data = {
          email: 'test@example.com',
          name: 'John Doe',
          age: 30
        }
        
        const anonymized = TestModel.anonymizePIIData(data)
        
        expect(anonymized.email).to.equal('***@example.com')
        expect(anonymized.name).to.equal('J*******')
        expect(anonymized.age).to.equal(30)
      })
    })
  })

  describe('EnterpriseEncryption', () => {
    let encryption

    beforeEach(() => {
      encryption = new EnterpriseEncryption({
        masterKey: 'test-master-key-32-chars-long!!'
      })
    })

    describe('Field Encryption', () => {
      it('should encrypt and decrypt values', () => {
        const originalValue = 'sensitive-data@example.com'
        
        const encrypted = encryption.encrypt(originalValue)
        expect(encrypted).to.be.a('string')
        expect(encrypted).to.not.equal(originalValue)
        expect(encrypted).to.include(':')
        
        const decrypted = encryption.decrypt(encrypted)
        expect(decrypted).to.equal(originalValue)
      })

      it('should handle null and empty values', () => {
        expect(encryption.encrypt(null)).to.be.null
        expect(encryption.encrypt('')).to.equal('')
        expect(encryption.encrypt(undefined)).to.be.undefined
        
        expect(encryption.decrypt(null)).to.be.null
        expect(encryption.decrypt('')).to.equal('')
      })

      it('should encrypt PII fields in object', () => {
        const data = {
          name: 'John Doe',
          email: 'john@example.com',
          age: 30,
          metadata: {}
        }
        
        const encrypted = encryption.encryptPIIFields(data, ['name', 'email'])
        
        expect(encrypted.name).to.not.equal('John Doe')
        expect(encrypted.email).to.not.equal('john@example.com')
        expect(encrypted.age).to.equal(30)
        expect(encrypted.metadata.encrypted_fields).to.include('name')
        expect(encrypted.metadata.encrypted_fields).to.include('email')
      })
    })

    describe('GDPR Anonymization', () => {
      it('should anonymize email addresses', () => {
        const data = { email: 'user@example.com' }
        const anonymized = encryption.anonymizePIIFields(data, ['email'])
        
        expect(anonymized.email).to.equal('***@example.com')
        expect(anonymized.metadata.gdpr_anonymized).to.be.true
      })

      it('should anonymize phone numbers', () => {
        const data = { mobile: '1234567890' }
        const anonymized = encryption.anonymizePIIFields(data, ['mobile'])
        
        expect(anonymized.mobile).to.equal('***7890')
        expect(anonymized.metadata.gdpr_anonymized).to.be.true
      })

      it('should anonymize names', () => {
        const data = { name: 'John Doe' }
        const anonymized = encryption.anonymizePIIFields(data, ['name'])
        
        expect(anonymized.name).to.equal('J*******')
      })
    })

    describe('Key Management', () => {
      it('should rotate keys', () => {
        const originalKeyId = encryption.currentKeyId
        const rotation = encryption.rotateKeys()
        
        expect(rotation.oldKeyId).to.equal(originalKeyId)
        expect(rotation.newKeyId).to.not.equal(originalKeyId)
        expect(encryption.currentKeyId).to.equal(rotation.newKeyId)
      })

      it('should re-encrypt with new key', () => {
        const originalValue = 'test-value'
        const encrypted1 = encryption.encrypt(originalValue)
        
        encryption.rotateKeys()
        const reencrypted = encryption.reencryptWithNewKey(encrypted1)
        
        expect(reencrypted).to.not.equal(encrypted1)
        expect(encryption.decrypt(reencrypted)).to.equal(originalValue)
      })
    })
  })

  describe('EnterpriseCacheService', () => {
    let cacheService

    beforeEach(() => {
      cacheService = new EnterpriseCacheService({
        memory: { enabled: true, stdTTL: 300 },
        redis: { enabled: false },
        monitoring: { enabled: false }
      })
    })

    afterEach(() => {
      if (cacheService) {
        cacheService.shutdown()
      }
    })

    describe('Cache Operations', () => {
      it('should set and get values from memory cache', async () => {
        const key = 'test-key'
        const value = { data: 'test-value', number: 123 }
        
        const setResult = await cacheService.set(key, value)
        expect(setResult).to.be.true
        
        const getValue = await cacheService.get(key)
        expect(getValue).to.deep.equal(value)
      })

      it('should return null for cache miss', async () => {
        const value = await cacheService.get('non-existent-key')
        expect(value).to.be.null
      })

      it('should delete cached values', async () => {
        const key = 'test-delete'
        const value = 'test-value'
        
        await cacheService.set(key, value)
        const getValue1 = await cacheService.get(key)
        expect(getValue1).to.equal(value)
        
        const deleteResult = await cacheService.delete(key)
        expect(deleteResult).to.be.true
        
        const getValue2 = await cacheService.get(key)
        expect(getValue2).to.be.null
      })
    })

    describe('Cache-Aside Pattern', () => {
      it('should get or set using fetch function', async () => {
        const key = 'fetch-test'
        let fetchCalled = false
        
        const fetchFunction = async () => {
          fetchCalled = true
          return { data: 'fetched-data' }
        }
        
        // First call should fetch
        const result1 = await cacheService.getOrSet(key, fetchFunction)
        expect(result1).to.deep.equal({ data: 'fetched-data' })
        expect(fetchCalled).to.be.true
        
        // Second call should use cache
        fetchCalled = false
        const result2 = await cacheService.getOrSet(key, fetchFunction)
        expect(result2).to.deep.equal({ data: 'fetched-data' })
        expect(fetchCalled).to.be.false
      })
    })

    describe('Cache Metrics', () => {
      it('should track cache hits and misses', async () => {
        const key = 'metrics-test'
        const value = 'test-value'
        
        // Cache miss
        await cacheService.get(key)
        
        // Cache set
        await cacheService.set(key, value)
        
        // Cache hit
        await cacheService.get(key)
        
        const metrics = cacheService.getMetrics()
        
        expect(metrics.hits.total).to.equal(1)
        expect(metrics.misses.total).to.equal(1)
        expect(metrics.sets.total).to.equal(1)
        expect(metrics.totalRequests).to.equal(2)
        expect(parseFloat(metrics.hitRatio)).to.equal(50)
      })
    })

    describe('Cache Warming', () => {
      it('should register and execute warming strategies', async () => {
        let warmingExecuted = false
        
        cacheService.registerWarmingStrategy('test-warming', async (cache) => {
          warmingExecuted = true
          await cache.set('warmed-key', 'warmed-value')
        })
        
        await cacheService.warmCache(['test-warming'])
        
        expect(warmingExecuted).to.be.true
        
        const warmedValue = await cacheService.get('warmed-key')
        expect(warmedValue).to.equal('warmed-value')
      })
    })
  })

  describe('Integration Tests', () => {
    describe('DAO with Encryption and Caching', () => {
      let mockDAO

      beforeEach(() => {
        // Mock DAO with enterprise features
        mockDAO = {
          encryption: new EnterpriseEncryption({
            masterKey: 'test-master-key-32-chars-long!!'
          }),
          cacheService: new EnterpriseCacheService({
            memory: { enabled: true },
            redis: { enabled: false },
            monitoring: { enabled: false }
          }),
          piiFields: ['email', 'name']
        }
      })

      afterEach(() => {
        if (mockDAO.cacheService) {
          mockDAO.cacheService.shutdown()
        }
      })

      it('should encrypt PII fields before storage', () => {
        const userData = {
          name: 'John Doe',
          email: 'john@example.com',
          age: 30
        }
        
        const encrypted = mockDAO.encryption.encryptPIIFields(
          userData, 
          mockDAO.piiFields
        )
        
        expect(encrypted.name).to.not.equal('John Doe')
        expect(encrypted.email).to.not.equal('john@example.com')
        expect(encrypted.age).to.equal(30)
        
        // Should be able to decrypt back
        const decrypted = mockDAO.encryption.decryptPIIFields(
          encrypted, 
          mockDAO.piiFields
        )
        
        expect(decrypted.name).to.equal('John Doe')
        expect(decrypted.email).to.equal('john@example.com')
        expect(decrypted.age).to.equal(30)
      })

      it('should cache and retrieve user data', async () => {
        const userData = {
          id: '123',
          name: 'John Doe',
          email: 'john@example.com'
        }
        
        // Cache the user
        const cacheKey = `user:${userData.id}`
        await mockDAO.cacheService.set(cacheKey, userData)
        
        // Retrieve from cache
        const cachedUser = await mockDAO.cacheService.get(cacheKey)
        expect(cachedUser).to.deep.equal(userData)
        
        // Check metrics
        const metrics = mockDAO.cacheService.getMetrics()
        expect(metrics.hits.total).to.equal(1)
        expect(metrics.sets.total).to.equal(1)
      })
    })
  })
})