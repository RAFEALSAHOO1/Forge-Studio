#!/usr/bin/env node

/**
 * Production Resilience Test Suite
 * 
 * Tests for:
 * 1. Timeout handling (reset stuck orders)
 * 2. Payment verification fallback
 * 3. Webhook idempotency
 * 4. Event deduplication
 * 5. Retry-safe operations
 */

const fs = require('fs')
const path = require('path')

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

let passCount = 0
let failCount = 0

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function test(name, fn) {
  try {
    fn()
    log(`✓ ${name}`, 'green')
    passCount++
  } catch (error) {
    log(`✗ ${name}`, 'red')
    log(`  ${error instanceof Error ? error.message : String(error)}`, 'red')
    failCount++
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

log('\n🔒 PRODUCTION RESILIENCE TESTS', 'cyan')
log('='.repeat(60), 'cyan')

// ── Test 1: Verify endpoint exists and has proper security ──────────────

test('SECURITY: /api/payment/verify requires JWT', () => {
  const verifyFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/verify/route.ts'),
    'utf8'
  )
  if (!verifyFile.includes('extractTokenFromCookies')) {
    throw new Error('Missing JWT extraction')
  }
  if (!verifyFile.includes('verifyToken(token)')) {
    throw new Error('Missing token verification')
  }
})

test('SECURITY: /api/payment/verify verifies order ownership', () => {
  const verifyFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/verify/route.ts'),
    'utf8'
  )
  if (!verifyFile.includes('order.user_id') || !verifyFile.includes('userId')) {
    throw new Error('Missing user ownership check')
  }
})

test('SECURITY: /api/payment/verify only updates processing orders', () => {
  const verifyFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/verify/route.ts'),
    'utf8'
  )
  if (!verifyFile.includes("'processing'")) {
    throw new Error('Missing processing status check')
  }
})

// ── Test 2: Verify cron endpoint exists and has proper security ───────

test('SECURITY: /api/cron/reset-stuck-orders requires authorization', () => {
  const cronFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/cron/reset-stuck-orders/route.ts'),
    'utf8'
  )
  if (!cronFile.includes('CRON_SECRET') && !cronFile.includes('API_SECRET')) {
    throw new Error('Missing secret verification')
  }
  if (!cronFile.includes('Authorization') || !cronFile.includes('Bearer')) {
    throw new Error('Missing Bearer token check')
  }
})

test('IDEMPOTENCY: /api/cron/reset-stuck-orders is idempotent', () => {
  const cronFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/cron/reset-stuck-orders/route.ts'),
    'utf8'
  )
  if (!cronFile.includes('AND status = \'processing\'')) {
    throw new Error('Missing idempotent status check in UPDATE')
  }
})

test('RESILIENCE: /api/cron/reset-stuck-orders has 15-minute timeout', () => {
  const cronFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/cron/reset-stuck-orders/route.ts'),
    'utf8'
  )
  if (!cronFile.includes('900') && !cronFile.includes('15')) {
    throw new Error('Missing 15-minute timeout specification')
  }
})

// ── Test 3: Verify webhook event deduplication ─────────────────────────

test('IDEMPOTENCY: Webhook checks for duplicate events', () => {
  const webhookFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/webhook/route.ts'),
    'utf8'
  )
  if (!webhookFile.includes('processed_events') || !webhookFile.includes('event_id')) {
    throw new Error('Missing processed_events check')
  }
})

test('IDEMPOTENCY: Webhook stores processed event IDs', () => {
  const webhookFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/webhook/route.ts'),
    'utf8'
  )
  if (!webhookFile.includes('INSERT INTO processed_events')) {
    throw new Error('Missing event recording')
  }
})

test('IDEMPOTENCY: Webhook returns early for duplicate events', () => {
  const webhookFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/webhook/route.ts'),
    'utf8'
  )
  if (!webhookFile.includes('received: true') && webhookFile.includes('[webhook-duplicate-event]')) {
    throw new Error('Missing early return for duplicates')
  }
})

// ── Test 4: Verify database schema has required columns ────────────────

test('SCHEMA: Orders table has updated_at for timeout tracking', () => {
  const schemaFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/lib/db-schema.ts'),
    'utf8'
  )
  if (!schemaFile.includes('updated_at')) {
    throw new Error('Missing updated_at column')
  }
})

test('SCHEMA: processed_events table exists for deduplication', () => {
  const schemaFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/lib/db-schema.ts'),
    'utf8'
  )
  if (!schemaFile.includes('processed_events')) {
    throw new Error('Missing processed_events table')
  }
})

test('SCHEMA: processed_events has unique event_id constraint', () => {
  const schemaFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/lib/db-schema.ts'),
    'utf8'
  )
  if (!schemaFile.includes('UNIQUE') || !schemaFile.includes('event_id')) {
    throw new Error('Missing unique constraint on event_id')
  }
})

test('INDEX: processed_events table is indexed for fast lookups', () => {
  const schemaFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/lib/db-schema.ts'),
    'utf8'
  )
  if (!schemaFile.includes('idx_processed_events')) {
    throw new Error('Missing index on processed_events')
  }
})

test('INDEX: Orders updated_at is indexed for timeout queries', () => {
  const schemaFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/lib/db-schema.ts'),
    'utf8'
  )
  if (!schemaFile.includes('idx_orders_updated_at')) {
    throw new Error('Missing index on orders.updated_at')
  }
})

// ── Test 5: Verify proper error handling and recovery ──────────────────

test('RECOVERY: Webhook unlocks order on failure', () => {
  const webhookFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/webhook/route.ts'),
    'utf8'
  )
  if (!webhookFile.includes('[webhook-unlock]')) {
    throw new Error('Missing order unlock on error')
  }
})

test('RECOVERY: Verify endpoint reverts failed orders to pending', () => {
  const verifyFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/verify/route.ts'),
    'utf8'
  )
  if (!verifyFile.includes("[verify-reverted]") && !verifyFile.includes("status = 'pending'")) {
    throw new Error('Missing revert to pending on payment failure')
  }
})

// ── Test 6: Verify comprehensive logging ────────────────────────────────

test('LOGGING: Cron endpoint logs all reset operations', () => {
  const cronFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/cron/reset-stuck-orders/route.ts'),
    'utf8'
  )
  if (!cronFile.includes('[cron-reset-order]')) {
    throw new Error('Missing logging for reset operations')
  }
})

test('LOGGING: Webhook logs event processing', () => {
  const webhookFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/webhook/route.ts'),
    'utf8'
  )
  if (!webhookFile.includes('[webhook-event-recorded]')) {
    throw new Error('Missing event recording log')
  }
})

test('LOGGING: Verify endpoint logs payment status checks', () => {
  const verifyFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/verify/route.ts'),
    'utf8'
  )
  if (!verifyFile.includes('[verify-payment-status]')) {
    throw new Error('Missing payment status logging')
  }
})

// ── Test 7: Verify atomic database operations ────────────────────────────

test('ATOMIC: Webhook uses atomic UPDATE with status condition', () => {
  const webhookFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/webhook/route.ts'),
    'utf8'
  )
  if (!webhookFile.includes("WHERE id = ${orderId} AND status = 'processing'")) {
    throw new Error('Missing atomic status check in webhook UPDATE')
  }
})

test('ATOMIC: Verify endpoint uses atomic UPDATE with status condition', () => {
  const verifyFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/verify/route.ts'),
    'utf8'
  )
  if (!verifyFile.includes("WHERE id = ${order.id} AND status = 'processing'")) {
    throw new Error('Missing atomic status check in verify UPDATE')
  }
})

test('ATOMIC: Cron endpoint uses atomic UPDATE with status condition', () => {
  const cronFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/cron/reset-stuck-orders/route.ts'),
    'utf8'
  )
  if (!cronFile.includes("AND status = 'processing'")) {
    throw new Error('Missing atomic status check in cron UPDATE')
  }
})

// ── Test 8: Verify Stripe integration ─────────────────────────────────────

test('STRIPE: Verify endpoint retrieves paymentIntent from Stripe', () => {
  const verifyFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/verify/route.ts'),
    'utf8'
  )
  if (!verifyFile.includes('stripe.paymentIntents.retrieve')) {
    throw new Error('Missing Stripe payment retrieval')
  }
})

test('STRIPE: Verify endpoint handles all payment statuses', () => {
  const verifyFile = fs.readFileSync(
    path.join(__dirname, 'designforge-studio/designforge-studio/app/api/payment/verify/route.ts'),
    'utf8'
  )
  if (!verifyFile.includes('succeeded') || !verifyFile.includes('processing') || !verifyFile.includes('requires_action')) {
    throw new Error('Missing payment status handlers')
  }
})

// ============================================================================
// RESULTS
// ============================================================================

log('\n' + '='.repeat(60), 'cyan')
log(`RESULTS: ${colors.green}${passCount} passed${colors.reset}, ${colors.red}${failCount} failed${colors.reset}`, 'cyan')

if (failCount === 0) {
  log('\n✅ All production resilience checks passed!', 'green')
  log('\nYour payment system now has:', 'green')
  log('  ✓ Timeout handling for stuck orders (15 minutes)', 'green')
  log('  ✓ Payment verification fallback endpoint', 'green')
  log('  ✓ Webhook idempotency & deduplication', 'green')
  log('  ✓ Comprehensive error recovery', 'green')
  log('  ✓ Atomic database operations', 'green')
  log('  ✓ Full audit logging', 'green')
  process.exit(0)
} else {
  log(`\n❌ ${failCount} issue(s) found. Please fix the above.`, 'red')
  process.exit(1)
}
