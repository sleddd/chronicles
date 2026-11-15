import { describe, it, expect, vi } from 'vitest';
import { announceLocalReset, announceSigningIn, onRemoteReset } from './signOutBroadcast.js';

describe('signOutBroadcast', () => {
  it('ignores its own tab’s announcement', async () => {
    const seen = vi.fn();
    const off = onRemoteReset(seen);
    announceLocalReset();
    await new Promise(r => setTimeout(r, 30));
    expect(seen).not.toHaveBeenCalled();
    off();
  });

  it('hears another tab’s announcement', async () => {
    const seen = vi.fn();
    const off = onRemoteReset(seen);
    const other = new BroadcastChannel('chronicles-auth');
    other.postMessage({ type: 'reset', from: 'another-tab' });
    await new Promise(r => setTimeout(r, 30));
    expect(seen).toHaveBeenCalledTimes(1);
    other.close();
    off();
  });

  it('treats storage being cleared in another tab as a reset', () => {
    const seen = vi.fn();
    const off = onRemoteReset(seen);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'chronicles.theme-v1' }));
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });

  it('a tab showing someone else lets go when another tab signs in; the same person carries on', async () => {
    const other = new BroadcastChannel('chronicles-auth');
    const mine = vi.fn();
    const theirs = vi.fn();
    const signedOut = vi.fn();
    const offMine = onRemoteReset(mine, () => 'olivia@example.com');
    const offTheirs = onRemoteReset(theirs, () => 'sam@example.com');
    const offNobody = onRemoteReset(signedOut, () => null);
    other.postMessage({ type: 'signing-in', email: 'olivia@example.com', from: 'another-tab' });
    await new Promise(r => setTimeout(r, 30));
    expect(mine).not.toHaveBeenCalled();
    expect(theirs).toHaveBeenCalledTimes(1);
    // A tab with nobody signed in has nothing to drop
    expect(signedOut).not.toHaveBeenCalled();
    other.close(); offMine(); offTheirs(); offNobody();
  });

  it('compares emails the way sign-in does (case and spaces)', async () => {
    const other = new BroadcastChannel('chronicles-auth');
    const seen = vi.fn();
    const off = onRemoteReset(seen, () => ' Olivia@Example.com ');
    other.postMessage({ type: 'signing-in', email: 'olivia@example.com', from: 'another-tab' });
    await new Promise(r => setTimeout(r, 30));
    expect(seen).not.toHaveBeenCalled();
    other.close(); off();
  });

  it('announces a sign-in to the other tabs, normalized, and not to itself', async () => {
    const heard: unknown[] = [];
    const other = new BroadcastChannel('chronicles-auth');
    other.onmessage = e => heard.push(e.data);
    const own = vi.fn();
    const off = onRemoteReset(own, () => 'someone-else@example.com');
    announceSigningIn('  Olivia@Example.com ');
    await new Promise(r => setTimeout(r, 30));
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ type: 'signing-in', email: 'olivia@example.com' });
    expect(own).not.toHaveBeenCalled();
    other.close(); off();
  });
});
