import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { entries as entriesApi } from '../services/api.js';
import type { DecryptedPost } from '@shared/crypto/types';

/** Save an entry's custom fields (optimistic; rolled back on failure). True once saved. */
export function useSaveFields() {
  const { encryptPost } = useEncryption();
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  return async (entry: DecryptedPost, cf: Record<string, unknown>, content = entry.content): Promise<boolean> => {
    const prev = { content: entry.content, metadata: entry.metadata };
    const metadata: Record<string, unknown> = { ...((entry.metadata as Record<string, unknown>) ?? {}), _customFields: cf };
    updateDecryptedEntry(entry.id, { content, metadata });
    try {
      const tid = metadata._taxonomyId as number | undefined;
      const enc = await encryptPost(entry.id, content, metadata);
      await entriesApi.update(entry.id, {
        contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
        taxonomyIds: tid ? [tid] : [],
      });
      return true;
    } catch (err) {
      console.error('Dashboard save failed:', err);
      updateDecryptedEntry(entry.id, prev);
      return false;
    }
  };
}
