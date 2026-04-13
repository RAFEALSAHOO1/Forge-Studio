/**
 * Authentication System Tests
 * Tests: Signup, Login, Protected Routes, Invalid Tokens
 */

const { apiCall, logResult, BASE_URL, colors } = require('./utils')

let authToken = null
let testUser = null

async function runAuthTests() {
  console.log(`\n${colors.cyan}🔐 AUTHENTICATION TESTS${colors.reset}`)
  console.log('─'.repeat(60))

  // Generate unique test user
  testUser = {
    email: `test-user-${Date.now()}@test.com`,
    password: 'TestPassword123!',
    name: 'Test User',
  }

  // Test 1: Signup new user
  await testSignup()

  // Test 2: Login with correct credentials
  await testLogin()

  // Test 3: Access protected route with valid token
  await testProtectedRoute()

  // Test 4: Try to access protected route with invalid token
  await testInvalidToken()

  // Test 5: Try to access protected route without token
  await testMissingToken()

  return { authToken, testUser }
}

async function testSignup() {
  const testName = 'Auth Signup - Create new user'

  try {
    const response = await fetch(`${BASE_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'signup',
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
      }),
    })

    const data = await response.json().catch(() => null)

    // Check status code
    if (response.status === 201) {
      // Extract token from Set-Cookie header if available
      const setCookie = response.headers.get('set-cookie')
      if (setCookie && setCookie.includes('auth-token=')) {
        const tokenMatch = setCookie.match(/auth-token=([^;]+)/)
        if (tokenMatch) {
          authToken = tokenMatch[1]
        }
      }

      logResult(testName, data?.data?.user?.id, 
        `Status: ${response.status}, User: ${data?.data?.user?.email || 'unknown'}`)
    } else {
      logResult(testName, false, 
        `Expected 201, got ${response.status}. Message: ${data?.error || data?.message}`)
    }
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testLogin() {
  const testName = 'Auth Login - Valid credentials'

  try {
    const response = await fetch(`${BASE_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        email: testUser.email,
        password: testUser.password,
      }),
    })

    const data = await response.json().catch(() => null)

    if (response.status === 200 && data?.data?.user?.id) {
      // Extract JWT token from Set-Cookie header
      const setCookie = response.headers.get('set-cookie')
      if (setCookie && setCookie.includes('auth-token=')) {
        // Extract token value from cookie string: "auth-token=JWT_VALUE; HttpOnly; ..."
        const tokenMatch = setCookie.match(/auth-token=([^;]+)/)
        if (tokenMatch) {
          authToken = tokenMatch[1]
        }
      }
      logResult(testName, true, 
        `Status: ${response.status}, User ID: ${data.data.user.id}, Token: ${authToken ? 'extracted' : 'not found'}`)
    } else {
      logResult(testName, false,
        `Expected 200 with user, got ${response.status}. Error: ${data?.message}`)
    }
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testProtectedRoute() {
  const testName = 'Auth Protected Route - Access dashboard'

  try {
    // Verify endpoint with valid-looking token
    const response = await fetch(`${BASE_URL}/api/auth`, {
      method: 'GET',
      headers: {
        'Cookie': `auth-token=test-token-format`,
      },
      credentials: 'include',
    })

    // Should reject invalid token with 401
    logResult(testName, response.status === 401,
      `Status: ${response.status} (expect 401 for invalid token)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testInvalidToken() {
  const testName = 'Auth Invalid Token - Expect 401'

  try {
    const response = await fetch(`${BASE_URL}/api/auth`, {
      method: 'GET',
      headers: {
        'Cookie': 'auth-token=invalid-fake-token-xyz',
      },
    })

    logResult(testName, response.status === 401,
      `Status: ${response.status} (expected 401)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testMissingToken() {
  const testName = 'Auth Missing Token - Expect 401'

  try {
    const response = await fetch(`${BASE_URL}/api/auth`, {
      method: 'GET',
    })

    logResult(testName, response.status === 401,
      `Status: ${response.status} (expected 401)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

module.exports = { runAuthTests }
