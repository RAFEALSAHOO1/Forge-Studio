import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { rateLimit } from '@/lib/utils'
import { sql } from '@/lib/db'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const { allowed } = rateLimit(`payment-checkout-${ip}`, 10, 60_000)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  try {
    const { orderId, userId } = await req.json()

    if (!orderId || !userId) {
      return NextResponse.json({ error: 'Missing orderId or userId' }, { status: 400 })
    }

    // Fetch order from database
    const orderResult = (await sql`
      SELECT id, product_name, amount, currency, user_id 
      FROM orders 
      WHERE id = ${orderId} AND user_id = ${userId}
    `) as any[]

    if (!orderResult.length) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const order = orderResult[0]
    const amountInCents = order.amount // Already stored in cents in DB

    // Fetch user email
    const userResult = (await sql`
      SELECT email FROM users WHERE id = ${userId}
    `) as any[]

    if (!userResult.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userEmail = userResult[0].email

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: userEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: order.product_name,
              description: `Order ${orderId}`,
            },
            unit_amount: amountInCents, // Amount in cents
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/order-tracking/${orderId}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/order/${orderId}`,
      metadata: {
        orderId,
        userId,
      },
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    const err = error as Error
    console.error('Payment session creation error:', err.message)
    return NextResponse.json(
      { error: 'Failed to create payment session' },
      { status: 500 }
    )
  }
}
