import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGrant, readGrant, revokeGrant, revokeGrantsForSession, revokeGrantsForAccount,
  REMEMBER_MAX_AGE_MS, _clearGrants,
} from '../services/rememberGrants.js';

describe('rememberGrants', async () => {
  beforeEach(async () => { await _clearGrants(); });

  it('returns the same 32-byte secret for the same account and session', async () => {
    const { grantId, secret } = await createGrant(1, 'sel000000001');
    expect(secret).toHaveLength(32);
    const read = await readGrant(grantId, 1, 'sel000000001');
    expect(read?.secret.equals(secret)).toBe(true);
  });

  it('refuses another session, another account or an unknown id', async () => {
    const { grantId } = await createGrant(1, 'sel000000001');
    expect(await readGrant(grantId, 1, 'sel000000002')).toBeNull();
    expect(await readGrant(grantId, 2, 'sel000000001')).toBeNull();
    expect(await readGrant('nope', 1, 'sel000000001')).toBeNull();
    expect(await readGrant(undefined, 1, 'sel000000001')).toBeNull();
  });

  it('expires after the absolute lifetime', async () => {
    const now = Date.now();
    const { grantId } = await createGrant(1, 'sel000000001', now);
    expect(await readGrant(grantId, 1, 'sel000000001', now + REMEMBER_MAX_AGE_MS - 1)).not.toBeNull();
    expect(await readGrant(grantId, 1, 'sel000000001', now + REMEMBER_MAX_AGE_MS)).toBeNull();
  });

  it('keeps one grant per session', async () => {
    const a = await createGrant(1, 'sel000000001');
    const b = await createGrant(1, 'sel000000001');
    expect(await readGrant(a.grantId, 1, 'sel000000001')).toBeNull();
    expect(await readGrant(b.grantId, 1, 'sel000000001')).not.toBeNull();
  });

  it('revokes by id, by session and by account (sparing the current session)', async () => {
    const a = await createGrant(1, 'sel000000001');
    await revokeGrant(a.grantId);
    expect(await readGrant(a.grantId, 1, 'sel000000001')).toBeNull();

    const b = await createGrant(1, 'sel000000002');
    await revokeGrantsForSession('sel000000002');
    expect(await readGrant(b.grantId, 1, 'sel000000002')).toBeNull();

    const c = await createGrant(1, 'sel000000003');
    const d = await createGrant(1, 'sel000000004');
    await revokeGrantsForAccount(1, 'sel000000004');
    expect(await readGrant(c.grantId, 1, 'sel000000003')).toBeNull();
    expect(await readGrant(d.grantId, 1, 'sel000000004')).not.toBeNull();
  });
});
