import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { sql } from '@/lib/db'
import { verifyToken, extractTokenFromCookies } from '@/lib/jwt'
import { ensureDBInitialized } from '@/lib/db-init'

/**
 * GET /api/payment/verify - Fallback payment verification
 * 
 * Use this endpoint to verify payment status if webhook was missed or delayed.
 * Queries Stripe directly and updates order if payment is confirmed.
 * 
 * Query parameters:
 * - paymentIntent: Stripe payment_intent ID
 * - orderId: Order ID to update (optional, will be found from Stripe if not provided)
 * 
 * Security:
 * ✅ Must be authenticated with JWT
 * ✅ Verifies order ownership
 * ✅ Only updates 'processing' orders
 * ✅ Atomic update with race condition protection
 * ✅ Comprehensive logging
 */
export async function GET(req: NextRequest) {
  try {
    await ensureDBInitialized()

    // ── Step 1: Authenticate user via JWT ─────────────────────────────────
    const token = extractTokenFromCookies(req.headers.get('cookie'))
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const userId = payload.userId

    // ── Step 2: Get payment_intent from query parameters ──────────────────
    const { searchParams } = new URL(req.url)
    const paymentIntent = searchParams.get('paymentIntent')
    const orderId = searchParams.get('orderId')

    if (!paymentIntent) {
      return NextResponse.json(
        { error: 'paymentIntent query parameter is required' },
        { status: 400 }
      )
    }

    console.log(`[verify-start] userId=${userId} paymentIntent=${paymentIntent} orderId=${orderId}`)

    // ── Step 3: Find order (either by orderId or by querying Stripe) ───────
    let order: any = null

    if (orderId) {
      // If orderId provided, fetch directly
      const orderResult = (await sql`
        SELECT id, user_id, status, payment_id, amount, product_name
        FROM orders
        WHERE id = ${orderId}
      `) as any[]

      if (orderResult.length === 0) {
        console.warn(`[verify-error] Order not found: ${orderId}`)
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }

      order = orderResult[0]
    } else {
      // Otherwise, query Stripe to find the payment
      let stripePayment: any
      try {
        stripePayment = await stripe.paymentIntents.retrieve(paymentIntent)
        console.log(`[verify-stripe] Retrieved paymentIntent=${paymentIntent} status=${stripePayment.status}`)
      } catch (error) {
        console.error(`[verify-error] Failed to retrieve paymentIntent from Stripe:`, error)
        return NextResponse.json(
          { error: 'Failed to retrieve payment from Stripe' },
          { status: 400 }
        )
      }

      // Extract orderId from metadata
      const metadataOrderId = stripePayment.metadata?.orderId
      if (!metadataOrderId) {
        console.error(`[verify-error] No orderId found in Stripe metadata for ${paymentIntent}`)
        return NextResponse.json(
          { error: 'Order ID not found in payment metadata' },
          { status: 400 }
        )
      }

      // Now fetch the order
      const orderResult = (await sql`
        SELECT id, user_id, status, payment_id, amount, product_name
        FROM orders
        WHERE id = ${metadataOrderId}
      `) as any[]

      if (orderResult.length === 0) {
        console.warn(`[verify-error] Order not found: ${metadataOrderId}`)
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }

      order = orderResult[0]
    }

    // ── Step 4: Verify order belongs to user ──────────────────────────────
    if (String(order.user_id) !== String(userId)) {
      console.error(`[verify-unauthorized] User ${userId} trying to verify order ${order.id} owned by ${order.user_id}`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Step 5: Check if order is already paid ───────────────────────────
    if (order.status === 'paid') {
      console.log(`[verify-already-paid] Order ${order.id} already marked as paid`)
      return NextResponse.json({
        status: 'paid',
        orderId: order.id,
        paymentId: order.payment_id,
        message: 'Order already marked as paid',
      })
    }

    // ── Step 6: If order is not processing, cannot verify ────────────────
    if (order.status !== 'processing') {
      console.warn(`[verify-invalid-status] Order ${order.id} has status=${order.status}, cannot verify`)
      return NextResponse.json(
        {
          status: 'invalid',
          message: `Order has status: ${order.status}. Can only verify orders in 'processing' state.`,
        },
        { status: 400 }
      )
    }

    // ── Step 7: Fetch payment status from Stripe ─────────────────────────
    let stripePayment: any
    try {
      stripePayment = await stripe.paymentIntents.retrieve(paymentIntent)
      console.log(`[verify-payment-status] paymentIntent=${paymentIntent} status=${stripePayment.status}`)
    } catch (error) {
      console.error(`[verify-stripe-error] Failed to retrieve payment:`, error)
      return NextResponse.json(
        { error: 'Failed to verify payment status' },
        { status: 500 }
      )
    }

    // ── Step 8: Handle different payment statuses ────────────────────────
    if (stripePayment.status === 'succeeded' || stripePayment.status === 'requires_capture') {
      // Payment was successful! Mark order as paid (webhook may have missed it)
      console.log(`[verify-marking-paid] Payment succeeded for order ${order.id}, marking as paid`)

      const updateResult = (await sql`
        UPDATE orders
        SET
          status = 'paid',
          payment_id = ${paymentIntent},
          updated_at = NOW()
        WHERE id = ${order.id} AND status = 'processing'
        RETURNING id, status, payment_id, user_id, amount
      `) as any[]

      if (updateResult.length === 0) {
        // Order may have been updated by webhook already
        console.log(`[verify-already-updated] Order ${order.id} was already updated, likely by webhook`)
        return NextResponse.json({
          status: 'paid',
          orderId: order.id,
          paymentId: paymentIntent,
          message: 'Order already updated (likely by webhook)',
        })
      }

      const updatedOrder = updateResult[0]
      console.log(`[verify-success] Order marked as paid`, {
        orderId: updatedOrder.id,
        paymentId: updatedOrder.payment_id,
        amount: updatedOrder.amount,
        userId: updatedOrder.user_id,
      })

      return NextResponse.json({
        status: 'paid',
        orderId: updatedOrder.id,
        paymentId: updatedOrder.payment_id,
        message: 'Payment verified and order updated',
      })
    }

    if (stripePayment.status === 'processing') {
      console.log(`[verify-processing] Payment still processing for order ${order.id}`)
      return NextResponse.json({
        status: 'processing',
        orderId: order.id,
        message: 'Payment is still processing, please wait',
      })
    }

    if (stripePayment.status === 'requires_action') {
      console.warn(`[verify-requires-action] Payment requires additional action for order ${order.id}`)
      return NextResponse.json(
        {
          status: 'requires_action',
          orderId: order.id,
          message: 'Payment requires additional action (e.g., 3D secure)',
        },
        { status: 400 }
      )
    }

    // ── Payment failed or was cancelled ──────────────────────────────────
    console.warn(`[verify-payment-failed] Payment failed with status=${stripePayment.status} for order ${order.id}`)

    // Revert order to pending so user can retry
    const revertResult = (await sql`
      UPDATE orders
      SET status = 'pending', updated_at = NOW()
      WHERE id = ${order.id} AND status = 'processing'
      RETURNING id, status
    `) as any[]

    if (revertResult.length > 0) {
      console.log(`[verify-reverted] Order ${order.id} reverted to pending for retry`)
    }

    return NextResponse.json({
      status: 'failed',
      orderId: order.id,
      paymentStatus: stripePayment.status,
      message: 'Payment failed. Order has been reverted to pending. Please try again.',
    })
  } catch (error) {
    const err = error as Error
    console.error(`[verify-error] ${err.message}`)
    return NextResponse.json(
      { error: 'Failed to verify payment' },
      { status: 500 }
    )
  }
}
