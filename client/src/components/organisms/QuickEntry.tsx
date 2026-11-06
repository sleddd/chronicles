import { useCallback, useRef, useState } from 'react';
import { EntryForm } from './EntryForm.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useUIStore } from '../../stores/uiStore.js';
import { entries as entriesApi } from '../../services/api.js';
import { getOrCreateJournalTopic } from '../../utils/getOrCreateJournalTopic.js';
import { hasEntryData, prepareEntryForSave } from '../../utils/entrySave.js';
import { nextReflectivePrompt } from '../../utils/journalPrompts.js';
import { useTimeStore } from '../../stores/timeStore.js';
import { startTimer } from '../../utils/timeTracking.js';
import { QUICK_FINANCE_CHOICES, QuickFinance, type QuickFinanceKind } from './QuickFinance.js';

/**
 * The dashboard's Quick entry: the journal's own editor and topic fields
 * (`EntryForm` in its quick layout), saved the same way as a journal save
 * (`utils/entrySave`). No topic = Journal. The form clears after each save.
 * With Finance on, the topic picker also offers Bill and Spending, which swap
 * in Budget & bills' own forms (`QuickFinance`).
 */
export function QuickEntry() {
  const topics = useEntriesStore(s => s.topics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const financeOn = useEntriesStore(s => s.featureFlags.financeEnabled === true);
  const [finance, setFinance] = useState<QuickFinanceKind | null>(null);
  const { encryptPost, encryptNewPost } = useEncryption();
  const [typedContent, setContent] = useState('');
  const [topicId, setTopicId] = useState<number | null>(null);
  const [typedFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving] = useState(false);
  // Set synchronously: two quick clicks (or ⌘+Enter twice) in one render would
  // both still see isSaving false and create the entry twice
  const savingRef = useRef(false);
  const [status, setStatus] = useState('');
  // The next reflective prompt each time the dashboard opens (utils/journalPrompts)
  const [prompt] = useState(nextReflectivePrompt);

  const reset = () => { setContent(''); setTopicId(null); setCustomFields({}); };

  /** Saves the entry and clears the form; the new entry's id, or null when nothing was saved */
  const saveEntry = useCallback(async (fill?: { content: string; fields: Record<string, unknown> }): Promise<number | null> => {
    const userFieldDefs = topicId != null ? (topicCustomFields[topicId] ?? []) : [];
    // A timer started before anything was typed saves a dated name in its place
    const content = fill && !hasEntryData(typedContent, typedFields, userFieldDefs) ? fill.content : typedContent;
    const customFields = fill && !hasEntryData(typedContent, typedFields, userFieldDefs) ? { ...typedFields, ...fill.fields } : typedFields;
    if (savingRef.current || !hasEntryData(content, customFields, userFieldDefs)) return null;
    savingRef.current = true;
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
      return res.id as number;
    } catch (err) {
      console.error('Quick entry save failed:', err);
      setStatus('Save failed');
      return null;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [typedContent, topicId, typedFields, topicCustomFields, encryptNewPost, addDecryptedEntry]);

  const handleSave = useCallback(async () => { await saveEntry(); }, [saveEntry]);

  // Time-tracked topics: save, then time it (the floating timer shows it running)
  const handleSaveAndStartTimer = useCallback(async (fill?: { content: string; fields: Record<string, unknown> }) => {
    const id = await saveEntry(fill);
    if (id !== null) useTimeStore.getState().apply(list => startTimer(list, id, new Date(), crypto.randomUUID()));
  }, [saveEntry]);

  return (
    <EntryForm
      variant="quick"
      entryId={null}
      content={typedContent}
      onContentChange={setContent}
      topicId={topicId}
      onTopicChange={id => { setFinance(null); setTopicId(id); }}
      quickExtras={financeOn ? QUICK_FINANCE_CHOICES : undefined}
      quickExtra={financeOn ? finance : null}
      onQuickExtra={k => setFinance(k as QuickFinanceKind)}
      quickExtraBody={financeOn && finance ? <QuickFinance kind={finance} /> : undefined}
      topics={topics}
      customFields={typedFields}
      onCustomFieldsChange={setCustomFields}
      onSave={handleSave}
      onSaveAndStartTimer={handleSaveAndStartTimer}
      onNew={reset}
      isEditing={false}
      isSaving={isSaving}
      saveStatus={status}
      placeholder={prompt}
    />
  );
}
