import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { entries as entriesApi, topics as topicsApi } from '../../services/api.js';
import { toDateStr } from '../../utils/dateUtils.js';
import { predictNextPeriod } from '../../utils/cyclePrediction.js';

const WATER_GOAL = 8;
const SLEEP_GOAL = 10;
const MOOD_ICONS = ['mood-1', 'mood-2', 'mood-3', 'mood-4', 'mood-5'] as const;
const MOOD_LABELS = ['Very sad', 'Sad', 'Neutral', 'Good', 'Great'] as const;
const FLOW_OPTIONS = ['spotting', 'light', 'medium', 'heavy'] as const;
type FlowIntensity = typeof FLOW_OPTIONS[number] | '';
const FLOW_INDEX: Record<FlowIntensity, number> = { '': 0, spotting: 1, light: 2, medium: 3, heavy: 4 };

/* ── Styled ── */

/* Water, mood, sleep and period side by side; two-up on narrow desktops/tablets; stacked on phones. */
const Rows = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
  @media (max-width: 1100px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 768px) { grid-template-columns: minmax(0, 1fr); gap: 0; }
`;

const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  @media (max-width: 768px) {
    padding: 14px 0;
    & + & { border-top: 1px solid var(--border-subtle); }
    &:first-child { padding-top: 0; }
    &:last-child { padding-bottom: 0; }
  }
`;

const RowLabel = styled.div`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary);
`;

const Taps = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
`;

/* Water (8), sleep (10) and mood (5) sit in two rows — 4, 5 and 3 across */
const IconGrid = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, auto);
  gap: 2px 4px;
`;

const TapBtn = styled.button<{ $filled: boolean }>`
  background: none;
  border: none;
  padding: 4px 2px;
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ $filled }) => ($filled ? 'var(--color-accent)' : 'var(--border-strong)')};
  transition: color 120ms ease, transform 100ms ease;
  &:hover { transform: scale(1.15); }
  &:active { transform: scale(0.88); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:hover, &:active { transform: none; } }
`;

const MoodBtn = styled(TapBtn)`
  padding: 2px;
`;

const Prediction = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  font-style: italic;
  font-weight: 300;
  color: var(--text-secondary);
  margin: 0;
`;

const Count = styled.span`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-secondary);
  margin-left: 8px;
  text-transform: capitalize;
`;

/* ── Helpers ── */

function isTodaysCheckIn(meta: Record<string, unknown>, day: string): boolean {
  if (meta._widgetType !== 'wellness-checkin') return false;
  const cf = meta._customFields as Record<string, unknown> | undefined;
  return cf?.date === day;
}

/* ── Component ── */

/**
 * Today's wellness check-in — tap-to-fill water glasses, mood, sleep hours
 * and period flow, with the next expected period. Saves the same `wellness-checkin` entry the journal edits
 * (debounced 600ms, optimistic store updates), so values stay in sync both
 * ways.
 */
export function WellnessCheckIn() {
  const { encryptPost } = useEncryption();
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
  const [pendingFlow, setPendingFlow] = useState<FlowIntensity>('');

  const water = stored ? (Number(stored.waterGlasses) || 0) : pendingWater;
  const sleep = stored ? (Number(stored.sleepHours) || 0) : pendingSleep;
  const flow = stored ? ((stored.flowIntensity as FlowIntensity) || '') : pendingFlow;
  const mood = stored ? (Number(stored.moodScore) || 0) : pendingMood;

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
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);
  const latestRef = useRef({ water: 0, sleep: 0, flow: '' as FlowIntensity, mood: 0 });

  const wellnessTopicId = useMemo(
    () => allTopics.find(t => t.name.toLowerCase() === 'wellness')?.id ?? null,
    [allTopics],
  );

  // doSaveRef — the debounce timer always calls the latest version (no stale closures)
  const doSaveRef = useRef<() => Promise<void>>(async () => {});
  doSaveRef.current = async () => {
    const { water: w, sleep: s, flow: f, mood: m } = latestRef.current;
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
        sleepQuality: 0, ...prevCf,
        date: today, waterGlasses: w, waterGoal: WATER_GOAL, moodScore: m, sleepHours: s,
        periodToday: f !== '', flowIntensity: f,
      },
    };
    if (topicId) metadata._taxonomyId = topicId;
    try {
      const encrypted = await encryptPost('', metadata);
      const payload = {
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        isEncrypted: true as const,
        taxonomyIds: topicId ? [topicId] : [] as number[],
      };
      if (entryIdRef.current) {
        await entriesApi.update(entryIdRef.current, payload);
        updateDecryptedEntry(entryIdRef.current, { content: '', metadata });
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

  const scheduleSave = (next: Partial<{ water: number; sleep: number; flow: FlowIntensity; mood: number }>) => {
    latestRef.current = { water, sleep, flow, mood, ...next };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void doSaveRef.current(); }, 600);
  };

  const optimistic = (updates: Record<string, unknown>) => {
    if (!entryIdRef.current) return;
    const e = useEntriesStore.getState().decryptedEntries.find(x => x.id === entryIdRef.current);
    if (!e) return;
    const meta = e.metadata as Record<string, unknown>;
    const cf = (meta._customFields as Record<string, unknown>) ?? {};
    updateDecryptedEntry(entryIdRef.current, { metadata: { ...meta, _customFields: { ...cf, ...updates } } });
  };

  const tapWater = (i: number) => {
    const v = i < water ? i : i + 1;
    if (entry) optimistic({ waterGlasses: v }); else setPendingWater(v);
    scheduleSave({ water: v });
  };

  const tapMood = (score: number) => {
    const v = mood === score ? 0 : score;
    if (entry) optimistic({ moodScore: v }); else setPendingMood(v);
    scheduleSave({ mood: v });
  };

  const tapSleep = (i: number) => {
    const v = i < sleep ? i : i + 1;
    if (entry) optimistic({ sleepHours: v }); else setPendingSleep(v);
    scheduleSave({ sleep: v });
  };

  const tapFlow = (f: FlowIntensity) => {
    const v: FlowIntensity = flow === f ? '' : f;
    if (entry) optimistic({ periodToday: v !== '', flowIntensity: v }); else setPendingFlow(v);
    scheduleSave({ flow: v });
  };

  return (
    <Rows>
      <Row>
        <RowLabel>Water</RowLabel>
        <Taps>
          <IconGrid $cols={Math.ceil(WATER_GOAL / 2)}>
            {Array.from({ length: WATER_GOAL }, (_, i) => (
              <TapBtn key={i} type="button" $filled={i < water} onClick={() => tapWater(i)}
                aria-label={`${i + 1} glass${i ? 'es' : ''} of water`} aria-pressed={i < water}>
                <Icon name="droplet" size={18} strokeWidth={1.6} />
              </TapBtn>
            ))}
          </IconGrid>
          <Count>{water}/{WATER_GOAL}</Count>
        </Taps>
      </Row>

      <Row>
        <RowLabel>Mood</RowLabel>
        <Taps>
          {/* Five faces: a row of three, then two */}
          <IconGrid $cols={3}>
            {MOOD_ICONS.map((name, i) => (
              <MoodBtn key={name} type="button" $filled={mood === i + 1} onClick={() => tapMood(i + 1)}
                aria-label={`Mood: ${MOOD_LABELS[i]}`} aria-pressed={mood === i + 1}>
                <Icon name={name} size={22} strokeWidth={1.8} />
              </MoodBtn>
            ))}
          </IconGrid>
          <Count>{mood ? MOOD_LABELS[mood - 1] : '—'}</Count>
        </Taps>
      </Row>

      <Row>
        <RowLabel>Sleep</RowLabel>
        <Taps>
          <IconGrid $cols={Math.ceil(SLEEP_GOAL / 2)}>
            {Array.from({ length: SLEEP_GOAL }, (_, i) => (
              <TapBtn key={i} type="button" $filled={i < sleep} onClick={() => tapSleep(i)}
                aria-label={`${i + 1} hour${i ? 's' : ''} of sleep`} aria-pressed={i < sleep}>
                <Icon name="moon" size={18} strokeWidth={1.6} />
              </TapBtn>
            ))}
          </IconGrid>
          <Count>{sleep > 0 ? `${sleep}h` : '—'}</Count>
        </Taps>
      </Row>

      <Row>
        <RowLabel>Period</RowLabel>
        <Taps>
          {FLOW_OPTIONS.map((f, i) => (
            <TapBtn key={f} type="button" $filled={i < FLOW_INDEX[flow]} onClick={() => tapFlow(f)}
              aria-label={`Flow: ${f}`} aria-pressed={flow === f}>
              <Icon name="droplet" size={18} strokeWidth={1.6} />
            </TapBtn>
          ))}
          <Count>{flow || 'None'}</Count>
        </Taps>
        <Prediction>
          {prediction
            ? `Estimated Next Period: ${new Date(`${prediction.next}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${prediction.next < today ? ' (late)' : ''}`
            : 'Estimated Next Period: log a period day to estimate'}
        </Prediction>
      </Row>
    </Rows>
  );
}
