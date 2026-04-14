import { NextRequest } from 'next/server'
import { apiSuccess, apiError, sanitizeString } from '@/lib/utils'
import { ensureDBInitialized } from '@/lib/db-init'
import { sql } from '@/lib/db'
import { verifyToken, extractTokenFromCookies } from '@/lib/jwt'
import { deleteCache } from '@/lib/cache'
import { checkRateLimit } from '@/lib/rate-limit-redis'

/**
 * POST /api/orders/create
 * Create a new order from Forge design
 * 
 * Rate limited: 30 requests/minute per IP
 * Clears cache on successful order creation
 */
export async function POST(req: NextRequest) {
  // ── Rate limiting (orders: 30 req/min) ────────────────────────────
  const rateLimitCheck = await checkRateLimit(req, 'orders')
  if (!rateLimitCheck.allowed) {
    return apiError(rateLimitCheck.message || 'Rate limit exceeded', 429, {
      'X-RateLimit-Remaining': String(rateLimitCheck.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rateLimitCheck.resetTime / 1000)),
    })
  }

  try {
    await ensureDBInitialized()

    // ── Authenticate user via JWT from cookies ────────────────────────
    const token = extractTokenFromCookies(req.headers.get('cookie'))
    if (!token) {
      return apiError('Authentication required. Login to create orders.', 401)
    }

    const payload = verifyToken(token)
    if (!payload) {
      return apiError('Invalid or expired token', 401)
    }

    const userId = payload.userId

    const body = await req.json()
    const {
      productId,
      productName,
      category,
      textContent,
      primaryColor,
      fontFamily,
      fontSize,
      size,
      addons,
      notes,
      amount, // optional - default to 29.00 (in cents: 2900)
    } = body

    // ── Validate input ────────────────────────────────────────────────
    if (!productId || !productName) {
      return apiError('Product ID and name required', 400)
    }

    // Validate user exists
    const userResult = (await sql`
      SELECT id FROM users WHERE id = ${userId}
    `) as any[]
    if (!userResult || userResult.length === 0) {
      return apiError('Invalid user', 401)
    }

    // ── Prepare order data ────────────────────────────────────────────
    const orderAmount = amount || 2900 // Default: $29.00 in cents
    
    // Validate amount is positive
    if (orderAmount < 0) {
      return apiError('Order amount must be positive', 400)
    }
    
    const sanitizedCategory = sanitizeString(category, 50) || 'general'
    const sanitizedNotes = sanitizeString(notes, 5000) || ''

    // Store all design details as JSONB
    const designDetails = {
      textContent: sanitizeString(textContent, 1000),
      primaryColor,
      fontFamily,
      fontSize: typeof fontSize === 'number' ? fontSize : 24,
      size: sanitizeString(size, 100),
      addons: Array.isArray(addons) ? addons : [],
      notes: sanitizedNotes,
    }

    // ── Insert order into database ────────────────────────────────────
    const result = (await sql`
      INSERT INTO orders (
        user_id,
        product_name,
        product_id,
        category,
        amount,
        status,
        details
      ) VALUES (
        ${userId},
        ${sanitizeString(productName, 100)},
        ${sanitizeString(productId, 50)},
        ${sanitizedCategory},
        ${orderAmount},
        'pending',
        ${JSON.stringify(designDetails)}
      )
      RETURNING id, user_id, product_name, product_id, category, amount, status, created_at
    `) as any[]

    if (!result || result.length === 0) {
      return apiError('Failed to create order', 500)
    }

    const order = result[0]

    // ── Clear cache for this user's orders (any status filter) ────────
    // Cache keys to invalidate: orders:user:{userId}:status:{status}:*
    const cachePatterns = [
      `orders:user:${userId}:status:all:`,
      `orders:user:${userId}:status:pending:`,
      `orders:user:${userId}:status:progress:`,
      `orders:user:${userId}:status:completed:`,
      `orders:user:${userId}:status:cancelled:`,
    ]
    
    for (const pattern of cachePatterns) {
      // Delete common cache key variations
      for (let limit = 10; limit <= 50; limit += 10) {
        for (let offset = 0; offset < 50; offset += 10) {
          await deleteCache(`${pattern}limit:${limit}:offset:${offset}`)
        }
      }
    }
    console.log(`[cache-clear] Invalidated orders list cache for user ${userId}`)

    return apiSuccess(
      {
        orderId: order.id,
        order: {
          id: order.id,
          productName: order.product_name,
          productId: order.product_id,
          amount: order.amount,
          status: order.status,
          createdAt: order.created_at,
        },
        message: 'Order created successfully. Proceed to payment.',
      },
      201
    )
  } catch (error) {
    console.error('Order creation error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create order'
    return apiError(message, 500)
  }
}
