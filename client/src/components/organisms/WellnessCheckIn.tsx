import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { WellnessPanel, WATER_GOAL, type FlowIntensity } from '../molecules/WellnessPanel.js';
import { DashPanel, DashPanelHead } from './FoldingDashPanel.js';
import { DayInventory, type DayInventoryValues } from '../molecules/DayInventory.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { useUIStore } from '../../stores/uiStore.js';
import { entries as entriesApi, topics as topicsApi } from '../../services/api.js';
import { toDateStr } from '../../utils/dateUtils.js';
import { predictNextPeriod } from '../../utils/cyclePrediction.js';
import { moodFields, moodOf } from '../../utils/moodFields.js';

type Flow = FlowIntensity;

/* ── Helpers ── */

function isTodaysCheckIn(meta: Record<string, unknown>, day: string): boolean {
  if (meta._widgetType !== 'wellness-checkin') return false;
  const cf = meta._customFields as Record<string, unknown> | undefined;
  return cf?.date === day;
}

/* ── Component ── */

/**
 * Today's wellness check-in (the shared WellnessPanel) — water, sleep, mood
 * and period flow, with the next expected period; on both dashboards,
 * "Your day" under it (DayInventory: rested, woke in the night,
 * ate, work day, social time, procrastinated). Saves the same `wellness-checkin` entry the journal edits
 * (debounced 600ms, optimistic store updates), so values stay in sync both
 * ways.
 */
/* The home dashboard's title row (the widget card styles its h2 and draws its fold arrow and grip) */
const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  h2 { margin: 0; }
`;

/* The titled card: the widget card's own padding is the room under it — Your day's bar (its last
   row) adds none of its own */
const Titled = styled.section`
  /* …and less of the card's padding under it, too */
  margin-bottom: -16px;
  & [role='region'][aria-label='Your day'] > button:first-child { padding-bottom: 0; }
`;

/** `titled` (home dashboard): a section with its title row, the strip flat under it — the widget card
 *  around it is the panel */
export function WellnessCheckIn({ title, quad, bare, strip, foldable, titled }: { title?: string; quad?: boolean; bare?: boolean; strip?: boolean; foldable?: boolean; titled?: boolean } = {}) {
  const { encryptPost, encryptNewPost } = useEncryption();
  const decryptedEntries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const setTopics = useEntriesStore(s => s.setTopics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const today = toDateStr(new Date());

  // Derived from the store — reactive to journal edits
  const entry = useMemo(
    () => decryptedEntries.find(e => isTodaysCheckIn(e.metadata as Record<string, unknown>, today)) ?? null,
    [decryptedEntries, today],
  );
  const stored = useMemo(
    () => (entry ? ((entry.metadata as Record<string, unknown>)._customFields as Record<string, unknown>) ?? {} : null),
    [entry],
  );

  // Pending values — used only until the first entry exists
  const [pendingWater, setPendingWater] = useState(0);
  const [pendingMood, setPendingMood] = useState(0);
  const [pendingSleep, setPendingSleep] = useState(0);
  const [pendingFlow, setPendingFlow] = useState<Flow>('');
  const [pendingDay, setPendingDay] = useState<Partial<DayInventoryValues>>({});

  const water = stored ? (Number(stored.waterGlasses) || 0) : pendingWater;
  const sleep = stored ? (Number(stored.sleepHours) || 0) : pendingSleep;
  const flow = stored ? ((stored.flowIntensity as Flow) || '') : pendingFlow;
  const mood = stored ? moodOf(stored) : pendingMood;
  // The rest of the daily inventory ("Your day")
  const day: DayInventoryValues = stored
    ? {
        sleepQuality: Number(stored.sleepQuality) || 0,
        wokeAtNight: typeof stored.wokeAtNight === 'boolean' ? stored.wokeAtNight : null,
        dreamed: typeof stored.dreamed === 'boolean' ? stored.dreamed : null,
        eating: (stored.eating as DayInventoryValues['eating']) || '',
        workDay: Number(stored.workDay) || 0,
        social: Number(stored.social) || 0,
        procrastination: Number(stored.procrastination) || 0,
        stress: Number(stored.stress) || 0,
        notes: typeof stored.notes === 'string' ? stored.notes : '',
      }
    : { sleepQuality: 0, wokeAtNight: null, dreamed: null, eating: '', workDay: 0, social: 0, procrastination: 0, stress: 0, notes: '', ...pendingDay };

  // Next period from every logged check-in, with today's live value overlaid
  const prediction = useMemo(() => {
    const days = decryptedEntries.flatMap(e => {
      const meta = e.metadata as Record<string, unknown>;
      if (meta._widgetType !== 'wellness-checkin') return [];
      const cf = (meta._customFields as Record<string, unknown>) ?? {};
      return typeof cf.date === 'string' ? [{ date: cf.date, period: !!cf.periodToday }] : [];
    });
    return predictNextPeriod([...days, { date: today, period: flow !== '' }]);
  }, [decryptedEntries, today, flow]);

  const entryIdRef = useRef<number | null>(null);
  useEffect(() => { if (entry) entryIdRef.current = entry.id; }, [entry]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Leaving the page with a change still waiting (a tap less than 600ms ago) saves
  // it now. Deferred a tick: the notes box hands over what's typed in its own
  // unmount, which runs after this one, and both go in the one save
  useEffect(() => () => {
    setTimeout(() => {
      if (!debounceRef.current) return;
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      void doSaveRef.current();
    }, 0);
  }, []);
  const latestRef = useRef({ water: 0, sleep: 0, flow: '' as Flow, mood: 0, extra: {} as Partial<DayInventoryValues> });

  const wellnessTopicId = useMemo(
    () => allTopics.find(t => t.name.toLowerCase() === 'wellness')?.id ?? null,
    [allTopics],
  );

  // doSaveRef — the debounce timer always calls the latest version (no stale closures)
  const doSaveRef = useRef<() => Promise<void>>(async () => {});
  doSaveRef.current = async () => {
    const { water: w, sleep: s, flow: f, mood: m, extra } = latestRef.current;
    // "Your day" answers are written once; after that they live on the entry
    latestRef.current = { ...latestRef.current, extra: {} };
    // Scan the store directly in case the effect hasn't synced the id yet (prevents duplicates)
    if (!entryIdRef.current) {
      const existing = useEntriesStore.getState().decryptedEntries
        .find(e => isTodaysCheckIn(e.metadata as Record<string, unknown>, today));
      if (existing) entryIdRef.current = existing.id;
    }
    let topicId = wellnessTopicId;
    if (!topicId) {
      try {
        const created = await topicsApi.create({ name: 'Wellness', icon: 'heart' });
        setTopics([...useEntriesStore.getState().allTopics, created]);
        topicId = created.id;
      } catch { topicId = null; }
    }
    const prevCf = entryIdRef.current
      ? ((useEntriesStore.getState().decryptedEntries.find(e => e.id === entryIdRef.current)?.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown> | undefined) ?? {}
      : {};
    const metadata: Record<string, unknown> = {
      _widgetType: 'wellness-checkin',
      _customFields: {
        sleepQuality: 0, ...prevCf, ...extra,
        date: today, waterGlasses: w, waterGoal: WATER_GOAL, ...moodFields(m), sleepHours: s,
        periodToday: f !== '', flowIntensity: f,
      },
    };
    if (topicId) metadata._taxonomyId = topicId;
    try {
      const existingId = entryIdRef.current;
      const encrypted = existingId
        ? { ...(await encryptPost(existingId, '', metadata)), id: existingId }
        : await encryptNewPost('', metadata);
      const payload = {
        id: encrypted.id,
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        isEncrypted: true as const,
        taxonomyIds: topicId ? [topicId] : [] as number[],
      };
      if (existingId) {
        await entriesApi.update(existingId, payload);
        // Changes made while this save was on its way are already in the store
        // (optimistic) — keep them rather than putting back what was sent
        const nowMeta = useEntriesStore.getState().decryptedEntries.find(e => e.id === existingId)?.metadata as Record<string, unknown> | undefined;
        const nowCf = (nowMeta?._customFields as Record<string, unknown> | undefined) ?? {};
        updateDecryptedEntry(existingId, {
          content: '',
          metadata: { ...metadata, _customFields: { ...(metadata._customFields as Record<string, unknown>), ...nowCf } },
        });
      } else {
        const result = await entriesApi.create(payload);
        const id = result.id as number;
        entryIdRef.current = id;
        const created = new Date(result.createdAt as string);
        addDecryptedEntry({ id, content: '', metadata, isEncrypted: true, createdAt: created, updatedAt: created });
      }
    } catch (err) {
      console.error('Failed to save wellness check-in:', err);
    }
  };

  const scheduleSave = (next: Partial<{ water: number; sleep: number; flow: Flow; mood: number; extra: Partial<DayInventoryValues> }>) => {
    latestRef.current = { water, sleep, flow, mood, ...next, extra: { ...(entry ? {} : pendingDay), ...latestRef.current.extra, ...next.extra } };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { debounceRef.current = null; void doSaveRef.current(); }, 600);
  };

  const optimistic = (updates: Record<string, unknown>) => {
    if (!entryIdRef.current) return;
    const e = useEntriesStore.getState().decryptedEntries.find(x => x.id === entryIdRef.current);
    if (!e) return;
    const meta = e.metadata as Record<string, unknown>;
    const cf = (meta._customFields as Record<string, unknown>) ?? {};
    updateDecryptedEntry(entryIdRef.current, { metadata: { ...meta, _customFields: { ...cf, ...updates } } });
  };

  const setWater = (v: number) => {
    if (entry) optimistic({ waterGlasses: v }); else setPendingWater(v);
    scheduleSave({ water: v });
  };

  const setMood = (v: number) => {
    if (entry) optimistic(moodFields(v)); else setPendingMood(v);
    scheduleSave({ mood: v });
  };

  const setSleep = (v: number) => {
    if (entry) optimistic({ sleepHours: v }); else setPendingSleep(v);
    scheduleSave({ sleep: v });
  };

  const setFlow = (v: Flow) => {
    if (entry) optimistic({ periodToday: v !== '', flowIntensity: v }); else setPendingFlow(v);
    scheduleSave({ flow: v });
  };

  const setDay = (patch: Partial<DayInventoryValues>) => {
    if (entry) optimistic(patch); else setPendingDay(p => ({ ...p, ...patch }));
    scheduleSave({ extra: patch });
  };

  const nextPeriod = prediction
    ? (strip
      // The strip (both dashboards): short, beside the word Cycle
      ? `Estimated: ${new Date(`${prediction.next}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${prediction.next < today ? ' (late)' : ''}`
      : `Next period est. ${new Date(`${prediction.next}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${prediction.next < today ? ' (late)' : ''}`)
    : 'Log a period day to estimate the next';

  // Settings → Features → Cycle tracking: off hides the Cycle cell
  const cycleTracking = useUIStore(s => s.cycleTrackingEnabled);
  const panel = (
    <WellnessPanel
      water={water} sleep={sleep} mood={mood} flow={flow}
      onWater={setWater} onSleep={setSleep} onMood={setMood} onFlow={setFlow}
      cycleNote={nextPeriod}
      showCycle={cycleTracking}
      compact={!quad && !strip}
      strip={strip}
      flat={strip && (foldable || titled)}
      quad={!strip && quad && (bare || foldable || !title)}
      row={!strip && !!title && !bare && !foldable}
      smallFaces={bare}
      footer={<DayInventory values={day} onChange={setDay} inside />}
    />
  );
  // Titled (the home dashboard's widget card): its title row, then the strip
  if (titled) return (
    <Titled aria-label={title ?? 'Wellness check-in'}>
      <TitleRow><h2>{title ?? 'Wellness check-in'}</h2></TitleRow>
      {panel}
    </Titled>
  );
  // Foldable (the Health dashboard): the four squares in a panel with its title, folded by its chevron
  if (foldable) return (
    <DashPanel aria-label={title ?? 'Wellness check-in'}>
      <DashPanelHead title={title ?? 'Wellness check-in'} />
      {panel}
    </DashPanel>
  );
  // Bare (home dashboard): no panel or heading; a grid so the card stretches
  // to the height of the card beside it
  if (bare) return (
    <section aria-label={title ?? 'Wellness check-in'} style={{ display: 'grid' }}>{panel}</section>
  );
  if (!title) return panel;
  return (
    <DashPanel aria-label={title}>
      <DashPanelHead title={title} />
      {panel}
    </DashPanel>
  );
}
