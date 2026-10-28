import { useCallback } from 'react';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { entries as entriesApi } from '../services/api.js';
import { autoNutritionOnSave } from '../services/aiAssistant.js';
import { chatSaveEntry } from '../utils/chatSaveFields.js';
import { textToEntryHtml, type TopicRef } from '../utils/chatSave.js';
import { getOrCreateJournalTopic } from '../utils/getOrCreateJournalTopic.js';

/** A Journal topic offered before the account has one (made on first save) */
export const JOURNAL_PLACEHOLDER_ID = -1;

/**
 * Save `/save`-style text as an encrypted entry under a topic — shaped like
 * the topic's own form (a task's title and due date, a symptom's chips…;
 * plain text for plain topics). Used by the AI chat's /save and by voice
 * commands. `estimateNutrition`: fill a meal's nutrients with the AI first (a
 * failed estimate never blocks the save). `extraFields` are merged into the
 * topic's fields (a task's goal / milestone link).
 */
export function useSaveCommand() {
  const { encryptNewPost } = useEncryption();
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const topicCustomFields = useUIStore(s => s.topicCustomFields);

  return useCallback(async (
    topic: TopicRef, text: string,
    { estimateNutrition = false, extraFields }: { estimateNutrition?: boolean; extraFields?: Record<string, unknown> } = {},
  ): Promise<{ id: number; estimated: boolean }> => {
    const topicId = topic.id === JOURNAL_PLACEHOLDER_ID ? await getOrCreateJournalTopic() : topic.id;
    const shaped = chatSaveEntry(topic.name, text, topicCustomFields[topicId] ?? []);
    const content = shaped.customFields && shaped.content ? shaped.content : textToEntryHtml(text);
    const metadata: Record<string, unknown> = { _taxonomyId: topicId };
    let estimated = false;
    if (shaped.customFields) {
      // extraFields: what the text can't say, e.g. a task's goal from voice
      let cf = extraFields ? { ...shaped.customFields, ...extraFields } : shaped.customFields;
      if (estimateNutrition && topic.name.toLowerCase() === 'meals') {
        try {
          const filled = await autoNutritionOnSave(String(cf.mealDescription ?? ''), cf);
          if (filled) { cf = filled; estimated = true; }
        } catch (err) {
          console.warn('Nutrient estimate failed:', err);
        }
      }
      metadata._customFields = cf;
    }
    const encrypted = await encryptNewPost(content, metadata);
    const result = await entriesApi.create({ id: encrypted.id,
      contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
      metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
      isEncrypted: true, taxonomyIds: [topicId],
    });
    const id = result.id as number;
    addDecryptedEntry({
      id, content, metadata, isEncrypted: true,
      createdAt: new Date(result.createdAt as string),
      updatedAt: new Date((result.updatedAt || result.createdAt) as string),
    });
    return { id, estimated };
  }, [encryptNewPost, addDecryptedEntry, topicCustomFields]);
}
