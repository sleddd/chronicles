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

  it('requires Trusted Types on pages, but not on script files (the service worker loads Workbox with importScripts)', () => {
    const page = createMockRes() as any;
    securityHeaders({ path: '/journal' } as any, page, vi.fn());
    expect(page.headers['Content-Security-Policy']).toContain("require-trusted-types-for 'script'");
    expect(page.headers['Content-Security-Policy']).toContain('trusted-types default dompurify');
    for (const path of ['/sw.js', '/workbox-2fbc6a65.js', '/assets/index-abc.js']) {
      const js = createMockRes() as any;
      securityHeaders({ path } as any, js, vi.fn());
      expect(js.headers['Content-Security-Policy']).not.toContain('trusted-types');
    }
  });

  it('keeps API responses out of the browser cache, but not the app shell', () => {
    const api = createMockRes() as any;
    securityHeaders({ path: '/api/auth/me' } as any, api, vi.fn());
    expect(api.headers['Cache-Control']).toBe('no-store');

    const page = createMockRes() as any;
    securityHeaders({ path: '/journal' } as any, page, vi.fn());
    expect(page.headers['Cache-Control']).toBeUndefined();
  });

  it('allows Bedrock per region host, never every amazonaws.com host (e.g. S3 buckets)', () => {
    const res = createMockRes() as any;
    securityHeaders({} as any, res, vi.fn());
    const csp: string = res.headers['Content-Security-Policy'];

    expect(csp).not.toContain('*.amazonaws.com');
    expect(csp).toContain('https://bedrock-runtime.us-east-1.amazonaws.com');
    expect(csp).toContain('https://bedrock.eu-west-1.amazonaws.com');
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

describe('server config helpers', () => {
  it('CORS: CLIENT_URL when set, the Vite origin only in development, else none (fail closed)', async () => {
    const { corsOriginFor } = await import('../middleware/security.js');
    expect(corsOriginFor({ CLIENT_URL: 'https://app.example.com', NODE_ENV: 'production' })).toBe('https://app.example.com');
    expect(corsOriginFor({ NODE_ENV: 'development' })).toBe('http://localhost:5173');
    expect(corsOriginFor({ NODE_ENV: 'production' })).toBe(false);
    expect(corsOriginFor({})).toBe(false);
  });

  it('trust proxy: one hop everywhere but development unless TRUST_PROXY says otherwise', async () => {
    const { trustProxySetting } = await import('../middleware/security.js');
    expect(trustProxySetting({ NODE_ENV: 'production' })).toBe(1);
    expect(trustProxySetting({ NODE_ENV: 'staging' })).toBe(1);
    expect(trustProxySetting({})).toBe(1);
    expect(trustProxySetting({ NODE_ENV: 'development' })).toBeUndefined();
    expect(trustProxySetting({ NODE_ENV: 'production', TRUST_PROXY: '0' })).toBeUndefined();
    expect(trustProxySetting({ NODE_ENV: 'production', TRUST_PROXY: 'false' })).toBeUndefined();
    expect(trustProxySetting({ NODE_ENV: 'development', TRUST_PROXY: '2' })).toBe(2);
    expect(trustProxySetting({ TRUST_PROXY: 'loopback' })).toBe('loopback');
  });
});
