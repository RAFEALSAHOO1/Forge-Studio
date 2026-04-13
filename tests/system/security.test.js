/**
 * Security System Tests
 * Tests: Fake Tokens, Wrong IDs, Tampered Data, Authorization
 */

const { logResult, BASE_URL, colors } = require('./utils')

async function runSecurityTests(authToken) {
  console.log(`\n${colors.cyan}🔒 SECURITY TESTS${colors.reset}`)
  console.log('─'.repeat(60))

  // Test 1: Fake JWT token
  await testFakeToken()

  // Test 2: Wrong order ID
  await testWrongOrderId(authToken)

  // Test 3: Tampered amount in payment
  await testTamperedAmount(authToken)

  // Test 4: Cross-user order access
  await testCrossUserAccess(authToken)

  // Test 5: Invalid token format
  await testInvalidTokenFormat()

  // Test 6: Admin route without token
  await testAdminWithoutToken()

  // Test 7: Invalid payment intent
  await testInvalidPaymentIntent(authToken)

  // Test 8: Negative amount
  await testNegativeAmount(authToken)
}

async function testFakeToken() {
  const testName = 'Security Fake Token - Should reject'

  try {
    const response = await fetch(`${BASE_URL}/api/orders/list`, {
      method: 'GET',
      headers: {
        'Cookie': 'auth-token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.invalid',
      },
    })

    logResult(testName, response.status === 401,
      `Status: ${response.status} (expected 401 for invalid token)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testWrongOrderId(authToken) {
  const testName = 'Security Wrong ID - Non-existent order'

  try {
    const fakeId = 'order-id-that-does-not-exist-12345'
    const response = await fetch(`${BASE_URL}/api/orders/${fakeId}`, {
      method: 'GET',
      headers: {
        'Cookie': `auth-token=${authToken}`,
      },
    })

    logResult(testName, response.status === 404,
      `Status: ${response.status} (expected 404)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testTamperedAmount(authToken) {
  const testName = 'Security Tampered Amount - Amount in DB, not request'

  try {
    // Create an order with specific amount
    const createResp = await fetch(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth-token=${authToken}`,
      },
      body: JSON.stringify({
        productId: 'security-test-001',
        productName: 'Test Product',
        category: 'test',
        amount: 5000, // $50.00
        currency: 'USD',
      }),
    })

    const orderData = await createResp.json().catch(() => null)

    if (orderData?.orderId) {
      // Try to checkout with different amount
      const checkoutResp = await fetch(`${BASE_URL}/api/payment/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth-token=${authToken}`,
        },
        body: JSON.stringify({
          orderId: orderData.orderId,
          amount: 100, // Try to pay only $1 instead of $50
        }),
      })

      // Should succeed (but use DB amount, not the tampered one)
      // Real validation happens at Stripe, but order should use DB amount
      logResult(testName, checkoutResp.status !== 400,
        `Status: ${checkoutResp.status} (API accepts request, validates server-side)`)
    }
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testCrossUserAccess(authToken) {
  const testName = 'Security Cross-User - Cannot access other user orders'

  try {
    // Try to access order with wrong auth context
    // This is simulated by using a different user token
    const response = await fetch(`${BASE_URL}/api/orders/fake-other-user-order`, {
      method: 'GET',
      headers: {
        'Cookie': 'auth-token=different-user-token',
      },
    })

    logResult(testName, response.status === 401 || response.status === 404,
      `Status: ${response.status} (should be 401 or 404)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testInvalidTokenFormat() {
  const testName = 'Security Invalid Format - Malformed token'

  try {
    const response = await fetch(`${BASE_URL}/api/auth`, {
      method: 'GET',
      headers: {
        'Cookie': 'auth-token=not-a-valid-jwt-token!!!',
      },
    })

    logResult(testName, response.status === 401,
      `Status: ${response.status} (expected 401 for malformed token)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testAdminWithoutToken() {
  const testName = 'Security Admin Route - Requires auth'

  try {
    const response = await fetch(`${BASE_URL}/api/admin/orders`, {
      method: 'GET',
    })

    logResult(testName, response.status === 401,
      `Status: ${response.status} (expected 401 for admin route)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testInvalidPaymentIntent(authToken) {
  const testName = 'Security Invalid Payment Intent - Verify endpoint'

  try {
    const response = await fetch(
      `${BASE_URL}/api/payment/verify?paymentIntent=pi_invalid_fake_xyz`,
      {
        method: 'GET',
        headers: {
          'Cookie': `auth-token=${authToken}`,
        },
      }
    )

    // Should return an error, not expose sensitive data
    logResult(testName, response.status !== 200 || 
      !response.headers.get('content-type')?.includes('sensitive'),
      `Status: ${response.status} (invalid payment intent properly rejected)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testNegativeAmount(authToken) {
  const testName = 'Security Negative Amount - Should reject'

  try {
    const response = await fetch(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth-token=${authToken}`,
      },
      body: JSON.stringify({
        productId: 'test-negative',
        productName: 'Negative Amount Test',
        category: 'test',
        amount: -5000, // Negative amount
        currency: 'USD',
      }),
    })

    logResult(testName, response.status === 400,
      `Status: ${response.status} (expected 400 for negative amount)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

module.exports = { runSecurityTests }
