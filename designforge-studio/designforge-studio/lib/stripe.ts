import Stripe from 'stripe'

/**
 * Initialize Stripe with secret key
 * Never expose STRIPE_SECRET_KEY in frontend
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10',
})

/**
 * Verify Stripe webhook signature
 * @param body - Raw request body (string or buffer)
 * @param signature - Stripe signature header
 * @returns Parsed event if valid, throws error if invalid
 */
export function verifyWebhookSignature(
  body: string | Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
  
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  }

  try {
    return stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    const error = err as Error
    throw new Error(`Webhook verification failed: ${error.message}`)
  }
}
