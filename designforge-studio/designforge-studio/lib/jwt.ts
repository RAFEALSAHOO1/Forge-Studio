import jwt from 'jsonwebtoken'

export interface JWTPayload {
  userId: string
  role: string
  iat?: number
  exp?: number
}

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set. Please add it to .env.local')
}

const TOKEN_EXPIRY = '7d' // 7 days

/**
 * Generate a signed JWT token
 */
export function generateToken(userId: string, role: string = 'user'): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured')
  }

  return jwt.sign(
    {
      userId,
      role,
    },
    JWT_SECRET,
    {
      expiresIn: TOKEN_EXPIRY,
      algorithm: 'HS256',
      issuer: 'designforge-studio',
    }
  )
}

/**
 * Verify a JWT token and return the payload
 */
export function verifyToken(token: string): JWTPayload | null {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not configured')
    return null
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as JWTPayload

    return decoded
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.log('Token expired:', error.message)
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.log('Invalid token:', error.message)
    } else {
      console.error('Token verification error:', error)
    }
    return null
  }
}

/**
 * Extract token from Authorization header (Bearer token)
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null
  }
  return parts[1]
}

/**
 * Extract token from cookies
 */
export function extractTokenFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, value] = cookie.trim().split('=')
    acc[name] = decodeURIComponent(value)
    return acc
  }, {} as Record<string, string>)

  return cookies['auth-token'] || null
}
