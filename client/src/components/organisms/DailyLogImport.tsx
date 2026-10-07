import { useRef, useState } from 'react';
import { SettingsRow } from '../molecules/SettingsCard.js';
import { ActionButton } from '../atoms/SettingsAtoms.js';
import { Spinner } from '../atoms/Spinner.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useEncryptedSetting } from '../../hooks/useEncryptedSetting.js';
import { entries as entriesApi, topics as topicsApi } from '../../services/api.js';
import { getOrCreateJournalTopic } from '../../utils/getOrCreateJournalTopic.js';
import { planDailyLogImport, type ImportPlan, type PlannedEntry } from '../../utils/dailyLogImport.js';
import { DEFAULT_NUTRIENT_GOALS, type NutrientGoals } from '../../types/nutrition.js';

const TOPIC_ICONS: Record<PlannedEntry['topic'], string> = { Meals: 'utensils', Symptom: 'stethoscope', Journal: 'book' };

async function topicIdFor(name: PlannedEntry['topic']): Promise<number> {
  if (name === 'Journal') return getOrCreateJournalTopic();
  const { allTopics, setTopics } = useEntriesStore.getState();
  let topic = allTopics.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (!topic) {
    topic = await topicsApi.create({ name, icon: TOPIC_ICONS[name] });
    setTopics([...allTopics, topic]);
  }
  return topic.id;
}

/** Import keys of entries already brought in, so a re-run only adds what's new. */
function importedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const e of useEntriesStore.getState().decryptedEntries) {
    const k = (e.metadata as Record<string, unknown> | undefined)?._importKey;
    if (typeof k === 'string') keys.add(k);
  }
  return keys;
}

/**
 * Settings → Data row: import a "Daily log" export (JSON) as encrypted
 * journal entries — food, supplements and medications into Meals, symptoms
 * into Symptom, notes into Journal — plus its daily nutrient goals.
 */
export function DailyLogImport() {
  const { encryptPost } = useEncryption();
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const [, saveGoals] = useEncryptedSetting<NutrientGoals>('nutritionGoals', DEFAULT_NUTRIENT_GOALS);
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<(ImportPlan & { fresh: PlannedEntry[] }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const pick = async (file: File) => {
    setResult('');
    try {
      const p = planDailyLogImport(await file.text());
      const done = importedKeys();
      setPlan({ ...p, fresh: p.entries.filter(e => !done.has(e.importKey)) });
    } catch (err) {
      setPlan(null);
      setResult(`Failed: ${err instanceof Error ? err.message : 'could not read the file'}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const run = async () => {
    if (!plan) return;
    setBusy(true);
    let made = 0;
    try {
      const ids = new Map<PlannedEntry['topic'], number>();
      for (const item of plan.fresh) {
        if (!ids.has(item.topic)) ids.set(item.topic, await topicIdFor(item.topic));
        const tid = ids.get(item.topic)!;
        const metadata: Record<string, unknown> = { _taxonomyId: tid, _importKey: item.importKey };
        if (Object.keys(item.customFields).length) metadata._customFields = item.customFields;
        const encrypted = await encryptPost(item.content, metadata);
        const res = await entriesApi.create({
          contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
          metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
          isEncrypted: true, taxonomyIds: [tid], createdAt: item.createdAt,
        });
        addDecryptedEntry({
          id: res.id as number, content: item.content, metadata, isEncrypted: true,
          createdAt: new Date(res.createdAt as string),
          updatedAt: new Date((res.updatedAt || res.createdAt) as string),
        });
        made++;
        setResult(`Importing… ${made} of ${plan.fresh.length}`);
      }
      if (plan.goals) await saveGoals(plan.goals);
      const skipped = plan.entries.length - plan.fresh.length;
      setResult(`Imported ${made} item${made === 1 ? '' : 's'} from ${plan.days} day${plan.days === 1 ? '' : 's'}`
        + `${skipped ? ` (${skipped} already imported)` : ''}${plan.goals ? '; daily goals updated' : ''}.`);
      setPlan(null);
    } catch (err) {
      setResult(`Failed after ${made} item${made === 1 ? '' : 's'}: ${err instanceof Error ? err.message : 'unknown error'}. Run it again to finish — imported items are skipped.`);
    } finally {
      setBusy(false);
    }
  };

  const summary = plan
    ? (plan.fresh.length
        ? `${plan.fresh.length} new item${plan.fresh.length === 1 ? '' : 's'} from ${plan.days} day${plan.days === 1 ? '' : 's'}`
          + `${plan.entries.length > plan.fresh.length ? ` (${plan.entries.length - plan.fresh.length} already imported)` : ''}`
          + `${plan.goals ? ', plus your daily goals' : ''}. Import them?`
        : 'Everything in this file is already in your journal.')
    : '';

  return (
    <>
      <SettingsRow
        title="Import Daily Log"
        description="Bring in a Daily log export (JSON): food, supplements and medications go to Meals, symptoms to Symptom, notes to Journal. Safe to run again."
        action={
          plan && plan.fresh.length > 0 ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <ActionButton onClick={run} disabled={busy}>
                {busy ? <Spinner size={14} /> : `Import ${plan.fresh.length}`}
              </ActionButton>
              <ActionButton onClick={() => { setPlan(null); setResult(''); }} disabled={busy}>Cancel</ActionButton>
            </div>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); }}
              />
              <ActionButton onClick={() => fileRef.current?.click()} disabled={busy}>Choose file</ActionButton>
            </>
          )
        }
      />
      {(summary || result) && (
        <div
          role="status"
          style={{ padding: '0 20px 12px', fontSize: 13, color: result.startsWith('Failed') ? '#9B4444' : 'var(--text-secondary)' }}
        >
          {result || summary}
        </div>
      )}
    </>
  );
}
