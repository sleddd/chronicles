import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logSecurityEvent } from '../utils/securityLogger.js';

describe('logSecurityEvent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('outputs structured JSON to console.log', () => {
    logSecurityEvent('test_event');

    expect(console.log).toHaveBeenCalledTimes(1);
    const output = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed).toBeDefined();
  });

  it('includes event type in output', () => {
    logSecurityEvent('login_failed');

    const output = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.event).toBe('login_failed');
  });

  it('includes level as "security"', () => {
    logSecurityEvent('some_event');

    const output = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('security');
  });

  it('includes a valid ISO timestamp', () => {
    logSecurityEvent('some_event');

    const output = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.timestamp).toBeDefined();
    // Verify it's a valid ISO string
    const date = new Date(parsed.timestamp);
    expect(date.toISOString()).toBe(parsed.timestamp);
  });

  it('never writes the account id or the IP address, whatever it is given', () => {
    logSecurityEvent('login_success', { accountId: 42, ip: '192.168.1.1' });

    const output = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed).not.toHaveProperty('accountId');
    expect(parsed).not.toHaveProperty('ip');
    expect(output).not.toContain('192.168.1.1');
    expect(parsed.event).toBe('login_success');
  });

  it('drops a detail that names an account, and keeps the rest', () => {
    logSecurityEvent('passkey_verify_failed', { accountId: 7, details: { bucket: '7', accountId: 7, ip: '10.0.0.1', why: 'not verified' } });

    const parsed = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(parsed.details).toEqual({ why: 'not verified' });
  });

  it('includes details when provided', () => {
    logSecurityEvent('suspicious_activity', {
      details: { reason: 'too many attempts', count: 10 },
    });

    const output = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.details).toEqual({ reason: 'too many attempts', count: 10 });
  });

  it('excludes details when not provided', () => {
    logSecurityEvent('some_event');

    const output = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed).not.toHaveProperty('details');
  });

  it('writes the level, event, time and details when all options are provided — never who or where from', () => {
    logSecurityEvent('full_event', {
      accountId: 7,
      ip: '10.0.0.1',
      details: { key: 'value' },
    });

    const output = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('security');
    expect(parsed.event).toBe('full_event');
    expect(parsed.timestamp).toBeDefined();
    expect(Object.keys(parsed).sort()).toEqual(['details', 'event', 'level', 'timestamp']);
    expect(parsed.details).toEqual({ key: 'value' });
  });
});
