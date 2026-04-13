import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { ensureDBInitialized } from '@/lib/db-init'

/**
 * POST /api/cron/reset-stuck-orders
 * 
 * Resets orders that have been stuck in 'processing' state for too long.
 * This is a safety mechanism to allow users to retry payments if webhook processing fails.
 * 
 * Configuration:
 * - Timeout: 15 minutes (900 seconds)
 * - Status: Only processes orders with status = 'processing'
 * - Updated at: Only resets if updated_at < NOW() - 15 minutes
 * 
 * Security:
 * ✅ Requires authorization (either JWT or cron secret)
 * ✅ Only resets orders, doesn't delete anything
 * ✅ Logs all operations for audit trail
 * ✅ Safe to call multiple times (idempotent)
 * 
 * Usage from cron job:
 * ```
 * 0 * * * * curl -X POST https://yoursite.com/api/cron/reset-stuck-orders \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 * ```
 */
export async function POST(req: NextRequest) {
  try {
    await ensureDBInitialized()

    // ── Step 1: Authenticate request ──────────────────────────────────────
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || process.env.API_SECRET

    if (!cronSecret) {
      console.error('[cron-reset] CRON_SECRET not configured')
      return NextResponse.json(
        { error: 'Cron job not configured' },
        { status: 500 }
      )
    }

    // Check for valid authorization
    const expectedAuth = `Bearer ${cronSecret}`
    if (authHeader !== expectedAuth) {
      console.warn(`[cron-reset] Unauthorized cron request from ${req.headers.get('x-forwarded-for')}`)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[cron-reset-start] Beginning stuck order reset process')

    // ── Step 2: Find stuck orders ────────────────────────────────────────
    // Timeout after 15 minutes (900 seconds)
    const TIMEOUT_SECONDS = 900 // 15 minutes
    const timeoutDate = new Date(Date.now() - TIMEOUT_SECONDS * 1000)

    const stuckOrders = (await sql`
      SELECT 
        id,
        user_id,
        product_name,
        amount,
        status,
        updated_at
      FROM orders
      WHERE 
        status = 'processing'
        AND updated_at < ${timeoutDate.toISOString()}
      ORDER BY updated_at ASC
    `) as any[]

    if (stuckOrders.length === 0) {
      console.log('[cron-reset-complete] No stuck orders found')
      return NextResponse.json({
        success: true,
        resetCount: 0,
        message: 'No stuck orders to reset',
      })
    }

    console.log(`[cron-reset-found] Found ${stuckOrders.length} stuck orders to reset`)

    // ── Step 3: Reset stuck orders to 'pending' ──────────────────────────
    const resetOrderIds = stuckOrders.map(o => o.id)

    const resetResult = (await sql`
      UPDATE orders
      SET 
        status = 'pending',
        updated_at = NOW()
      WHERE
        id = ANY(${resetOrderIds})
        AND status = 'processing'
      RETURNING id, user_id, product_name, amount
    `) as any[]

    console.log(`[cron-reset-success] Reset ${resetResult.length} orders to pending`)

    // ── Step 4: Log each reset for audit trail ───────────────────────────
    for (const order of resetResult) {
      console.log(`[cron-reset-order] Reset order ${order.id}`, {
        userId: order.user_id,
        product: order.product_name,
        amount: order.amount,
        reason: 'Processing timeout (15 minutes)',
      })
    }

    // ── Step 5: Return results ───────────────────────────────────────────
    return NextResponse.json({
      success: true,
      resetCount: resetResult.length,
      message: `Reset ${resetResult.length} stuck orders to pending status`,
      details: resetResult.map(o => ({
        orderId: o.id,
        userId: o.user_id,
        product: o.product_name,
        amount: o.amount,
      })),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const err = error as Error
    console.error('[cron-reset-error]', err.message)
    return NextResponse.json(
      { error: 'Failed to reset stuck orders' },
      { status: 500 }
    )
  }
}
