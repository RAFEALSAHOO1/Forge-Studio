import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/stripe'
import { sql } from '@/lib/db'

/**
 * POST /api/payment/webhook
 * Stripe webhook endpoint to handle payment events
 * Must be configured in Stripe Dashboard → Webhooks
 * 
 * Events to listen for:
 * - checkout.session.completed: Payment successful
 * - charge.refunded: Refund processed
 */
export async function POST(req: NextRequest) {
  try {
    // Get raw body and signature
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    const body = await req.text()

    // Verify webhook signature (critical security step)
    const event = verifyWebhookSignature(body, signature)

    // Handle specific event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any
        await handleCheckoutSessionCompleted(session)
        break
      }
      case 'charge.refunded': {
        const charge = event.data.object as any
        await handleChargeRefunded(charge)
        break
      }
      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`)
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true })
  } catch (error) {
    const err = error as Error
    console.error('[webhook error]', err.message)
    
    // Return 400 for verification errors, 500 for processing errors
    const statusCode = err.message.includes('verification') ? 400 : 500
    return NextResponse.json(
      { error: err.message || 'Webhook processing failed' },
      { status: statusCode }
    )
  }
}

/**
 * Handle checkout.session.completed event
 * Called when a payment is successfully completed
 * Updates order status to 'paid' and stores payment_id
 */
async function handleCheckoutSessionCompleted(session: any) {
  const orderId = session.metadata?.orderId
  const userId = session.metadata?.userId
  const paymentId = session.payment_intent // Stripe payment intent ID

  if (!orderId || !userId) {
    console.warn('[webhook] Missing metadata in checkout session:', session.id)
    return
  }

  try {
    // Update order status to 'paid' and store payment_id
    const result = (await sql`
      UPDATE orders 
      SET status = 'paid', payment_id = ${paymentId}, updated_at = NOW()
      WHERE id = ${orderId} AND user_id = ${userId}
      RETURNING id, status, payment_id
    `) as any[]

    if (result.length > 0) {
      console.log('[webhook] Order marked as paid:', {
        orderId,
        paymentId,
        sessionId: session.id,
      })
      
      // TODO: Send confirmation email, trigger order processing, etc.
    } else {
      console.warn('[webhook] Order not found or user mismatch:', { orderId, userId })
    }
  } catch (error) {
    const err = error as Error
    console.error('[webhook] Failed to update order:', err.message)
    throw error
  }
}

/**
 * Handle charge.refunded event
 * Called when a refund is processed
 * Updates order status to 'refunded'
 */
async function handleChargeRefunded(charge: any) {
  const paymentId = charge.payment_intent

  if (!paymentId) {
    console.warn('[webhook] Missing payment_intent in charge:', charge.id)
    return
  }

  try {
    // Find order by payment_id and mark as refunded
    const result = (await sql`
      UPDATE orders 
      SET status = 'refunded', updated_at = NOW()
      WHERE payment_id = ${paymentId}
      RETURNING id, user_id, status
    `) as any[]

    if (result.length > 0) {
      console.log('[webhook] Order marked as refunded:', {
        orderId: result[0].id,
        chargeId: charge.id,
      })
      
      // TODO: Notify customer of refund, send receipt, etc.
    } else {
      console.warn('[webhook] Order not found for refund:', paymentId)
    }
  } catch (error) {
    const err = error as Error
    console.error('[webhook] Failed to update order for refund:', err.message)
    throw error
  }
}
