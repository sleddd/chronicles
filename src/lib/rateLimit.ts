// Simple in-memory rate limiter for API routes
// For production, consider using Redis or a similar solution

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 60 }
): RateLimitResult {
  const now = Date.now();
  const key = identifier;

  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // Create new entry or reset expired one
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(key, entry);

    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetAt: entry.resetAt,
    };
  }

  // Increment count
  entry.count++;

  if (entry.count > config.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// Rate limit configurations for different endpoints
export const RATE_LIMITS = {
  // Auth endpoints - stricter limits (increased for dev/testing)
  login: { windowMs: 60000, maxRequests: 20 }, // 20 attempts per 1 minute (dev-friendly)
  register: { windowMs: 3600000, maxRequests: 10 }, // 10 registrations per hour per IP

  // API endpoints - standard limits
  api: { windowMs: 60000, maxRequests: 100 }, // 100 requests per minute

  // Search endpoints - more lenient
  search: { windowMs: 60000, maxRequests: 30 }, // 30 searches per minute

  // Share endpoints - very strict
  share: { windowMs: 3600000, maxRequests: 10 }, // 10 share creations per hour
};
