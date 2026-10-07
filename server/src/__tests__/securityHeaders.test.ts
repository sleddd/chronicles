import { describe, it, expect, vi } from 'vitest';
import { securityHeaders } from '../middleware/security.js';

function createMockRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
  };
}

describe('securityHeaders middleware', () => {
  it('sets Content-Security-Policy header', () => {
    const req = {} as any;
    const res = createMockRes() as any;
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("default-src 'self'")
    );
    expect(res.headers['Content-Security-Policy']).toContain("script-src 'self'");
    expect(res.headers['Content-Security-Policy']).toContain("style-src 'self' 'unsafe-inline'");
    expect(res.headers['Content-Security-Policy']).toContain("img-src 'self' data: blob:");
    expect(res.headers['Content-Security-Policy']).toContain("connect-src 'self'");
    expect(res.headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['Content-Security-Policy']).toContain("base-uri 'self'");
    expect(res.headers['Content-Security-Policy']).toContain("form-action 'self'");
    expect(res.headers['Content-Security-Policy']).toContain("object-src 'none'");
  });

  it('sets X-Content-Type-Options to nosniff', () => {
    const req = {} as any;
    const res = createMockRes() as any;
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });

  it('sets Strict-Transport-Security with preload', () => {
    const req = {} as any;
    const res = createMockRes() as any;
    const next = vi.fn();

    securityHeaders(req, res, next);

    const hsts = res.headers['Strict-Transport-Security'];
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  it('sets X-Frame-Options to DENY', () => {
    const req = {} as any;
    const res = createMockRes() as any;
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
  });

  it('sets Referrer-Policy to no-referrer', () => {
    const req = {} as any;
    const res = createMockRes() as any;
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
  });

  it('sets Permissions-Policy disabling unnecessary features', () => {
    const req = {} as any;
    const res = createMockRes() as any;
    const next = vi.fn();

    securityHeaders(req, res, next);

    const policy = res.headers['Permissions-Policy'];
    expect(policy).toContain('camera=()');
    // Microphone is limited to our own origin (voice dictation), never third parties
    expect(policy).toContain('microphone=(self)');
    expect(policy).toContain('geolocation=()');
    expect(policy).toContain('payment=()');
    expect(policy).toContain('usb=()');
    expect(policy).toContain('accelerometer=()');
    expect(policy).toContain('gyroscope=()');
    expect(policy).toContain('magnetometer=()');
  });

  it('calls next() after setting headers', () => {
    const req = {} as any;
    const res = createMockRes() as any;
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('sets all expected headers (6 total)', () => {
    const req = {} as any;
    const res = createMockRes() as any;
    const next = vi.fn();

    securityHeaders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledTimes(6);
  });
});
