/**
 * Enterprise-level test configuration and utilities
 * Provides comprehensive testing infrastructure for API testing
 */

const chai = require('chai')
const supertest = require('supertest')
const { expect } = chai
const crypto = require('crypto')
const path = require('path')

// Configure chai
chai.config.includeStack = true

// Test configuration will be initialized later
let config = null
let app = null
let request = null

/**
 * Initialize test environment
 */
async function initializeTestEnvironment() {
  if (app) return app // Already initialized

  try {
    // Setup environment
    process.env.NODE_ENV = 'development'
    
    // Load application dependencies
    require('dotenv').config()
    require('../globals')()
    
    const { Model } = require('objection')
    const Knex = require('knex')
    const express = require('express')
    
    // Initialize configuration
    config = require('../config')
    await config.mainInit()
    
    // Initialize database
    const knexInstance = Knex(config.knex)
    Model.knex(knexInstance)
    
    // Create Express app for testing
    app = express()
    
    // Apply middlewares (simplified for testing)
    const middlewares = require('../middlewares')
    
    // Basic middleware setup
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    
    // Initialize controllers
    const controllers = require('../controllers')
    
    // Mount API routes
    app.use('/api/v1', controllers.router)
    
    // Create supertest instance
    request = supertest(app)
    
    console.log('✅ Test environment initialized successfully')
    return app
    
  } catch (error) {
    console.error('❌ Failed to initialize test environment:', error.message)
    throw error
  }
}

/**
 * Test data factory for generating consistent test data
 */
class TestDataFactory {
  static generateUniqueEmail() {
    return `test.${crypto.randomUUID().substring(0, 8)}@susanoo.test`
  }

  static generateUniqueMobile() {
    const timestamp = Date.now().toString().slice(-10)
    return `555${timestamp}`
  }

  static generateUserData(overrides = {}) {
    return {
      name: 'Test User',
      email: this.generateUniqueEmail(),
      mobileNumber: this.generateUniqueMobile(),
      password: 'TestPass123!',
      countryId: 1, // Assuming country 1 exists
      preferredLanguage: 'en',
      bio: 'Test user biography',
      acceptTerms: true,
      acceptPrivacy: true,
      acceptMarketing: false,
      ...overrides
    }
  }

  static generateFingerprint() {
    return crypto.randomBytes(20).toString('hex')
  }

  static generateDeviceInfo() {
    return {
      userAgent: 'Mozilla/5.0 (Test Browser) TestAgent/1.0',
      platform: 'test',
      version: '1.0.0'
    }
  }
}

/**
 * Authentication helper for managing test user sessions
 */
class AuthHelper {
  constructor() {
    this.sessions = new Map()
  }

  async loginUser(userCredentials) {
    const fingerprint = TestDataFactory.generateFingerprint()
    
    const response = await chai.request(baseUrl)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send({
        email: userCredentials.email,
        password: userCredentials.password,
        fingerprint
      })

    if (response.status !== 200) {
      throw new Error(`Login failed: ${response.body.message || 'Unknown error'}`)
    }

    const session = {
      accessToken: response.body.data.accessToken,
      refreshToken: response.body.data.refreshToken,
      fingerprint,
      user: response.body.data.user,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    }

    this.sessions.set(userCredentials.email, session)
    return session
  }

  async logoutUser(email) {
    const session = this.sessions.get(email)
    if (!session) return

    try {
      await chai.request(baseUrl)
        .post('/api/v1/auth/logout')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ refreshToken: session.refreshToken })
    } catch (error) {
      // Ignore logout errors in tests
    }

    this.sessions.delete(email)
  }

  getSession(email) {
    return this.sessions.get(email)
  }

  getAuthHeaders(email) {
    const session = this.sessions.get(email)
    if (!session) {
      throw new Error(`No session found for ${email}`)
    }

    return {
      'Authorization': `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json'
    }
  }

  async cleanup() {
    const emails = Array.from(this.sessions.keys())
    await Promise.all(emails.map(email => this.logoutUser(email)))
  }
}

/**
 * Database utilities for test setup and cleanup
 */
class DatabaseHelper {
  static async clearTestData() {
    // Clear test users created during testing
    const UserDAO = require('../database/dao/UserDAO')
    
    await UserDAO.query()
      .where('email', 'like', '%@susanoo.test')
      .delete()
  }

  static async seedTestCountries() {
    const CountryDAO = require('../database/dao/CountryDAO')
    
    const existingCountry = await CountryDAO.query().first()
    if (!existingCountry) {
      await CountryDAO.query().insert([
        { id: 1, name: 'United States', nicename: 'United States', iso: 'US', phonecode: '1', isActive: true },
        { id: 2, name: 'United Kingdom', nicename: 'United Kingdom', iso: 'GB', phonecode: '44', isActive: true },
        { id: 3, name: 'Germany', nicename: 'Germany', iso: 'DE', phonecode: '49', isActive: true }
      ])
    }
  }

  static async createTestUser(userData = {}) {
    const UserDAO = require('../database/dao/UserDAO')
    const { makePasswordHashHelper } = require('../helpers').authHelpers
    
    const testUserData = TestDataFactory.generateUserData(userData)
    const passwordHash = await makePasswordHashHelper(testUserData.password)
    
    const user = await UserDAO.query().insert({
      ...testUserData,
      passwordHash,
      isActive: true,
      isVerified: true,
      role: 'ROLE_USER',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    return { ...user, password: testUserData.password }
  }
}

/**
 * API response validator for consistent assertion patterns
 */
class ResponseValidator {
  static validateSuccessResponse(response, expectedStatus = 200) {
    expect(response).to.have.property('status', expectedStatus)
    expect(response.body).to.have.property('success', true)
    expect(response.body).to.have.property('data')
    expect(response.body).to.have.property('meta')
    expect(response.body.meta).to.have.property('requestId')
    expect(response.body.meta).to.have.property('timestamp')
  }

  static validateErrorResponse(response, expectedStatus, expectedCode = null) {
    expect(response).to.have.property('status', expectedStatus)
    expect(response.body).to.have.property('success', false)
    
    if (expectedCode) {
      expect(response.body).to.have.property('code', expectedCode)
    }
    
    expect(response.body).to.have.property('message')
    expect(response.body.message).to.be.a('string').that.is.not.empty
  }

  static validateUserObject(user, includePrivateFields = false) {
    expect(user).to.be.an('object')
    expect(user).to.have.property('id').that.is.a('number')
    expect(user).to.have.property('name').that.is.a('string')
    expect(user).to.have.property('email').that.is.a('string')
    
    if (includePrivateFields) {
      expect(user).to.have.property('mobileNumber')
      expect(user).to.have.property('countryId')
    }
    
    // Should never include password hash
    expect(user).to.not.have.property('passwordHash')
    expect(user).to.not.have.property('password')
  }

  static validateAuthResponse(response) {
    this.validateSuccessResponse(response, 200)
    
    const { data } = response.body
    expect(data).to.have.property('accessToken').that.is.a('string').and.not.empty
    expect(data).to.have.property('refreshToken').that.is.a('string').and.not.empty
    expect(data).to.have.property('user').that.is.an('object')
    expect(data).to.have.property('session').that.is.an('object')
    
    this.validateUserObject(data.user, true)
  }

  static validateAvailabilityResponse(response, expectedFormat = 'enhanced') {
    this.validateSuccessResponse(response, 200)
    
    const { data } = response.body
    
    if (expectedFormat === 'legacy') {
      expect(response.body).to.have.property('message')
      expect(data).to.be.undefined
    } else {
      expect(data).to.have.property('summary')
      expect(data).to.have.property('results').that.is.an('array')
      expect(data.summary).to.have.property('totalChecks').that.is.a('number')
      expect(data.summary).to.have.property('availableCount').that.is.a('number')
      expect(data.summary).to.have.property('unavailableCount').that.is.a('number')
      expect(data.summary).to.have.property('allAvailable').that.is.a('boolean')
    }
  }
}

/**
 * Test utilities for common operations
 */
class TestUtils {
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  static async withRetry(operation, maxRetries = 3, delayMs = 1000) {
    let lastError
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        if (i < maxRetries - 1) {
          await this.delay(delayMs)
        }
      }
    }
    
    throw lastError
  }

  static generateTestFile(filename = 'test-file.txt', content = 'Test file content') {
    const fs = require('fs')
    const tmpPath = path.join(__dirname, 'tmp', filename)
    
    // Ensure tmp directory exists
    const tmpDir = path.dirname(tmpPath)
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
    
    fs.writeFileSync(tmpPath, content)
    return tmpPath
  }

  static cleanupTestFiles() {
    const fs = require('fs')
    const tmpDir = path.join(__dirname, 'tmp')
    
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }
}

// Export everything for use in test files
module.exports = {
  chai,
  expect,
  initializeTestEnvironment,
  getApp: () => app,
  getRequest: () => request,
  getConfig: () => config,
  TestDataFactory,
  AuthHelper,
  DatabaseHelper,
  ResponseValidator,
  TestUtils
}