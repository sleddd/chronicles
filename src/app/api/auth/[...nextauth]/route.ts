import NextAuth from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth/authOptions';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rateLimit';

const nextAuthHandler = NextAuth(authOptions);

// Wrap POST handler with rate limiting for login attempts
async function rateLimitedPost(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  const params = await context.params;
  const action = params.nextauth?.join('/');

  // Only rate limit the callback/credentials endpoint (actual login)
  if (action === 'callback/credentials') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const rateLimit = checkRateLimit(`login:${ip}`, RATE_LIMITS.login);

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
          },
        }
      );
    }
  }

  // Use proper type for Next.js route handlers
  return nextAuthHandler(request as unknown as Request, context as unknown as { params: Record<string, string> });
}

export { nextAuthHandler as GET, rateLimitedPost as POST };
