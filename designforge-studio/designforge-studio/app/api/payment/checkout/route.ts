import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { sql } from '@/lib/db'
import { verifyToken, extractTokenFromCookies } from '@/lib/jwt'
import { ensureDBInitialized } from '@/lib/db-init'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit-redis'

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
 * ✅ Rate limited: 5 requests/minute per IP
 */
export async function POST(req: NextRequest) {
  // ── Rate limiting (payment: 5 req/min) ────────────────────────────
  const rateLimitCheck = await checkRateLimit(req, 'payment')
  if (!rateLimitCheck.allowed) {
    return NextResponse.json(
      { error: rateLimitCheck.message || 'Too many payment requests' },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Remaining': String(rateLimitCheck.remaining),
          'X-RateLimit-Reset': String(Math.ceil(rateLimitCheck.resetTime / 1000)),
        },
      }
    )
  }

  let orderId: number | null = null

  try {
    await ensureDBInitialized()

    // ── Step 1: Authenticate user via JWT ─────────────────────────────────
    const token = extractTokenFromCookies(req.headers.get('cookie'))
    if (!token) {
      const ip = getClientIP(req)
      console.warn(`[payment] Unauthorized checkout attempt from ${ip}`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload) {
      const ip = getClientIP(req)
      console.warn(`[payment] Invalid token in checkout attempt from ${ip}`)
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const userId = payload.userId

    // ── Step 2: Validate request body ─────────────────────────────────────
    try {
      const body = await req.json()
      orderId = body.orderId
    } catch (parseError) {
      console.warn(`[payment] Invalid JSON in request`)
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

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
    const amountInCents = parseInt(String(order.amount), 10)
    
    // Validate amount
    if (!amountInCents || amountInCents <= 0) {
      console.error(`[payment-error] Invalid amount: ${order.amount}`)
      await sql`UPDATE orders SET status = 'pending' WHERE id = ${orderId}`
      return NextResponse.json({ error: 'Invalid order amount' }, { status: 400 })
    }

    const currency = String(order.currency).toLowerCase()
    if (!currency || currency.length !== 3) {
      console.error(`[payment-error] Invalid currency: ${order.currency}`)
      await sql`UPDATE orders SET status = 'pending' WHERE id = ${orderId}`
      return NextResponse.json({ error: 'Invalid currency' }, { status: 400 })
    }

    const productName = String(order.product_name || 'Product')
    
    if (!userEmail || !userEmail.includes('@')) {
      console.error(`[payment-error] Invalid email: ${userEmail}`)
      await sql`UPDATE orders SET status = 'pending' WHERE id = ${orderId}`
      return NextResponse.json({ error: 'Invalid customer email' }, { status: 400 })
    }

    console.log(`[payment-stripe] Creating session for order ${orderId}, amount=${amountInCents} cents, currency=${currency}, email=${userEmail}`)

    let session
    
    // For testing/development, generate a mock session if Stripe is not properly configured
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      console.warn(`[payment-mock] Using mock Stripe session for development`)
      const mockSessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      return NextResponse.json({ 
        sessionId: mockSessionId, 
        url: `https://checkout.stripe.com/pay/${mockSessionId}` 
      })
    }

    try {
      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: currency,
              product_data: {
                name: productName,
                description: `Order ${orderId}`,
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/order-tracking/${orderId}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/order/${orderId}`,
        metadata: {
          orderId: String(orderId),
          userId: String(userId),
        },
      })
    } catch (stripeErr) {
      const se = stripeErr as Error
      console.error(`[payment-stripe-error] Stripe API failed: ${se.message}`, se)
      
      // In development, return a mock session instead of failing
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[payment-fallback] Returning mock session due to Stripe error`)
        const mockSessionId = `cs_test_fallback_${orderId}_${Date.now()}`
        return NextResponse.json({ 
          sessionId: mockSessionId, 
          url: `https://checkout.stripe.com/pay/${mockSessionId}` 
        })
      }
      
      throw new Error(`Stripe API error: ${se.message}`)
    }

    console.log(`[payment-session-created] Stripe session=${session.id} for order=${orderId}`)

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    const err = error as Error
    console.error(`[payment-error] Failed to create session: ${err.message}`, err)
    
    // Try to unlock the order on error (orderId is captured from request scope)
    if (typeof orderId === 'number' && orderId > 0) {
      try {
        await sql`UPDATE orders SET status = 'pending' WHERE id = ${orderId} AND status = 'processing'`
        console.log(`[payment-unlock] Order ${orderId} unlocked after error`)
      } catch (unlockErr) {
        const ue = unlockErr as Error
        console.error(`[payment-unlock-failed] Could not unlock order ${orderId}: ${ue.message}`)
      }
    }

    return NextResponse.json(
      { error: 'Failed to create payment session', details: process.env.NODE_ENV === 'development' ? err.message : undefined },
      { status: 500 }
    )
  }
}
