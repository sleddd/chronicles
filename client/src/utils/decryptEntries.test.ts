import { describe, it, expect, vi } from 'vitest';
import type { EncryptedPost, DecryptedPost } from '@shared/crypto/types';
import { decryptEntriesInBatches } from './decryptEntries.js';

const row = (id: number, day: string): EncryptedPost => ({
  id, contentEncrypted: 'c', contentIv: 'i', metadataEncrypted: 'm', metadataIv: 'i', isEncrypted: true,
  createdAt: new Date(`${day}T12:00:00Z`), updatedAt: new Date(`${day}T12:00:00Z`),
} as EncryptedPost);
const open = (p: EncryptedPost): DecryptedPost => ({ id: p.id, content: `e${p.id}`, metadata: {}, isEncrypted: true, createdAt: p.createdAt, updatedAt: p.updatedAt } as DecryptedPost);

describe('decryptEntriesInBatches', () => {
  const rows = [row(1, '2026-01-01'), row(2, '2026-03-01'), row(3, '2026-02-01'), row(4, '2026-04-01'), row(5, '2025-12-01')];

  it('opens the newest first, a batch at a time, and keeps the order given', async () => {
    const seen: number[] = [];
    const out = await decryptEntriesInBatches(rows, async ([p]) => { seen.push(p.id); return [open(p)]; }, () => false, 2);
    expect(seen).toEqual([4, 2, 3, 1, 5]);
    expect(out!.map(e => e.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps an entry that will not open, as such', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await decryptEntriesInBatches(rows, async ([p]) => { if (p.id === 3) throw new Error('bad tag'); return [open(p)]; }, () => false, 2);
    expect(out!.map(e => e.content)).toEqual(['e1', 'e2', '[Decryption failed]', 'e4', 'e5']);
    warn.mockRestore();
  });

  it('stops with nothing once the load is cancelled', async () => {
    let calls = 0;
    const out = await decryptEntriesInBatches(rows, async ([p]) => { calls++; return [open(p)]; }, () => calls >= 2, 2);
    expect(out).toBeNull();
    expect(calls).toBe(2);
  });

  it('throws when the key has left the tab, never a journal of placeholders', async () => {
    await expect(decryptEntriesInBatches(rows, async () => { throw new Error('Encryption not unlocked'); }))
      .rejects.toThrow('Encryption not unlocked');
  });
});
