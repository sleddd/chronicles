import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Security headers for all responses
function addSecurityHeaders(response: NextResponse) {
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );

  return response;
}

export default withAuth(
  function middleware(request: NextRequest) {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    // Protect all routes except public ones
    // Note: Static files (*.png, *.ico, *.svg, etc.) are excluded to allow access on login/register pages
    '/((?!api/auth|api/user/register|api/user/salt|api/user/recover|api/share|share|login|register|forgot-password|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.ico$|.*\\.svg$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$).*)',
  ],
};
