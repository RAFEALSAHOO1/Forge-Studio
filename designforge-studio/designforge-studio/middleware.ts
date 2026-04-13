import { NextRequest, NextResponse } from 'next/server'
import { ensureDBInitialized } from './lib/db-init'
import { verifyToken, extractTokenFromCookies } from './lib/jwt'

// Track if database has been initialized for this process
let dbInitializeAttempted = false

// Simple in-memory rate limiter for middleware
const ipMap = new Map<string, { count: number; ts: number }>()

function checkRateLimit(ip: string, limit = 200, windowMs = 60_000): boolean {
  const now = Date.now()
  const rec = ipMap.get(ip)
  if (!rec || now - rec.ts > windowMs) {
    ipMap.set(ip, { count: 1, ts: now })
    return true
  }
  if (rec.count >= limit) return false
  rec.count++
  return true
}

export function middleware(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'
  const { pathname } = req.nextUrl

  // Initialize database once on first middleware execution
  if (!dbInitializeAttempted) {
    dbInitializeAttempted = true
    // Non-blocking initialization - doesn't delay response
    ensureDBInitialized().catch(err => {
      console.error('Database initialization failed in middleware:', err)
    })
  }

  // ── JWT Validation for protected routes ────────────────────────────────
  const adminRoutes = ['/api/admin/', '/dashboard', '/admin']
  const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route))

  if (isAdminRoute) {
    const token = extractTokenFromCookies(req.headers.get('cookie'))
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      )
    }

    // Check admin role for admin routes
    if (isAdminRoute && payload.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Attach user info to headers for use in route handlers
    const res = NextResponse.next()
    res.headers.set('X-User-ID', payload.userId)
    res.headers.set('X-User-Role', payload.role)
    return res
  }

  // Rate limit API routes more aggressively
  const isApi = pathname.startsWith('/api/')
  const limit = isApi ? 60 : 300
  if (!checkRateLimit(ip + pathname.split('/')[2], limit)) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please wait and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  // ── Security headers ──────────────────────────────────────────────────────
  const res = NextResponse.next()

  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "media-src 'self' https://d8j0ntlcm91z4.cloudfront.net https://stream.mux.com",
      "connect-src 'self' https://www.google-analytics.com",
      "frame-ancestors 'none'",
    ].join('; ')
  )

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
