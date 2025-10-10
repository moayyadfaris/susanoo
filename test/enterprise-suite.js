/**
 * Enterprise Test Suite Configuration
 * Configures and runs all API tests with proper setup and reporting
 */

const path = require('path')
const { 
  DatabaseHelper,
  TestUtils
} = require('./test-utils')

// Configure test environment
process.env.NODE_ENV = 'test'

// Global test configuration
const testConfig = {
  timeout: 30000,
  bail: false, // Continue running tests even if some fail
  reporter: 'spec',
  recursive: true,
  require: [
    path.join(__dirname, 'test-setup.js')
  ]
}

// Test suites in order of execution
const testSuites = [
  'enterprise/countries.test.js',     // No auth required - run first
  'enterprise/availability.test.js', // No auth required  
  'enterprise/users.test.js',        // User creation
  'enterprise/auth.test.js',         // Authentication
  'enterprise/user-retrieval.test.js', // User access
  'enterprise/attachments.test.js'   // File uploads
]

/**
 * Global test setup
 */
before(async function() {
  this.timeout(60000) // Allow time for database setup
  
  console.log('🚀 Starting Enterprise Test Suite...')
  console.log('📊 Setting up test environment...')
  
  try {
    // Initialize test database
    await DatabaseHelper.seedTestCountries()
    
    // Clean up any existing test data
    await DatabaseHelper.clearTestData()
    
    console.log('✅ Test environment ready')
  } catch (error) {
    console.error('❌ Test setup failed:', error.message)
    throw error
  }
})

/**
 * Global test cleanup
 */
after(async function() {
  this.timeout(30000)
  
  console.log('🧹 Cleaning up test environment...')
  
  try {
    // Clean up test data
    await DatabaseHelper.clearTestData()
    
    // Clean up test files
    TestUtils.cleanupTestFiles()
    
    console.log('✅ Test cleanup completed')
  } catch (error) {
    console.error('⚠️  Test cleanup warning:', error.message)
    // Don't fail the test suite if cleanup fails
  }
})

/**
 * Test results summary
 */
let testResults = {
  suites: {},
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  skippedTests: 0,
  startTime: null,
  endTime: null
}

// Track test execution
beforeEach(function() {
  if (!testResults.startTime) {
    testResults.startTime = new Date()
  }
  
  const suiteName = this.currentTest.parent.title
  if (!testResults.suites[suiteName]) {
    testResults.suites[suiteName] = {
      tests: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    }
  }
  
  testResults.totalTests++
  testResults.suites[suiteName].tests++
})

afterEach(function() {
  const suiteName = this.currentTest.parent.title
  const testState = this.currentTest.state
  
  switch (testState) {
    case 'passed':
      testResults.passedTests++
      testResults.suites[suiteName].passed++
      break
    case 'failed':
      testResults.failedTests++
      testResults.suites[suiteName].failed++
      break
    case 'pending':
      testResults.skippedTests++
      testResults.suites[suiteName].skipped++
      break
  }
})

// Print final summary
process.on('exit', () => {
  testResults.endTime = new Date()
  const duration = testResults.endTime - testResults.startTime
  
  console.log('\n' + '='.repeat(80))
  console.log('📊 ENTERPRISE TEST SUITE SUMMARY')
  console.log('='.repeat(80))
  console.log(`⏱️  Total Duration: ${duration}ms`)
  console.log(`📈 Total Tests: ${testResults.totalTests}`)
  console.log(`✅ Passed: ${testResults.passedTests}`)
  console.log(`❌ Failed: ${testResults.failedTests}`)
  console.log(`⏭️  Skipped: ${testResults.skippedTests}`)
  console.log(`📊 Success Rate: ${((testResults.passedTests / testResults.totalTests) * 100).toFixed(2)}%`)
  
  console.log('\n📋 Suite Breakdown:')
  Object.entries(testResults.suites).forEach(([suiteName, results]) => {
    const successRate = results.tests > 0 ? ((results.passed / results.tests) * 100).toFixed(1) : 0
    console.log(`  ${suiteName}: ${results.passed}/${results.tests} (${successRate}%)`)
  })
  
  if (testResults.failedTests > 0) {
    console.log(`\n⚠️  ${testResults.failedTests} tests failed. Check output above for details.`)
  } else {
    console.log('\n🎉 All tests passed successfully!')
  }
  
  console.log('='.repeat(80))
})

module.exports = {
  testConfig,
  testSuites,
  testResults
}