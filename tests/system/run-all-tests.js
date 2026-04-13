#!/usr/bin/env node

/**
 * Complete Automated System Test Suite
 * 
 * Runs all system tests:
 * - Authentication
 * - Orders
 * - Payments
 * - Security
 * 
 * Usage: node run-all-tests.js
 */

const { colors, printFinalResults, testResults } = require('./utils')
const { runAuthTests } = require('./auth.test')
const { runOrdersTests } = require('./orders.test')
const { runPaymentTests } = require('./payment.test')
const { runSecurityTests } = require('./security.test')

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

/**
 * Main test runner
 */
async function main() {
  console.log('\n' + '═'.repeat(60))
  console.log(`${colors.cyan}🚀 AUTOMATED SYSTEM TEST SUITE${colors.reset}`)
  console.log(`${colors.gray}Testing: ${BASE_URL}${colors.reset}`)
  console.log('═'.repeat(60))

  try {
    // Check if server is running
    console.log(`\n${colors.blue}Checking server connectivity...${colors.reset}`)
    const healthCheck = await fetch(`${BASE_URL}/api/health`)
    if (healthCheck.status !== 200) {
      console.log(`${colors.yellow}⚠️  Server health check: ${healthCheck.status}${colors.reset}`)
    } else {
      console.log(`${colors.green}✓ Server is online${colors.reset}`)
    }

    // Run authentication tests
    const authResult = await runAuthTests()
    const authToken = authResult.authToken || 'test-token'

    // Run orders tests
    await runOrdersTests(authToken)

    // Run payment tests
    await runPaymentTests(authToken)

    // Run security tests
    await runSecurityTests(authToken)

    // Print final results
    const allPassed = printFinalResults()

    // Exit with appropriate code
    process.exit(allPassed ? 0 : 1)
  } catch (error) {
    console.error(`${colors.red}✗ Test suite error: ${error.message}${colors.reset}`)
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Tests interrupted${colors.reset}`)
  printFinalResults()
  process.exit(1)
})

// Run tests
main()
