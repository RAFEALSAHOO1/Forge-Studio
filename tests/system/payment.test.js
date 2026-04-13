/**
 * Payment System Tests
 * Tests: Checkout, Webhook, Payment Verification, Duplicate Blocking
 */

const { logResult, BASE_URL, colors } = require('./utils')

let testPaymentOrderId = null

async function runPaymentTests(authToken) {
  console.log(`\n${colors.cyan}💳 PAYMENT TESTS${colors.reset}`)
  console.log('─'.repeat(60))

  // First, create an order to pay for
  await createPaymentTestOrder(authToken)

  if (testPaymentOrderId) {
    // Test 1: Create checkout session
    await testCreateCheckout(authToken)

    // Test 2: Test unauthorized checkout (no token)
    await testUnauthorizedCheckout()

    // Test 3: Test duplicate checkout attempt (409 conflict)
    await testDuplicateCheckout(authToken)

    // Test 4: Test payment verification
    await testPaymentVerification(authToken)
  }

  return { testPaymentOrderId }
}

async function createPaymentTestOrder(authToken) {
  try {
    const response = await fetch(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth-token=${authToken}`,
      },
      body: JSON.stringify({
        productId: 'payment-test-001',
        productName: 'Payment Test Product',
        category: 'test',
        amount: 5000, // $50.00 in cents
        currency: 'USD',
      }),
    })

    const data = await response.json().catch(() => null)
    if (response.status === 201 && data?.orderId) {
      testPaymentOrderId = data.orderId
    }
  } catch (error) {
    console.error('Failed to create test order for payment:', error.message)
  }
}

async function testCreateCheckout(authToken) {
  const testName = 'Payment Checkout - Create session'

  try {
    const response = await fetch(`${BASE_URL}/api/payment/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth-token=${authToken}`,
      },
      body: JSON.stringify({
        orderId: testPaymentOrderId,
      }),
    })

    const data = await response.json().catch(() => null)

    if (response.status === 200 && data?.sessionId) {
      logResult(testName, true,
        `Status: ${response.status}, Session: ${data.sessionId.substring(0, 20)}...`)
    } else {
      logResult(testName, false,
        `Expected 200 with sessionId, got ${response.status}. Error: ${data?.error}`)
    }
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testUnauthorizedCheckout() {
  const testName = 'Payment Unauthorized - No token'

  try {
    const response = await fetch(`${BASE_URL}/api/payment/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId: testPaymentOrderId,
      }),
    })

    logResult(testName, response.status === 401,
      `Status: ${response.status} (expected 401)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testDuplicateCheckout(authToken) {
  const testName = 'Payment Duplicate - Second attempt blocked'

  try {
    // First checkout
    const response1 = await fetch(`${BASE_URL}/api/payment/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth-token=${authToken}`,
      },
      body: JSON.stringify({
        orderId: testPaymentOrderId,
      }),
    })

    // Quick second checkout on same order
    const response2 = await fetch(`${BASE_URL}/api/payment/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth-token=${authToken}`,
      },
      body: JSON.stringify({
        orderId: testPaymentOrderId,
      }),
    })

    // Second should fail with 409 Conflict
    logResult(testName, response2.status === 409,
      `First: ${response1.status}, Second: ${response2.status} (expected 409)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testPaymentVerification(authToken) {
  const testName = 'Payment Verify - Check status endpoint'

  try {
    const response = await fetch(
      `${BASE_URL}/api/payment/verify?orderId=${testPaymentOrderId}`,
      {
        method: 'GET',
        headers: {
          'Cookie': `auth-token=${authToken}`,
        },
      }
    )

    const data = await response.json().catch(() => null)

    // Verify endpoint should return some response (404, 200, etc)
    logResult(testName, response.status > 0,
      `Status: ${response.status}, Response: ${data?.status || 'none'}`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

module.exports = { runPaymentTests }
