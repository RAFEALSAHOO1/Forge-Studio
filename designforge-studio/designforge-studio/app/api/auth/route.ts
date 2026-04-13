import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, apiSuccess, apiError, sanitizeString, sanitizeEmail } from '@/lib/utils'
import { signup, login } from '@/lib/auth'
import { ensureDBInitialized } from '@/lib/db-init'
import { sql } from '@/lib/db'
import { generateToken, verifyToken, extractTokenFromCookies } from '@/lib/jwt'

// ─── POST /api/auth — signup / login ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const { allowed } = rateLimit(`auth-${ip}`, 10, 60_000)
  if (!allowed) return apiError('Too many auth attempts. Wait 1 minute.', 429)

  try {
    // Ensure database is initialized
    await ensureDBInitialized()

    const body = await req.json()
    const action = body.action // 'login' | 'signup' | 'google'

    if (action === 'google') {
      // In production: verify Google ID token here
      return apiSuccess({
        message: 'Google OAuth — redirect to /api/auth/google/callback',
        redirectUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...',
      })
    }

    // ── SIGNUP ────────────────────────────────────────────────────────────
    if (action === 'signup') {
      const name = sanitizeString(body.name, 100)
      const email = sanitizeEmail(body.email)
      const password = body.password

      if (!name) return apiError('Name is required', 400)
      if (!email) return apiError('Valid email required', 400)
      if (!password) return apiError('Password is required', 400)

      try {
        const user = await signup({ name, email, password })

        // Generate JWT token with 7-day expiry
        const token = generateToken(user.id, user.role)

        // Create response with user data using NextResponse for cookie support
        const response = NextResponse.json(
          {
            success: true,
            data: {
              user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
              },
            },
          },
          { status: 201 }
        )

        // Set HTTP-only cookie with JWT (secure, same-site)
        response.cookies.set({
          name: 'auth-token',
          value: token,
          httpOnly: true, // JavaScript cannot access this cookie
          secure: process.env.NODE_ENV === 'production', // HTTPS only in production
          sameSite: 'lax', // CSRF protection
          maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
          path: '/',
        })

        return response
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Signup failed'
        if (message.includes('already registered')) {
          return apiError('Email already registered', 409)
        }
        if (message.includes('must be at least')) {
          return apiError(message, 400)
        }
        return apiError(message, 400)
      }
    }

    // ── LOGIN ─────────────────────────────────────────────────────────────
    if (action === 'login') {
      const email = sanitizeEmail(body.email)
      const password = body.password

      if (!email) return apiError('Valid email required', 400)
      if (!password) return apiError('Password is required', 400)

      try {
        const user = await login({ email, password })

        // Generate JWT token with 7-day expiry
        const token = generateToken(user.id, user.role)

        // Create response with user data using NextResponse for cookie support
        const response = NextResponse.json(
          {
            success: true,
            data: {
              user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
              },
            },
          }
        )

        // Set HTTP-only cookie with JWT (secure, same-site)
        response.cookies.set({
          name: 'auth-token',
          value: token,
          httpOnly: true, // JavaScript cannot access this cookie
          secure: process.env.NODE_ENV === 'production', // HTTPS only in production
          sameSite: 'lax', // CSRF protection
          maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
          path: '/',
        })

        return response
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login failed'
        return apiError(message, 401)
      }
    }

    return apiError('Invalid action. Use "signup" or "login"', 400)
  } catch (error) {
    console.error('Auth error:', error)
    const message = error instanceof Error ? error.message : 'Authentication failed'
    return apiError(message, 500)
  }
}

// ─── GET /api/auth — verify session ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    // Extract JWT token from HTTP-only cookie
    const token = extractTokenFromCookies(req.headers.get('cookie'))

    if (!token) return apiError('No auth token', 401)

    // Verify JWT signature and expiration
    const payload = verifyToken(token)
    if (!payload) return apiError('Invalid or expired token', 401)

    const userId = payload.userId

    // Ensure database is initialized
    await ensureDBInitialized()

    // Fetch user from database to get fresh data
    const result = (await sql`
      SELECT id, name, email, role, created_at
      FROM users
      WHERE id = ${userId}
    `) as any[]

    if (!result || result.length === 0) {
      return apiError('User not found', 401)
    }

    const user = result[0]
    return apiSuccess({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Session verification error:', error)
    return apiError('Session verification failed', 500)
  }
}

// ─── DELETE /api/auth — logout ───────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const response = NextResponse.json(
      { success: true, message: 'Logged out successfully' }
    )

    // Clear the auth token cookie
    response.cookies.set({
      name: 'auth-token',
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0, // Immediately expire the cookie
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return apiError('Logout failed', 500)
  }
}
