import { useCallback } from 'react';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { entries as entriesApi } from '../services/api.js';
import { getOrCreateTopic } from '../utils/getOrCreateJournalTopic.js';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Create an entry in a topic from a name and its fields, without opening the
 * editor (the planner's "Add a task", a new habit…). Encrypted like any other
 * entry; the topic is made first when the account doesn't have it. Resolves to
 * the new entry's id, or null when it didn't save.
 */
export function useCreateEntry() {
  const { encryptNewPost } = useEncryption();
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  return useCallback(async (topic: { name: string; icon: string }, name: string, fields: Record<string, unknown>): Promise<number | null> => {
    try {
      const topicId = await getOrCreateTopic(topic.name, topic.icon);
      const content = `<p>${escapeHtml(name)}</p>`;
      const metadata = { _taxonomyId: topicId, _customFields: fields };
      const enc = await encryptNewPost(content, metadata);
      const res = await entriesApi.create({ id: enc.id,
        contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
        isEncrypted: true, taxonomyIds: [topicId],
      });
      addDecryptedEntry({ id: res.id as number, content, metadata, isEncrypted: true,
        createdAt: new Date(res.createdAt as string), updatedAt: new Date((res.updatedAt || res.createdAt) as string) });
      return res.id as number;
    } catch (err) {
      console.error('Creating the entry failed:', err);
      return null;
    }
  }, [encryptNewPost, addDecryptedEntry]);
}
