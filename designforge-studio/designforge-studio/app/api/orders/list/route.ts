import { NextRequest } from 'next/server'
import { apiSuccess, apiError } from '@/lib/utils'
import { ensureDBInitialized } from '@/lib/db-init'
import { sql } from '@/lib/db'
import { verifyToken, extractTokenFromCookies } from '@/lib/jwt'
import { getCache, setCache, deleteCache } from '@/lib/cache'
import { checkRateLimit } from '@/lib/rate-limit-redis'

/**
 * GET /api/orders/list
 * Fetch orders for a user (dashboard)
 * Query params: status, limit, offset
 * 
 * Features:
 * - Rate limited: 30 requests/minute per IP
 * - Cached: Results cached for 5 minutes (60 second cache for dynamic lists)
 * - Authentication: Requires valid JWT token
 */
export async function GET(req: NextRequest) {
  try {
    // ── Rate limiting ─────────────────────────────────────────────────
    const rateLimitCheck = await checkRateLimit(req, 'orders')
    if (!rateLimitCheck.allowed) {
      return apiError(rateLimitCheck.message || 'Rate limit exceeded', 429, {
        'X-RateLimit-Remaining': String(rateLimitCheck.remaining),
        'X-RateLimit-Reset': String(Math.ceil(rateLimitCheck.resetTime / 1000)),
      })
    }

    await ensureDBInitialized()

    // ── Authenticate user via JWT from cookies ────────────────────────
    const token = extractTokenFromCookies(req.headers.get('cookie'))
    if (!token) {
      return apiError('Authentication required', 401)
    }

    const payload = verifyToken(token)
    if (!payload) {
      return apiError('Invalid or expired token', 401)
    }

    const userId = payload.userId

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const limit = Math.min(50, Number(searchParams.get('limit')) || 10)
    const offset = Math.max(0, Number(searchParams.get('offset')) || 0)

    // ── Check cache for this query ────────────────────────────────────
    const cacheKey = `orders:user:${userId}:status:${status || 'all'}:limit:${limit}:offset:${offset}`
    const cachedOrders = await getCache<any>(cacheKey)
    
    if (cachedOrders) {
      console.log(`[cache-hit] Orders list for user ${userId}`)
      return apiSuccess(cachedOrders, 200)
    }

    // Build where clause
    let whereClause = sql`WHERE user_id = ${userId}`

    if (status && ['pending', 'progress', 'completed', 'cancelled'].includes(status)) {
      whereClause = sql`WHERE user_id = ${userId} AND status = ${status}`
    }

    // Get total count
    const countResult = (await sql`
      SELECT COUNT(*) as total FROM orders ${whereClause}
    `) as any[]

    const total = countResult && countResult.length > 0 ? Number(countResult[0].total) : 0

    // Get paginated orders
    const orders = (await sql`
      SELECT 
        id, 
        product_name, 
        product_id, 
        category, 
        amount, 
        status, 
        details,
        created_at
      FROM orders ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as any[]

    const responseData = {
      orders: (orders || []).map(o => ({
        id: o.id,
        productName: o.product_name,
        productId: o.product_id,
        category: o.category,
        amount: o.amount,
        status: o.status,
        createdAt: o.created_at,
        details: o.details,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    }

    // ── Cache the results for 60 seconds ──────────────────────────────
    await setCache(cacheKey, responseData, 60)
    console.log(`[cache-set] Orders list for user ${userId}`)

    return apiSuccess(responseData)
  } catch (error) {
    console.error('Fetch orders error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch orders'
    return apiError(message, 500)
  }
}
