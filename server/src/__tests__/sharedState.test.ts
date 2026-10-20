import { describe, it, expect } from 'vitest';
import { memoryState, SHARED_STATE_IN_POSTGRES } from '../services/sharedState.js';

// The Postgres store runs the same rules in SQL; loadtest/multi-instance-check.mjs
// checks it across two instances against a real database
describe('shared sign-in state (memory store)', () => {
  it('runs in memory under tests', () => {
    expect(SHARED_STATE_IN_POSTGRES).toBe(false);
  });

  it('counts attempts up to the cap, then refuses until the window ends', async () => {
    const s = memoryState();
    for (let i = 0; i < 3; i++) expect(await s.claim('fail', 'k', 3, 60_000)).toBe(true);
    expect(await s.locked('fail', 'k', 3)).toBe(true);
    expect(await s.claim('fail', 'k', 3, 60_000)).toBe(false);
    await s.clear('fail', 'k');
    expect(await s.locked('fail', 'k', 3)).toBe(false);
    expect(await s.claim('fail', 'k', 3, 60_000)).toBe(true);
  });

  it('forgets a count once its window has passed', async () => {
    const s = memoryState();
    expect(await s.claim('fail', 'k', 1, 1)).toBe(true);
    await new Promise(r => setTimeout(r, 5));
    expect(await s.locked('fail', 'k', 1)).toBe(false);
    expect(await s.claim('fail', 'k', 1, 60_000)).toBe(true);
  });

  it('keeps tokens by hash, per account, until they expire', async () => {
    const s = memoryState();
    await s.putToken('pending', 'tok-a', 7, 60_000);
    await s.putToken('pending', 'tok-b', 7, 60_000);
    await s.putToken('pending', 'tok-c', 8, 1);
    expect(await s.getToken('pending', 'tok-a')).toBe(7);
    expect(await s.getToken('pending', 'nope')).toBeNull();
    await new Promise(r => setTimeout(r, 5));
    expect(await s.getToken('pending', 'tok-c')).toBeNull();
    await s.deleteTokensForAccount('pending', 7);
    expect(await s.getToken('pending', 'tok-b')).toBeNull();
  });

  it('only lets a value move forward (a TOTP step is used once)', async () => {
    const s = memoryState();
    expect(await s.advance('step', '1', 100, 60_000)).toBe(true);
    expect(await s.advance('step', '1', 100, 60_000)).toBe(false);
    expect(await s.advance('step', '1', 99, 60_000)).toBe(false);
    expect(await s.advance('step', '1', 101, 60_000)).toBe(true);
  });

  it('counts rate-limit hits in a window, and takes one back', async () => {
    const s = memoryState();
    expect((await s.hit('rate', 'ip', 60_000)).count).toBe(1);
    const second = await s.hit('rate', 'ip', 60_000);
    expect(second.count).toBe(2);
    expect(second.resetAt.getTime()).toBeGreaterThan(Date.now());
    await s.unhit('rate', 'ip');
    expect((await s.hit('rate', 'ip', 60_000)).count).toBe(2);
  });
});
