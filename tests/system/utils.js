/**
 * Test utilities and shared functions
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  tests: [],
}

/**
 * Log a test result
 */
function logResult(testName, passed, message = '') {
  testResults.total++
  const status = passed ? 'PASS' : 'FAIL'
  const color = passed ? 'green' : 'red'
  const icon = passed ? '✓' : '✗'

  console.log(`${colors[color]}${icon} ${status}${colors.reset}: ${testName}`)
  if (message) {
    console.log(`  ${colors.gray}${message}${colors.reset}`)
  }

  if (passed) {
    testResults.passed++
  } else {
    testResults.failed++
  }

  testResults.tests.push({
    name: testName,
    passed,
    message,
  })
}

/**
 * Make HTTP request helper
 */
async function apiCall(method, path, body = null, headers = {}) {
  const url = `${BASE_URL}${path}`
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  try {
    const response = await fetch(url, options)
    const data = response.ok ? await response.json().catch(() => null) : null
    return { status: response.statusCode || response.status, data, response }
  } catch (error) {
    return { status: 0, error: error.message, data: null }
  }
}

/**
 * Get results summary
 */
function getResultsSummary() {
  return {
    passed: testResults.passed,
    failed: testResults.failed,
    total: testResults.total,
  }
}

/**
 * Print final results
 */
function printFinalResults() {
  console.log('\n' + '='.repeat(60))
  console.log(`${colors.cyan}TEST RESULTS${colors.reset}`)
  console.log('='.repeat(60))

  const { passed, failed, total } = testResults

  console.log(`\n${colors.blue}Summary:${colors.reset}`)
  console.log(`  Total:  ${total}`)
  console.log(`  ${colors.green}Passed: ${passed}${colors.reset}`)
  console.log(`  ${colors.red}Failed: ${failed}${colors.reset}`)

  if (failed === 0) {
    console.log(`\n${colors.green}✓ ALL TESTS PASSED!${colors.reset}`)
  } else {
    console.log(`\n${colors.red}✗ ${failed} TEST(S) FAILED${colors.reset}`)
  }

  console.log('='.repeat(60) + '\n')

  return failed === 0
}

module.exports = {
  BASE_URL,
  colors,
  logResult,
  apiCall,
  getResultsSummary,
  printFinalResults,
  testResults,
}
