import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { apiSuccess, apiError, sanitizeString } from '@/lib/utils'
import { getCache, setCache, deleteCache } from '@/lib/cache'
import { checkRateLimit } from '@/lib/rate-limit-redis'

// ─── Design interface ────────────────────────────────────────────────────────
interface Design {
  id: number
  user_id: string
  product_id: string
  product_name: string
  text_content: string | null
  primary_color: string
  font_family: string
  font_size: number
  size: string
  addons: string[]
  notes: string | null
  status: 'draft' | 'ordered' | 'delivered'
  created_at: string
  updated_at: string
}

// ─── POST /api/designs — create a new design ─────────────────────────────────
/**
 * Rate limited: 30 requests/minute per IP
 * Clears cache for designs list on successful creation
 */
export async function POST(req: NextRequest) {
  // ── Rate limiting ─────────────────────────────────────────────────
  const rateLimitCheck = await checkRateLimit(req, 'api')
  if (!rateLimitCheck.allowed) {
    return apiError(rateLimitCheck.message || 'Rate limit exceeded', 429, {
      'X-RateLimit-Remaining': String(rateLimitCheck.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rateLimitCheck.resetTime / 1000)),
    })
  }

  try {
    const body = await req.json()

    const design = {
      user_id: sanitizeString(body.userId) || 'anonymous',
      product_id: sanitizeString(body.productId, 100),
      product_name: sanitizeString(body.productName, 200),
      text_content: sanitizeString(body.textContent, 1000) || null,
      primary_color: /^#[0-9a-fA-F]{3,6}$/.test(body.primaryColor) ? body.primaryColor : '#89AACC',
      font_family: sanitizeString(body.fontFamily, 100) || 'Inter',
      font_size: Math.min(Math.max(Number(body.fontSize) || 48, 8), 200),
      size: sanitizeString(body.size, 50) || 'A4',
      addons: Array.isArray(body.addons) ? body.addons.map((a: unknown) => sanitizeString(a as string, 50)) : [],
      notes: sanitizeString(body.notes, 2000) || null,
      status: 'draft' as const,
    }

    const result = await sql`
      INSERT INTO designs (
        user_id, product_id, product_name, text_content, primary_color,
        font_family, font_size, size, addons, notes, status
      ) VALUES (
        ${design.user_id}, ${design.product_id}, ${design.product_name}, ${design.text_content},
        ${design.primary_color}, ${design.font_family}, ${design.font_size}, ${design.size},
        ${JSON.stringify(design.addons)}, ${design.notes}, ${design.status}
      )
      RETURNING *
    `

    const createdDesign = (result as any[])[0]

    // ── Clear cache for designs list ──────────────────────────────────
    await deleteCache(`designs:list:all`)
    await deleteCache(`designs:list:draft`)
    console.log(`[cache-clear] Invalidated designs list cache`)

    return apiSuccess({ design: createdDesign }, 201)
  } catch (error) {
    console.error('Create design error:', error)
    return apiError('Failed to create design. Please try again.', 500)
  }
}

// ─── GET /api/designs — list designs (cached) ────────────────────────────────
/**
 * Cached responses (60 seconds)
 * Rate limited: 100 requests/minute per IP (api type)
 */
export async function GET(req: NextRequest) {
  // ── Rate limiting ─────────────────────────────────────────────────
  const rateLimitCheck = await checkRateLimit(req, 'api')
  if (!rateLimitCheck.allowed) {
    return apiError(rateLimitCheck.message || 'Rate limit exceeded', 429, {
      'X-RateLimit-Remaining': String(rateLimitCheck.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rateLimitCheck.resetTime / 1000)),
    })
  }

  try {
    const { searchParams } = new URL(req.url)
    const userId = sanitizeString(searchParams.get('userId') ?? '')
    const status = searchParams.get('status')
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(50, Number(searchParams.get('limit')) || 10)
    const offset = (page - 1) * limit

    // ── Check cache first ─────────────────────────────────────────────
    const cacheKey = `designs:${userId || 'all'}:${status || 'all'}:page:${page}:limit:${limit}`
    const cachedDesigns = await getCache<any>(cacheKey)
    
    if (cachedDesigns) {
      console.log(`[cache-hit] Designs list (userId: ${userId || 'all'}, status: ${status || 'all'})`)
      return apiSuccess(cachedDesigns)
    }

    let whereClause = sql``
    const params: any[] = []

    if (userId) {
      whereClause = sql`WHERE user_id = ${userId}`
    }

    if (status && ['draft', 'ordered', 'delivered'].includes(status)) {
      whereClause = userId
        ? sql`${whereClause} AND status = ${status}`
        : sql`WHERE status = ${status}`
    }

    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as total FROM designs ${whereClause}
    `
    const total = Number((countResult as any[])[0].total)

    // Get paginated results
    const designs = await sql`
      SELECT * FROM designs ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const responseData = {
      designs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }

    // ── Cache the results for 60 seconds ──────────────────────────────
    await setCache(cacheKey, responseData, 60)
    console.log(`[cache-set] Designs list (userId: ${userId || 'all'}, status: ${status || 'all'})`)

    return apiSuccess(responseData)
  } catch (error) {
    console.error('List designs error:', error)
    return apiError('Failed to fetch designs', 500)
  }
}
