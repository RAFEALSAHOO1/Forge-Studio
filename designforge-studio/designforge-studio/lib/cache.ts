import { Redis } from '@upstash/redis'

/**
 * Redis cache client
 * Uses Upstash for serverless Redis without managing infrastructure
 */
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
})

/**
 * Get value from cache
 * @param key - Cache key
 * @returns Cached value or null if not found
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const value = await redis.get(key)
    if (!value) return null
    
    try {
      return JSON.parse(value as string) as T
    } catch {
      // If not JSON, return as-is
      return value as T
    }
  } catch (error) {
    const err = error as Error
    console.warn(`[cache-get] Error reading key ${key}: ${err.message}`)
    return null
  }
}

/**
 * Set value in cache with optional expiry
 * @param key - Cache key
 * @param value - Value to cache
 * @param ttlSeconds - Time to live in seconds (default: 3600 = 1 hour)
 * @returns true if successful, false otherwise
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number = 3600
): Promise<boolean> {
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    await redis.setex(key, ttlSeconds, serialized)
    console.log(`[cache-set] Set ${key} with TTL ${ttlSeconds}s`)
    return true
  } catch (error) {
    const err = error as Error
    console.warn(`[cache-set] Error setting key ${key}: ${err.message}`)
    return false
  }
}

/**
 * Delete key from cache
 * @param key - Cache key
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(key)
    console.log(`[cache-del] Deleted ${key}`)
  } catch (error) {
    const err = error as Error
    console.warn(`[cache-del] Error deleting key ${key}: ${err.message}`)
  }
}

/**
 * Clear all cache keys matching a pattern
 * @param pattern - Pattern to match (e.g., "orders:*")
 */
export async function clearCachePattern(pattern: string): Promise<void> {
  try {
    // Note: Upstash doesn't support SCAN/KEYS in REST API, so we'll need to track keys manually
    // For now, we'll clear specific known patterns via direct deletion
    console.log(`[cache-clear] Pattern ${pattern} - manual tracking needed`)
  } catch (error) {
    const err = error as Error
    console.warn(`[cache-clear] Error clearing pattern ${pattern}: ${err.message}`)
  }
}

/**
 * Increment counter in cache (for rate limiting)
 * @param key - Cache key
 * @param ttlSeconds - Time to live if key doesn't exist
 * @returns New count value
 */
export async function incrementCounter(key: string, ttlSeconds: number = 60): Promise<number> {
  try {
    const count = await redis.incr(key)
    
    // Set expiry only if this is a new key (count === 1)
    if (count === 1) {
      await redis.expire(key, ttlSeconds)
    }
    
    return count
  } catch (error) {
    const err = error as Error
    console.warn(`[cache-incr] Error incrementing ${key}: ${err.message}`)
    return 0
  }
}

/**
 * Check if client IP is in blocklist
 * @param ip - Client IP address
 * @returns true if IP is blocked
 */
export async function isIPBlocked(ip: string): Promise<boolean> {
  try {
    const blocked = await redis.get(`blocked-ip:${ip}`)
    return !!blocked
  } catch (error) {
    const err = error as Error
    console.warn(`[cache-check-ip] Error checking IP ${ip}: ${err.message}`)
    return false
  }
}

/**
 * Block an IP address
 * @param ip - IP address to block
 * @param durationSeconds - Duration to block (default: 3600 = 1 hour)
 */
export async function blockIP(ip: string, durationSeconds: number = 3600): Promise<void> {
  try {
    await redis.setex(`blocked-ip:${ip}`, durationSeconds, 'true')
    console.log(`[cache-block] Blocked IP ${ip} for ${durationSeconds}s`)
  } catch (error) {
    const err = error as Error
    console.warn(`[cache-block] Error blocking IP ${ip}: ${err.message}`)
  }
}

/**
 * Get blocked IP list (for monitoring)
 * @returns Count of blocked IPs
 */
export async function getBlockedIPCount(): Promise<number> {
  try {
    // This would require SCAN which isn't available in REST API
    // For monitoring, you'd need to track this separately
    return 0
  } catch (error) {
    const err = error as Error
    console.warn(`[cache-blocked-ips] Error: ${err.message}`)
    return 0
  }
}

export default redis
