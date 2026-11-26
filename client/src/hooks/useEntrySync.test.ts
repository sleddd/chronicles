import { beforeEach, describe, expect, it } from 'vitest';
import type { DecryptedPost, EncryptedPost } from '@shared/crypto/types';
import { useEntriesStore } from '../stores/entriesStore.js';
import { mergeChanges } from './useEntrySync.js';

const at = (iso: string) => new Date(iso);
const raw = (id: number, created: string, updated = created): EncryptedPost => ({
  id, contentEncrypted: `c${id}`, contentIv: 'iv', metadataEncrypted: null, metadataIv: null,
  isEncrypted: true, createdAt: at(created), updatedAt: at(updated),
});
const dec = (id: number, content: string, created: string, updated = created): DecryptedPost => ({
  id, content, metadata: {}, isEncrypted: true, createdAt: at(created), updatedAt: at(updated),
});

describe('mergeChanges', () => {
  beforeEach(() => {
    useEntriesStore.getState().clearAll();
    useEntriesStore.setState({
      rawEntries: [raw(2, '2026-11-25'), raw(1, '2026-11-24')],
      decryptedEntries: [dec(2, 'wellness', '2026-11-25'), dec(1, 'old', '2026-11-24')],
    });
  });

  it('replaces changed entries, adds new ones newest first, and drops deleted ones', () => {
    mergeChanges(
      [raw(2, '2026-11-25', '2026-11-26'), raw(3, '2026-11-26')],
      [dec(2, 'wellness, updated by Smith', '2026-11-25', '2026-11-26'), dec(3, 'new', '2026-11-26')],
      [1],
    );
    const s = useEntriesStore.getState();
    expect(s.decryptedEntries.map(e => [e.id, e.content])).toEqual([[3, 'new'], [2, 'wellness, updated by Smith']]);
    expect(s.rawEntries.map(e => e.id)).toEqual([3, 2]);
  });

  it('keeps the copy this tab saved after the changes were read', () => {
    useEntriesStore.getState().updateDecryptedEntry(2, { content: 'typed here', updatedAt: at('2026-11-27') });
    mergeChanges([raw(2, '2026-11-25', '2026-11-26')], [dec(2, 'older server copy', '2026-11-25', '2026-11-26')], []);
    expect(useEntriesStore.getState().decryptedEntries.find(e => e.id === 2)?.content).toBe('typed here');
  });
});
