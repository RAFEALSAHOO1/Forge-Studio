/**
 * Orders System Tests
 * Tests: Create, List, Fetch Single, Unauthorized Access
 */

const { apiCall, logResult, BASE_URL, colors } = require('./utils')

let testOrderId = null

async function runOrdersTests(authToken) {
  console.log(`\n${colors.cyan}📦 ORDERS TESTS${colors.reset}`)
  console.log('─'.repeat(60))

  // Test 1: Create new order
  await testCreateOrder(authToken)

  // Test 2: List orders
  await testListOrders(authToken)

  // Test 3: Fetch single order
  if (testOrderId) {
    await testFetchOrder(authToken)
  }

  // Test 4: Try to access orders without authentication
  await testUnauthorizedAccess()

  // Test 5: Fetch non-existent order
  await testNotFoundOrder(authToken)

  return { testOrderId }
}

async function testCreateOrder(authToken) {
  const testName = 'Orders Create - New order'

  try {
    // For now, skip if no auth token (could be implemented with login)
    if (!authToken) {
      logResult(testName, true, 'Skipped (no auth token available)')
      return
    }

    const response = await fetch(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth-token=${authToken}`,
      },
      body: JSON.stringify({
        productId: 'tshirt-001',
        productName: 'Custom T-Shirt',
        category: 'apparel',
        amount: 2999, // $29.99 in cents
        currency: 'USD',
        details: {
          size: 'L',
          color: 'blue',
        },
      }),
    })

    const data = await response.json().catch(() => null)

    if ((response.status === 201 || response.status === 200) && data?.data?.orderId) {
      testOrderId = data.data.orderId
      logResult(testName, true,
        `Status: ${response.status}, Order ID: ${data.data.orderId}`)
    } else {
      logResult(testName, false,
        `Expected 201/200 with orderId, got ${response.status}. Data: ${JSON.stringify(data)}`)
    }
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testListOrders(authToken) {
  const testName = 'Orders List - Fetch user orders'

  try {
    const response = await fetch(`${BASE_URL}/api/orders/list`, {
      method: 'GET',
      headers: {
        'Cookie': `auth-token=${authToken}`,
      },
    })

    const data = await response.json().catch(() => null)

    if (response.status === 200 && Array.isArray(data?.data?.orders)) {
      logResult(testName, true,
        `Status: ${response.status}, Orders: ${data.data.orders.length}`)
    } else {
      logResult(testName, false,
        `Expected 200 with orders array, got ${response.status}`)
    }
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testFetchOrder(authToken) {
  const testName = 'Orders Fetch - Single order by ID'

  try {
    const response = await fetch(`${BASE_URL}/api/orders/${testOrderId}`, {
      method: 'GET',
      headers: {
        'Cookie': `auth-token=${authToken}`,
      },
    })

    const data = await response.json().catch(() => null)

    if (response.status === 200 && data?.data?.order?.id === testOrderId) {
      const order = data.data.order
      logResult(testName, true,
        `Status: ${response.status}, Order: ${order.id}, Amount: ${order.amount}`)
    } else {
      logResult(testName, false,
        `Expected 200 with order data, got ${response.status}`)
    }
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testUnauthorizedAccess() {
  const testName = 'Orders Unauthorized - No token'

  try {
    const response = await fetch(`${BASE_URL}/api/orders/list`, {
      method: 'GET',
    })

    logResult(testName, response.status === 401,
      `Status: ${response.status} (expected 401)`)
  } catch (error) {
    logResult(testName, false, error.message)
  }
}

async function testNotFoundOrder(authToken) {
  const testName = 'Orders Not Found - Invalid order ID'

  try {
    const fakeOrderId = 999999 // Use a non-existent but valid integer ID
    const response = await fetch(`${BASE_URL}/api/orders/${fakeOrderId}`, {
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

module.exports = { runOrdersTests }
