import { NextRequest } from 'next/server'
import { incrementCounter, isIPBlocked, blockIP } from './cache'

/**
 * Advanced rate limiter using Redis
 * Tracks requests per IP and applies different limits per route type
 */

interface RateLimitOptions {
  maxRequests: number      // Max requests allowed
  windowSeconds: number    // Time window in seconds
  blockDurationSeconds?: number  // How long to block IP (default: 900 = 15 min)
}

// Rate limit configurations for different route types
const rateLimitConfig = {
  auth: { maxRequests: 10, windowSeconds: 60 },        // 10 req/min
  payment: { maxRequests: 5, windowSeconds: 60 },      // 5 req/min
  general: { maxRequests: 60, windowSeconds: 60 },     // 60 req/min
  api: { maxRequests: 100, windowSeconds: 60 },        // 100 req/min
  orders: { maxRequests: 30, windowSeconds: 60 },      // 30 req/min
}

/**
 * Get client IP from request headers
 * Handles various proxy headers (Vercel, Cloudflare, standard X-Forwarded-For)
 */
export function getClientIP(req: NextRequest | { headers: Headers }): string {
  const headers = req instanceof NextRequest ? req.headers : req.headers;
  
  // Try different headers in priority order
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  const cloudflare = headers.get('cf-connecting-ip')
  if (cloudflare) return cloudflare
  
  const vercel = headers.get('x-real-ip')
  if (vercel) return vercel
  
  return 'unknown'
}

/**
 * Apply rate limiting to a request
 * Returns { allowed: boolean, remaining: number, resetTime: number }
 */
export async function checkRateLimit(
  req: NextRequest | { headers: Headers },
  routeType: keyof typeof rateLimitConfig = 'general'
): Promise<{
  allowed: boolean
  remaining: number
  resetTime: number
  message?: string
}> {
  const ip = getClientIP(req)
  
  // Check if IP is blocked
  const blocked = await isIPBlocked(ip)
  if (blocked) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: Date.now() + 900000, // 15 minutes
      message: 'IP is temporarily blocked due to abuse',
    }
  }

  const config = rateLimitConfig[routeType]
  const key = `rate-limit:${routeType}:${ip}`

  try {
    const requestCount = await incrementCounter(key, config.windowSeconds)
    const remaining = Math.max(0, config.maxRequests - requestCount)
    const resetTime = Date.now() + (config.windowSeconds * 1000)

    // Log suspicious activity
    if (requestCount === 1) {
      console.log(`[rate-limit] New window for ${routeType}/${ip}`)
    }

    // If exceeded, count abuse attempts
    if (requestCount > config.maxRequests) {
      const abuseKey = `abuse-count:${ip}`
      const abuseCount = await incrementCounter(abuseKey, 3600) // 1 hour window

      console.warn(`[rate-limit-violation] ${ip} exceeded ${routeType} limit (request #${requestCount}, abuse count: ${abuseCount})`)

      // Block IP after 3 violations
      if (abuseCount >= 3) {
        console.error(`[rate-limit-block] Blocking IP ${ip} after ${abuseCount} violations`)
        await blockIP(ip, 3600) // Block for 1 hour
        
        return {
          allowed: false,
          remaining: 0,
          resetTime: Date.now() + 3600000,
          message: 'IP blocked due to repeated rate limit violations',
        }
      }

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        message: `Rate limit exceeded for ${routeType}. Limit: ${config.maxRequests} requests per ${config.windowSeconds} seconds.`,
      }
    }

    return {
      allowed: true,
      remaining,
      resetTime,
    }
  } catch (error) {
    const err = error as Error
    console.error(`[rate-limit-error] Failed to check rate limit for ${ip}: ${err.message}`)
    
    // On error, allow request but log it
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: Date.now() + (config.windowSeconds * 1000),
    }
  }
}

/**
 * Middleware to enforce rate limiting
 * Returns NextResponse with 429 if limit exceeded
 */
export async function rateLimitMiddleware(
  req: NextRequest,
  routeType: keyof typeof rateLimitConfig = 'general'
) {
  const result = await checkRateLimit(req, routeType)

  return {
    allowed: result.allowed,
    status: result.allowed ? 200 : 429,
    headers: {
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000)),
      'X-RateLimit-Limit': String(rateLimitConfig[routeType].maxRequests),
    },
    message: result.message,
  }
}

/**
 * List of common abuse patterns to detect
 */
const abusePatterns = {
  sqlInjection: /('|"|;|--|\/\*|\*\/|xp_|sp_|exec|execute|select|union|drop|insert|update|delete)/gi,
  pathTraversal: /(\.\.|\/\/|\\\\|\.\/|\/\.)/g,
  scriptInjection: /(<script|onclick|onerror|onload|javascript:)/gi,
}

/**
 * Check if request looks like an abuse attempt
 */
export function detectAbuse(
  requestBody?: string,
  routeType: keyof typeof rateLimitConfig = 'general'
): boolean {
  if (!requestBody) return false

  const bodyStr = requestBody.toLowerCase()

  for (const [patternName, pattern] of Object.entries(abusePatterns)) {
    if (pattern.test(bodyStr)) {
      console.warn(`[abuse-detection] Detected ${patternName} in request body`)
      return true
    }
  }

  return false
}

/**
 * Get rate limit config for a specific route type
 */
export function getRateLimitConfig(routeType: keyof typeof rateLimitConfig) {
  return rateLimitConfig[routeType]
}

// Export config for reference
export { rateLimitConfig }
