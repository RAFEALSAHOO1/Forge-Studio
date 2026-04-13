import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { rateLimit } from '@/lib/utils'
import { sql } from '@/lib/db'
import { verifyToken, extractTokenFromCookies } from '@/lib/jwt'
import { ensureDBInitialized } from '@/lib/db-init'

/**
 * POST /api/payment/checkout - Create Stripe checkout session
 * 
 * Security hardening:
 * ✅ Amount fetched from database (NOT frontend)
 * ✅ Validate order exists & belongs to user
 * ✅ Verify order status is 'pending' (prevent duplicate payments)
 * ✅ Lock order with 'processing' status during payment
 * ✅ Proper error codes (400, 401, 409)
 * ✅ Comprehensive logging
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const { allowed } = rateLimit(`payment-checkout-${ip}`, 10, 60_000)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  try {
    await ensureDBInitialized()

    // ── Step 1: Authenticate user via JWT ─────────────────────────────────
    const token = extractTokenFromCookies(req.headers.get('cookie'))
    if (!token) {
      console.warn(`[payment] Unauthorized checkout attempt from ${ip}`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload) {
      console.warn(`[payment] Invalid token in checkout attempt from ${ip}`)
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const userId = payload.userId

    // ── Step 2: Validate request body ─────────────────────────────────────
    const body = await req.json()
    const orderId = body.orderId

    if (!orderId) {
      console.warn(`[payment] Missing orderId from userId ${userId}`)
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    console.log(`[payment-start] userId=${userId} orderId=${orderId}`)

    // ── Step 3: Fetch order from database (NEVER trust frontend amount) ────
    const orderResult = (await sql`
      SELECT id, product_name, amount, currency, user_id, status, payment_id
      FROM orders 
      WHERE id = ${orderId}
    `) as any[]

    if (!orderResult.length) {
      console.warn(`[payment-error] Order not found: ${orderId}`)
      return NextResponse.json({ error: 'Order not found' }, { status: 400 })
    }

    const order = orderResult[0]

    // ── Step 4: Verify order belongs to user ──────────────────────────────
    if (String(order.user_id) !== String(userId)) {
      console.error(`[payment-fraud] Unauthorized access attempt: userId=${userId} trying to access order=${orderId} owned by ${order.user_id}`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Step 5: Check if order is already paid (prevent duplicate payments) ─
    if (order.status === 'paid') {
      console.warn(`[payment-duplicate] Order ${orderId} already paid (payment_id=${order.payment_id})`)
      return NextResponse.json({ error: 'Order already paid' }, { status: 409 })
    }

    if (order.status === 'processing') {
      console.warn(`[payment-duplicate] Order ${orderId} already in processing status`)
      return NextResponse.json({ error: 'Payment already in progress' }, { status: 409 })
    }

    if (order.status !== 'pending') {
      console.warn(`[payment-error] Order ${orderId} has invalid status: ${order.status}`)
      return NextResponse.json({ error: 'Order cannot be paid in current status' }, { status: 400 })
    }

    // ── Step 6: Lock order with 'processing' status ────────────────────────
    const lockResult = (await sql`
      UPDATE orders 
      SET status = 'processing', updated_at = NOW()
      WHERE id = ${orderId} AND status = 'pending'
      RETURNING id, status
    `) as any[]

    if (!lockResult.length) {
      console.error(`[payment-race-condition] Failed to lock order ${orderId} (likely concurrent payment attempt)`)
      return NextResponse.json({ error: 'Payment already in progress' }, { status: 409 })
    }

    console.log(`[payment-locked] Order ${orderId} locked with 'processing' status`)

    // ── Step 7: Fetch user email ──────────────────────────────────────────
    const userResult = (await sql`
      SELECT email FROM users WHERE id = ${userId}
    `) as any[]

    if (!userResult.length) {
      console.error(`[payment-error] User not found: ${userId}`)
      // Unlock order on error
      await sql`UPDATE orders SET status = 'pending' WHERE id = ${orderId}`
      return NextResponse.json({ error: 'User not found' }, { status: 400 })
    }

    const userEmail = userResult[0].email

    // ── Step 8: Create Stripe checkout session ────────────────────────────
    // IMPORTANT: Amount comes from DB, NOT frontend
    const amountInCents = order.amount // Already stored in cents in DB

    console.log(`[payment-stripe] Creating session for order ${orderId}, amount=${amountInCents} cents`)

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: userEmail,
      line_items: [
        {
          price_data: {
            currency: order.currency.toLowerCase(),
            product_data: {
              name: order.product_name,
              description: `Order ${orderId} - ${order.product_name}`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/order-tracking/${orderId}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/order/${orderId}`,
      metadata: {
        orderId,
        userId,
        // DO NOT include amount in metadata - it's only for reference in logs
      },
    })

    console.log(`[payment-session-created] Stripe session=${session.id} for order=${orderId}`)

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    const err = error as Error
    console.error(`[payment-error] ${err.message}`)
    
    // Try to unlock the order on error
    try {
      const body = await req.json()
      if (body.orderId) {
        await sql`UPDATE orders SET status = 'pending' WHERE id = ${body.orderId} AND status = 'processing'`
        console.log(`[payment-unlock] Order ${body.orderId} unlocked after error`)
      }
    } catch {
      // Ignore unlock errors
    }

    return NextResponse.json(
      { error: 'Failed to create payment session' },
      { status: 500 }
    )
  }
}
