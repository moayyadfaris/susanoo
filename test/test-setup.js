/**
 * Test Setup Configuration
 * Global setup for enterprise test suite
 */

// Increase timeout for all tests
const chai = require('chai')
chai.config.timeout = 10000

// Configure test environment variables
process.env.NODE_ENV = 'development' // Use development since test is not valid
process.env.LOG_LEVEL = 'error' // Reduce log noise during tests

// Global error handling for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit the process during tests, just log
})

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n🛑 Test suite interrupted by user')
  process.exit(1)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Test suite terminated')
  process.exit(1)
})

console.log('🔧 Test environment configured')
console.log(`📍 Node Environment: ${process.env.NODE_ENV}`)
console.log(`📊 Test Database: ${process.env.DB_NAME || 'default'}`)