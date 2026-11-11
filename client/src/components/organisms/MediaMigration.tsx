import { useMemo, useState } from 'react';
import { SettingsRow } from '../molecules/SettingsCard.js';
import { ActionButton } from '../atoms/SettingsAtoms.js';
import { Checkbox } from '../atoms/core/Checkbox.jsx';
import { Spinner } from '../atoms/Spinner.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useUIStore } from '../../stores/uiStore.js';
import { entries as entriesApi, topics as topicsApi } from '../../services/api.js';
import { stripHtml } from '../../utils/stripHtml.js';
import { legacyMediaFields, legacyMediaType, mediaTopicIds } from '../../utils/media.js';
import { DEFAULT_TOPICS } from '../../utils/defaultTopics.js';

/**
 * Settings → Data row: move every entry in the old Books, Music and
 * TV/Movies topics into the Media topic, as media entries (type, title,
 * creator, rating and shelf read from their fields and text — utils/media).
 * The entries keep their text and dates. The emptied old topics are deleted
 * afterwards when the switch is on (the default), or later with their own
 * button; their user-defined field definitions go with them. Safe to run
 * again: it only ever finds what's left.
 */
export function MediaMigration() {
  const { encryptPost } = useEncryption();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [dropTopics, setDropTopics] = useState(true);
  const [confirmDrop, setConfirmDrop] = useState(false);

  const legacyTopics = useMemo(() => allTopics.filter(t => legacyMediaType(t.name)), [allTopics]);

  const pending = useMemo(() => {
    const legacy = new Map<number, string>();
    for (const t of allTopics) if (legacyMediaType(t.name)) legacy.set(t.id, t.name);
    return entries.filter(e => {
      const tid = (e.metadata as Record<string, unknown> | undefined)?._taxonomyId;
      return typeof tid === 'number' && legacy.has(tid);
    }).map(e => ({ entry: e, topicId: (e.metadata as Record<string, unknown>)._taxonomyId as number, topicName: legacy.get((e.metadata as Record<string, unknown>)._taxonomyId as number)! }));
  }, [entries, allTopics]);

  /** Delete the old topics (their entries must already be moved) */
  const deleteLegacyTopics = async (): Promise<string[]> => {
    const gone: string[] = [];
    for (const t of legacyTopics) {
      const stillHas = useEntriesStore.getState().decryptedEntries.some(e => (e.metadata as Record<string, unknown> | undefined)?._taxonomyId === t.id);
      if (stillHas) continue;
      await topicsApi.delete(t.id);
      useEntriesStore.getState().setTopics(useEntriesStore.getState().allTopics.filter(x => x.id !== t.id));
      gone.push(t.name);
    }
    return gone;
  };

  const dropOnly = async () => {
    if (busy) return;
    if (!confirmDrop) { setConfirmDrop(true); return; }
    setConfirmDrop(false);
    setBusy(true); setResult('');
    try {
      const gone = await deleteLegacyTopics();
      setResult(gone.length ? `Deleted ${gone.join(', ')}.` : 'Those topics still have entries — move them first.');
    } catch (err) {
      setResult(`Failed: ${err instanceof Error ? err.message : 'unknown error'}.`);
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!pending.length || busy) return;
    setBusy(true); setResult('');
    let moved = 0;
    try {
      let mediaId = mediaTopicIds(useEntriesStore.getState().allTopics)[0];
      if (mediaId == null) {
        const def = DEFAULT_TOPICS.find(t => t.name === 'Media')!;
        const topic = await topicsApi.create({ name: def.name, icon: def.icon });
        useEntriesStore.getState().setTopics([...useEntriesStore.getState().allTopics, topic]);
        mediaId = topic.id;
      }
      for (const { entry, topicId, topicName } of pending) {
        const move = legacyMediaFields(entry, topicName, topicCustomFields[topicId] ?? [], stripHtml);
        if (!move) continue;
        const metadata = { ...((entry.metadata as Record<string, unknown>) ?? {}), _taxonomyId: mediaId, _customFields: move.fields };
        const enc = await encryptPost(entry.id, entry.content, metadata);
        await entriesApi.update(entry.id, {
          contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
          metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv, taxonomyIds: [mediaId],
        });
        useEntriesStore.getState().updateDecryptedEntry(entry.id, { metadata });
        moved++;
        setResult(`Moving… ${moved} of ${pending.length}`);
      }
      const gone = dropTopics ? await deleteLegacyTopics() : [];
      setResult(`Moved ${moved} ${moved === 1 ? 'entry' : 'entries'} to Media.`
        + (gone.length ? ` Deleted ${gone.join(', ')}.` : ' Books, Music and TV/Movies are empty now.')
        + ' Open Media to check the titles, types and shelves.');
    } catch (err) {
      setResult(`Failed after ${moved}: ${err instanceof Error ? err.message : 'unknown error'}. Run it again to finish — moved entries aren’t touched twice.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SettingsRow
        title="Move Books, Music and TV/Movies into Media"
        description={pending.length
          ? `${pending.length} ${pending.length === 1 ? 'entry' : 'entries'} in the old topics become media entries — the title, who made it, rating and shelf are read from each one’s fields and text, and its writing goes in Notes. No entry is deleted.`
          : legacyTopics.length
            ? 'Nothing left in the old Books, Music and TV/Movies topics. They can go now.'
            : 'Nothing left to move. The old topics are gone.'}
        action={
          pending.length ? (
            <ActionButton onClick={run} disabled={busy}>
              {busy ? <Spinner size={14} /> : `Move ${pending.length}`}
            </ActionButton>
          ) : legacyTopics.length ? (
            <ActionButton onClick={dropOnly} disabled={busy} onBlur={() => setConfirmDrop(false)}>
              {busy ? <Spinner size={14} /> : confirmDrop ? `Delete ${legacyTopics.length === 1 ? 'it' : 'them'}?` : 'Delete the old topics'}
            </ActionButton>
          ) : null
        }
      >
        {pending.length > 0 && legacyTopics.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Checkbox checked={dropTopics} onChange={(e: { target: { checked: boolean } }) => setDropTopics(e.target.checked)}
              label={`Delete ${legacyTopics.map(t => t.name).join(', ')} once they’re empty`} />
          </div>
        )}
      </SettingsRow>
      {result && (
        <div role="status" style={{ padding: '0 20px 12px', fontSize: 13, color: result.startsWith('Failed') ? 'var(--color-danger)' : 'var(--text-secondary)' }}>
          {result}
        </div>
      )}
    </>
  );
}
