import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGrant, readGrant, revokeGrant, revokeGrantsForSession, revokeGrantsForAccount,
  REMEMBER_MAX_AGE_MS, _clearGrants,
} from '../services/rememberGrants.js';

describe('rememberGrants', () => {
  beforeEach(() => _clearGrants());

  it('returns the same 32-byte secret for the same account and session', () => {
    const { grantId, secret } = createGrant(1, 'sel000000001');
    expect(secret).toHaveLength(32);
    const read = readGrant(grantId, 1, 'sel000000001');
    expect(read?.secret.equals(secret)).toBe(true);
  });

  it('refuses another session, another account or an unknown id', () => {
    const { grantId } = createGrant(1, 'sel000000001');
    expect(readGrant(grantId, 1, 'sel000000002')).toBeNull();
    expect(readGrant(grantId, 2, 'sel000000001')).toBeNull();
    expect(readGrant('nope', 1, 'sel000000001')).toBeNull();
    expect(readGrant(undefined, 1, 'sel000000001')).toBeNull();
  });

  it('expires after the absolute lifetime', () => {
    const now = Date.now();
    const { grantId } = createGrant(1, 'sel000000001', now);
    expect(readGrant(grantId, 1, 'sel000000001', now + REMEMBER_MAX_AGE_MS - 1)).not.toBeNull();
    expect(readGrant(grantId, 1, 'sel000000001', now + REMEMBER_MAX_AGE_MS)).toBeNull();
  });

  it('keeps one grant per session', () => {
    const a = createGrant(1, 'sel000000001');
    const b = createGrant(1, 'sel000000001');
    expect(readGrant(a.grantId, 1, 'sel000000001')).toBeNull();
    expect(readGrant(b.grantId, 1, 'sel000000001')).not.toBeNull();
  });

  it('revokes by id, by session and by account (sparing the current session)', () => {
    const a = createGrant(1, 'sel000000001');
    revokeGrant(a.grantId);
    expect(readGrant(a.grantId, 1, 'sel000000001')).toBeNull();

    const b = createGrant(1, 'sel000000002');
    revokeGrantsForSession('sel000000002');
    expect(readGrant(b.grantId, 1, 'sel000000002')).toBeNull();

    const c = createGrant(1, 'sel000000003');
    const d = createGrant(1, 'sel000000004');
    revokeGrantsForAccount(1, 'sel000000004');
    expect(readGrant(c.grantId, 1, 'sel000000003')).toBeNull();
    expect(readGrant(d.grantId, 1, 'sel000000004')).not.toBeNull();
  });
});
