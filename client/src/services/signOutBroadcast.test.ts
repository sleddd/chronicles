import { describe, it, expect, vi } from 'vitest';
import { announceLocalReset, onRemoteReset } from './signOutBroadcast.js';

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
});
