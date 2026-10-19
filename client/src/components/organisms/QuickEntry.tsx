import { useCallback, useState } from 'react';
import { EntryForm } from './EntryForm.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useUIStore } from '../../stores/uiStore.js';
import { entries as entriesApi } from '../../services/api.js';
import { getOrCreateJournalTopic } from '../../utils/getOrCreateJournalTopic.js';
import { hasEntryData, prepareEntryForSave } from '../../utils/entrySave.js';

/**
 * The dashboard's Quick entry: the journal's own editor and topic fields
 * (`EntryForm` in its quick layout), saved the same way as a journal save
 * (`utils/entrySave`). No topic = Journal. The form clears after each save.
 */
export function QuickEntry() {
  const topics = useEntriesStore(s => s.topics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const { encryptPost, encryptNewPost } = useEncryption();
  const [content, setContent] = useState('');
  const [topicId, setTopicId] = useState<number | null>(null);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');

  const reset = () => { setContent(''); setTopicId(null); setCustomFields({}); };

  const handleSave = useCallback(async () => {
    const userFieldDefs = topicId != null ? (topicCustomFields[topicId] ?? []) : [];
    if (isSaving || !hasEntryData(content, customFields, userFieldDefs)) return;
    setIsSaving(true); setStatus('');
    try {
      const effectiveTopicId = topicId ?? await getOrCreateJournalTopic();
      const topicName = useEntriesStore.getState().allTopics.find(t => t.id === effectiveTopicId)?.name.toLowerCase();
      const prepared = await prepareEntryForSave(content, customFields, topicName, userFieldDefs);
      const metadata: Record<string, unknown> = { _taxonomyId: effectiveTopicId };
      if (Object.keys(prepared.customFields).length > 0) metadata._customFields = prepared.customFields;
      const enc = await encryptNewPost(prepared.content, metadata);
      const res = await entriesApi.create({ id: enc.id,
        contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
        isEncrypted: true, taxonomyIds: [effectiveTopicId],
      });
      addDecryptedEntry({ id: res.id as number, content: prepared.content, metadata, isEncrypted: true,
        createdAt: new Date(res.createdAt as string), updatedAt: new Date((res.updatedAt || res.createdAt) as string) });
      reset();
    } catch (err) {
      console.error('Quick entry save failed:', err);
      setStatus('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [content, topicId, customFields, topicCustomFields, isSaving, encryptNewPost, addDecryptedEntry]);

  return (
    <EntryForm
      variant="quick"
      entryId={null}
      content={content}
      onContentChange={setContent}
      topicId={topicId}
      onTopicChange={setTopicId}
      topics={topics}
      customFields={customFields}
      onCustomFieldsChange={setCustomFields}
      onSave={handleSave}
      onNew={reset}
      isEditing={false}
      isSaving={isSaving}
      saveStatus={status}
      placeholder="What’s on your mind? Jot a thought, a task, or a priority…"
    />
  );
}
