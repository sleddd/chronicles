import { useMemo, useRef, useState } from 'react';
import { SettingsRow } from '../molecules/SettingsCard.js';
import { ActionButton } from '../atoms/SettingsAtoms.js';
import { Spinner } from '../atoms/Spinner.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { entries as entriesApi, topics as topicsApi } from '../../services/api.js';
import { stripHtml } from '../../utils/stripHtml.js';
import { exerciseSummary } from '../../utils/exerciseSummary.js';
import { trainingPlans } from '../../utils/training.js';
import { mergeTrainingPlan, parseTrainingCsv, type TrainingImport as Parsed } from '../../utils/trainingImport.js';
import type { TrainingPlanFieldValues } from '../../types/fields.js';

const IMPORT_BATCH = 50;
const NEW_PLAN = 'new';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function topicId(names: string[], icon: string): Promise<number> {
  const { allTopics, setTopics } = useEntriesStore.getState();
  let topic = allTopics.find(t => names.includes(t.name.toLowerCase()));
  if (!topic) {
    topic = await topicsApi.create({ name: names[0].replace(/\b\w/g, c => c.toUpperCase()), icon });
    setTopics([...allTopics, topic]);
  }
  return topic.id;
}

function importedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const e of useEntriesStore.getState().decryptedEntries) {
    const k = (e.metadata as Record<string, unknown> | undefined)?._importKey;
    if (typeof k === 'string') keys.add(k);
  }
  return keys;
}

/**
 * Settings → Data row: import a training tracker spreadsheet (CSV, one phase
 * per file — utils/trainingImport). The phase, its categories and their hours
 * go into a new or existing training plan; each cell with a time becomes an
 * Exercise entry in its category. Safe to run again.
 */
export function TrainingImport() {
  const { encryptPost, encryptNewPost } = useEncryption();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<(Parsed & { fresh: Parsed['sessions'] }) | null>(null);
  const [target, setTarget] = useState(NEW_PLAN);
  const [planName, setPlanName] = useState('My training plan');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const plans = useMemo(() => {
    const id = allTopics.find(t => ['training plan', 'training plans'].includes(t.name.toLowerCase()))?.id;
    return trainingPlans(entries, id, stripHtml);
  }, [entries, allTopics]);

  const pick = async (file: File) => {
    setResult('');
    try {
      const p = parseTrainingCsv(await file.text());
      const done = importedKeys();
      setParsed({ ...p, fresh: p.sessions.filter(s => !done.has(s.importKey)) });
      setTarget(plans[0] ? String(plans[0].id) : NEW_PLAN);
      setPlanName(file.name.replace(/\.csv$/i, '').replace(/\s*-\s*phase.*$/i, '').trim() || 'My training plan');
    } catch (err) {
      setParsed(null);
      setResult(`Failed: ${err instanceof Error ? err.message : 'could not read the file'}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const savePlan = async (imp: Parsed) => {
    const tid = await topicId(['training plan', 'training plans'], 'mountain');
    const existing = target === NEW_PLAN ? undefined : useEntriesStore.getState().decryptedEntries.find(e => e.id === Number(target));
    const prevMeta = (existing?.metadata as Record<string, unknown> | undefined) ?? {};
    const prev = existing ? (prevMeta._customFields as TrainingPlanFieldValues) : null;
    const fields = mergeTrainingPlan(prev, imp, planName.trim() || 'My training plan');
    const name = fields.planName?.trim() || 'Training plan';
    const content = `<p>${escapeHtml(name)}</p>`;
    const metadata = { ...prevMeta, _taxonomyId: tid, _customFields: fields };
    if (existing) {
      const enc = await encryptPost(existing.id, existing.content || content, metadata);
      await entriesApi.update(existing.id, {
        contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv, taxonomyIds: [tid],
      });
      useEntriesStore.getState().updateDecryptedEntry(existing.id, { metadata });
      return;
    }
    const enc = await encryptNewPost(content, metadata);
    const res = await entriesApi.create({ id: enc.id,
      contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
      metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
      isEncrypted: true, taxonomyIds: [tid],
    });
    useEntriesStore.getState().addDecryptedEntry({
      id: res.id as number, content, metadata, isEncrypted: true,
      createdAt: new Date(res.createdAt as string),
      updatedAt: new Date((res.updatedAt || res.createdAt) as string),
    });
  };

  const run = async () => {
    if (!parsed) return;
    setBusy(true);
    let made = 0;
    try {
      await savePlan(parsed);
      const tid = await topicId(['exercise'], 'dumbbell');
      type Pending = { payload: Parameters<typeof entriesApi.createMany>[0][number]; content: string; metadata: Record<string, unknown> };
      let pending: Pending[] = [];
      const flush = async () => {
        if (!pending.length) return;
        const created = await entriesApi.createMany(pending.map(p => p.payload));
        created.forEach((res, k) => {
          useEntriesStore.getState().addDecryptedEntry({
            id: res.id as number, content: pending[k].content, metadata: pending[k].metadata, isEncrypted: true,
            createdAt: new Date(res.createdAt as string),
            updatedAt: new Date((res.updatedAt || res.createdAt) as string),
          });
        });
        made += created.length;
        pending = [];
        setResult(`Importing… ${made} of ${parsed.fresh.length}`);
      };
      for (const s of parsed.fresh) {
        const fields: Record<string, unknown> = {
          exerciseType: s.exerciseType, duration: String(s.minutes), intensity: s.intensity,
          distance: s.distance !== null ? String(s.distance) : '', distanceUnit: s.unit, calories: '',
          performedDate: s.date, performedTime: '', notes: s.notes, trainingCategory: s.category,
        };
        const content = `<p>${escapeHtml(exerciseSummary(fields))}</p>`;
        const metadata: Record<string, unknown> = { _taxonomyId: tid, _importKey: s.importKey, _customFields: fields };
        const enc = await encryptNewPost(content, metadata);
        pending.push({ content, metadata, payload: { id: enc.id,
          contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
          metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
          isEncrypted: true, taxonomyIds: [tid], createdAt: new Date(`${s.date}T12:00:00`).toISOString(),
        } });
        if (pending.length >= IMPORT_BATCH) await flush();
      }
      await flush();
      const already = parsed.sessions.length - parsed.fresh.length;
      setResult(`Imported ${parsed.phaseName}: ${made} session${made === 1 ? '' : 's'}${already ? ` (${already} already imported)` : ''}.`
        + `${parsed.skipped.length ? ` Skipped ${parsed.skipped.length} cell${parsed.skipped.length === 1 ? '' : 's'} with no time.` : ''}`
        + ' See Health → Exercise → Training.');
      setParsed(null);
    } catch (err) {
      setResult(`Failed after ${made} session${made === 1 ? '' : 's'}: ${err instanceof Error ? err.message : 'unknown error'}. Run it again to finish. Imported sessions are skipped.`);
    } finally {
      setBusy(false);
    }
  };

  const summary = parsed
    ? `${parsed.phaseName}: ${parsed.categories.length} categories, ${parsed.weeks} weeks, `
      + `${parsed.fresh.length} new session${parsed.fresh.length === 1 ? '' : 's'}`
      + `${parsed.sessions.length > parsed.fresh.length ? ` (${parsed.sessions.length - parsed.fresh.length} already imported)` : ''}`
      + `${parsed.skipped.length ? `. ${parsed.skipped.length} cell${parsed.skipped.length === 1 ? '' : 's'} without a time will be skipped (${parsed.skipped.slice(0, 4).map(s => `“${s.text}”`).join(', ')}${parsed.skipped.length > 4 ? ' …' : ''})` : ''}.`
    : '';

  return (
    <>
      <SettingsRow
        title="Import Training Tracker"
        description="Bring in a training spreadsheet (CSV, one phase per file): the phase’s categories and hours go into a training plan, and each cell with a time becomes an Exercise entry. Safe to run again."
        action={
          parsed ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <ActionButton onClick={run} disabled={busy}>
                {busy ? <Spinner size={14} /> : 'Import'}
              </ActionButton>
              <ActionButton onClick={() => { setParsed(null); setResult(''); }} disabled={busy}>Cancel</ActionButton>
            </div>
          ) : (
            <>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
              <ActionButton onClick={() => fileRef.current?.click()} disabled={busy}>Choose file</ActionButton>
            </>
          )
        }
      >
        {parsed && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 12 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
              Add to
              <select value={target} onChange={e => setTarget(e.target.value)} disabled={busy}>
                {plans.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                <option value={NEW_PLAN}>A new plan</option>
              </select>
            </label>
            {target === NEW_PLAN && (
              <input value={planName} onChange={e => setPlanName(e.target.value)} disabled={busy}
                aria-label="New plan name" placeholder="Plan name" style={{ maxWidth: 260 }} />
            )}
          </div>
        )}
      </SettingsRow>
      {(summary || result) && (
        <div role="status"
          style={{ padding: '0 20px 12px', fontSize: 13, color: result.startsWith('Failed') ? 'var(--color-danger)' : 'var(--text-secondary)' }}>
          {result || summary}
        </div>
      )}
    </>
  );
}
