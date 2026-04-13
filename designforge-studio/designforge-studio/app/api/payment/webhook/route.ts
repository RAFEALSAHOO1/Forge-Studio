import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/stripe'
import { sql } from '@/lib/db'
import { ensureDBInitialized } from '@/lib/db-init'

/**
 * POST /api/payment/webhook
 * Stripe webhook endpoint to handle payment events
 * Must be configured in Stripe Dashboard → Webhooks
 * 
 * Security hardening:
 * ✅ Strict signature verification (critical!)
 * ✅ Event type validation (checkout.session.completed only)
 * ✅ Extract orderId from metadata ONLY
 * ✅ Double-check order status before marking paid
 * ✅ Comprehensive logging of all operations
 * ✅ Race condition protection (status check)
 */
export async function POST(req: NextRequest) {
  try {
    await ensureDBInitialized()

    // ── Step 1: Authenticate webhook with Stripe signature ──────────────────
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      console.error('[webhook-security] Missing stripe-signature header')
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    const body = await req.text()

    // Verify webhook signature (CRITICAL security step)
    // This confirms the webhook is actually from Stripe
    let event
    try {
      event = verifyWebhookSignature(body, signature)
      console.log(`[webhook-verified] Event type=${event.type} id=${event.id}`)
    } catch (error) {
      console.error('[webhook-security] Signature verification failed:', error instanceof Error ? error.message : String(error))
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 })
    }

    // ── Step 2: Check if event already processed (prevent replay) ────────────
    const eventId = event.id
    const existingEvent = (await sql`
      SELECT id FROM processed_events WHERE event_id = ${eventId}
    `) as any[]

    if (existingEvent.length > 0) {
      // Event already processed - return success to acknowledge without re-processing
      console.log(`[webhook-duplicate-event] Event ${eventId} already processed, skipping`)
      return NextResponse.json({ received: true })
    }

    // ── Step 3: Validate event type ──────────────────────────────────────────
    // Only process checkout.session.completed events for payments
    if (event.type !== 'checkout.session.completed') {
      console.log(`[webhook-skipped] Unhandled event type: ${event.type}`)
      return NextResponse.json({ received: true })
    }

    // ── Step 4: Handle payment completion ────────────────────────────────
    const session = event.data.object as any
    await handleCheckoutSessionCompleted(session, eventId)

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true })
  } catch (error) {
    const err = error as Error
    console.error('[webhook-error]', err.message)
    
    // Return 500 for processing errors
    return NextResponse.json(
      { error: err.message || 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

/**
 * Handle checkout.session.completed event
 * Called when a payment is successfully completed
 * 
 * Security checks:
 * 1. Verify orderId exists in metadata
 * 2. Fetch order and verify it's in 'processing' status
 * 3. Update to 'paid' only if status was 'processing'
 * 4. Store payment_id from Stripe
 * 5. Record event as processed to prevent webhook replay
 */
async function handleCheckoutSessionCompleted(session: any, eventId: string) {
  // ── Extract orderId from metadata ONLY ───────────────────────────────────
  const orderId = session.metadata?.orderId
  const stripeSessionId = session.id
  const paymentId = session.payment_intent

  if (!orderId) {
    console.error(`[webhook-fraud] Checkout session ${stripeSessionId} missing orderId in metadata`)
    throw new Error('Missing orderId in metadata')
  }

  if (!paymentId) {
    console.error(`[webhook-error] Checkout session ${stripeSessionId} missing payment_intent`)
    throw new Error('Missing payment_intent')
  }

  console.log(`[webhook-payment-start] Processing session=${stripeSessionId} orderId=${orderId} paymentId=${paymentId}`)

  try {
    // ── Step 1: Fetch order from database ────────────────────────────────
    const orderResult = (await sql`
      SELECT id, user_id, status, payment_id, amount, product_name
      FROM orders 
      WHERE id = ${orderId}
    `) as any[]

    if (orderResult.length === 0) {
      console.error(`[webhook-fraud] Order not found: ${orderId}`)
      throw new Error(`Order not found: ${orderId}`)
    }

    const order = orderResult[0]

    // ── Step 2: Verify order is in 'processing' status ──────────────────
    // This prevents double-payment and ensures the payment cycle is valid
    if (order.status !== 'processing') {
      console.error(`[webhook-fraud] Order ${orderId} is not in processing status (current: ${order.status})`)
      throw new Error(`Invalid order status: ${order.status}`)
    }

    // ── Step 3: Prevent duplicate payments ──────────────────────────────
    if (order.payment_id) {
      console.warn(`[webhook-duplicate] Order ${orderId} already has payment_id=${order.payment_id}`)
      // Don't throw, just return - webhook might be retried
      return
    }

    console.log(`[webhook-ready-to-mark-paid] Order ${orderId} verified, amount=${order.amount}`)

    // ── Step 4: Update order to 'paid' status ──────────────────────────
    // Only update if status is still 'processing' (race condition protection)
    const updateResult = (await sql`
      UPDATE orders 
      SET 
        status = 'paid',
        payment_id = ${paymentId},
        updated_at = NOW()
      WHERE id = ${orderId} AND status = 'processing'
      RETURNING id, status, payment_id, user_id
    `) as any[]

    if (updateResult.length === 0) {
      console.error(`[webhook-race-condition] Failed to update order ${orderId} (may have been updated by concurrent request)`)
      throw new Error('Race condition: order already updated')
    }

    const updatedOrder = updateResult[0]

    console.log(`[webhook-success] Order marked as paid`, {
      orderId: updatedOrder.id,
      userId: updatedOrder.user_id,
      paymentId: updatedOrder.payment_id,
      stripeSessionId,
      amount: order.amount,
      product: order.product_name,
    })

    // ── Step 5: Record event as processed (prevent webhook replay) ────────
    try {
      await sql`
        INSERT INTO processed_events (event_id, event_type, order_id, processed_at)
        VALUES (${eventId}, 'checkout.session.completed', ${orderId}, NOW())
        ON CONFLICT DO NOTHING
      `
      console.log(`[webhook-event-recorded] Event ${eventId} recorded as processed`)
    } catch (eventError) {
      console.warn(`[webhook-event-record-failed] Could not record processed event:`, eventError instanceof Error ? eventError.message : String(eventError))
      // Don't throw - order is already updated successfully, this is just audit logging
    }

    // ── Step 6: Trigger post-payment actions ────────────────────────────
    // TODO: Send confirmation email
    // TODO: Trigger order processing
    // TODO: Update inventory
    // TODO: Generate invoice
  } catch (error) {
    const err = error as Error
    console.error(`[webhook-failure] Failed to process payment for order ${orderId}:`, err.message)
    
    // Try to unlock the order (revert to pending) on error
    try {
      await sql`UPDATE orders SET status = 'pending' WHERE id = ${orderId} AND status = 'processing'`
      console.log(`[webhook-unlock] Order ${orderId} returned to pending status after error`)
    } catch (unlockError) {
      console.error(`[webhook-unlock-failed] Could not unlock order ${orderId}:`, unlockError instanceof Error ? unlockError.message : String(unlockError))
    }

    throw error
  }
}

/**
 * Handle charge.refunded event
 * Called when a refund is processed
 * 
 * Security checks:
 * 1. Verify payment_intent exists
 * 2. Find order by payment_id
 * 3. Update status to 'refunded'
 */
async function handleChargeRefunded(charge: any) {
  const paymentId = charge.payment_intent
  const chargeId = charge.id

  if (!paymentId) {
    console.error(`[webhook-refund-error] Missing payment_intent in charge: ${chargeId}`)
    throw new Error('Missing payment_intent in refund')
  }

  console.log(`[webhook-refund-start] Processing refund for paymentId=${paymentId}`)

  try {
    // Find order by payment_id and mark as refunded
    const result = (await sql`
      UPDATE orders 
      SET status = 'refunded', updated_at = NOW()
      WHERE payment_id = ${paymentId} AND status = 'paid'
      RETURNING id, user_id, status
    `) as any[]

    if (result.length > 0) {
      const order = result[0]
      console.log(`[webhook-refund-success] Order marked as refunded`, {
        orderId: order.id,
        userId: order.user_id,
        chargeId,
        paymentId,
      })

      // TODO: Notify customer of refund, send receipt, etc.
    } else {
      console.warn(`[webhook-refund-not-found] Could not find paid order for refund: paymentId=${paymentId}`)
    }
  } catch (error) {
    const err = error as Error
    console.error(`[webhook-refund-failure] Failed to update order for refund:`, err.message)
    throw error
  }
}
