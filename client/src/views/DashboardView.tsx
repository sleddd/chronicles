import { useEffect, useMemo, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { Icon } from '../components/atoms/core/Icon.jsx';
import { Checkbox } from '../components/atoms/core/Checkbox.jsx';
import { Toggle } from '../components/atoms/Toggle.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { WellnessCheckIn } from '../components/organisms/WellnessCheckIn.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import { useFinance } from '../hooks/useFinance.js';
import { useOpenInJournal } from '../hooks/useOpenInJournal.js';
import { useTodayDoses, type DoseGroup } from '../hooks/useTodayDoses.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { entries as entriesApi, topics as topicsApi, settings as settingsApi } from '../services/api.js';
import { stripHtml, builtinEntryName } from '../utils/stripHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import { addDays, billOccurrences, formatCents } from '../utils/finance.js';
import { MENU_SLOTS, latestOpenList, menuDays } from '../utils/kitchen.js';
import { dailyQuote, greeting } from '../utils/dailyQuote.js';
import { currentWeather, describeWeather, findPlace, hoursFromLocal, type CurrentWeather, type Place } from '../utils/weather.js';
import type { DecryptedPost } from '@shared/crypto/types';
import type { ShoppingItem } from '../types/fields.js';
import type { PriorityItem } from '../components/molecules/fields/PrioritiesFields.js';

/* The home dashboard (/dashboard — not the default page; the journal is home):
   the date and home weather over the greeting and a Light | Dark switch; the
   daily quote (or, with the quote off, a "Next up" card of the next medication
   doses) beside the wellness check-in; a one-line world-clocks strip ("All N
   cities" opens the grid); then two columns — Today's priorities and Coming
   up | On the menu, Medications and the shopping list. "Customize view" picks
   the sections and the cities (kept in the encrypted `dashboardConfig`
   setting). */

/* ── Config ── */

type SectionKey = 'nextUp' | 'wellness' | 'clocks' | 'quote' | 'priorities' | 'comingUp' | 'menu' | 'meds' | 'shopping';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'nextUp', label: 'Next up (when the quote is off)' },
  { key: 'wellness', label: 'Wellness check-in' },
  { key: 'clocks', label: 'World clocks & weather' },
  { key: 'quote', label: 'Quote of the day' },
  { key: 'priorities', label: "Today's priorities" },
  { key: 'comingUp', label: 'Coming up' },
  { key: 'menu', label: 'On the menu' },
  { key: 'meds', label: 'Medications' },
  { key: 'shopping', label: 'Shopping list' },
];

interface DashboardConfig {
  hidden: SectionKey[];
  /** The first is home: its weather is in the greeting and it's marked Local */
  places: Place[];
  /** The full world-clock grid is open under the one-line strip */
  clocksExpanded?: boolean;
}

const DEFAULT_CONFIG: DashboardConfig = { hidden: [], places: [] };

/* ── Layout ── */

const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1150px;
  margin: 0 auto;
  padding: 44px 24px 64px;
  @media (max-width: 768px) { padding: 28px 16px 48px; }
`;

const Head = styled.div`
  margin-top: 20px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px 40px;
  @media (max-width: 640px) { grid-template-columns: minmax(0, 1fr); }
`;

/* "Good evening, Alex" over "Saturday, October 17 · 55° and clear in Portland" */
const DateBlock = styled.div`
  min-width: 0;
`;

const Eyebrow = styled.div`
  margin-top: 14px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-style: italic;
  color: var(--text-muted);
`;

const Hello = styled.h1`
  margin: 0;
  font-family: var(--font-display);
  font-size: 56px;
  font-weight: 300;
  line-height: 1.1;
  color: var(--text-primary);
  text-wrap: balance;
  @media (max-width: 480px) { font-size: 38px; }
`;

/* Light | Dark (an outlined pair, the chosen one on the grey --bg-active) beside
   a neutral "Customize view" pill */
const HeadActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  @media (max-width: 640px) { padding: 34px 0 0; }
`;

/* Customize view: the neutral pill, in sentence case at normal spacing (both themes) */
const CustomizeBtn = styled(PillButton)`
  && { text-transform: none; letter-spacing: normal; font-size: 14px; font-weight: 500; }
`;

const ThemeSwitch = styled.div`
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

const ThemeOpt = styled.button<{ $on: boolean }>`
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: 7px;
  background: ${({ $on }) => ($on ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: ${({ $on }) => ($on ? 600 : 400)};
  color: ${({ $on }) => ($on ? 'var(--text-primary)' : 'var(--text-soft)')};
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const LinkBtn = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-accent-link);
  cursor: pointer;
  white-space: nowrap;
  &:hover { text-decoration: underline; }
`;

const OutlineBtn = styled.button`
  height: 38px;
  padding: 0 16px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  &:hover { border-color: var(--control-border); }
`;

/* Next up | Wellness check-in */
const Hero = styled.div<{ $single: boolean }>`
  display: grid;
  grid-template-columns: ${({ $single }) => ($single ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))')};
  gap: 24px;
  margin-top: 56px;
  @media (max-width: 640px) { margin-top: 36px; }
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); }
`;

const NextCard = styled.section`
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 28px 32px;
  border-radius: 14px;
  background: var(--bg-panel);
  font-family: var(--font-sans);
  @media (max-width: 480px) { padding: 22px 20px; }
`;

const NextTop = styled.div<{ $plain?: boolean }>`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 15px;
  /* $plain (Daily quote): a quiet grey label at 400 instead of the bold accent */
  b { font-weight: ${({ $plain }) => ($plain ? 400 : 600)}; color: ${({ $plain }) => ($plain ? 'var(--text-muted)' : 'var(--color-accent-link)')}; }
  span { color: var(--text-muted); }
`;

const NextTitle = styled.h2`
  margin: 22px 0 0;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 300;
  line-height: 1.2;
  color: var(--text-primary);
`;

const NextList = styled.p`
  margin: 16px 0 0;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text-soft);
`;

const NextActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: auto;
  padding-top: 24px;
`;

/* World clocks: a one-line strip in a grey --bg-panel card (home first, in the accent,
   then the others as many as fit); "All N cities" opens the grid — four across, wrapping */
const MAX_PLACES = 8;

const Clocks = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 28px 24px;
  padding: 22px 0 26px;
  border-top: 1px solid var(--border-card); /* splits the open grid from the strip */
  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const ClocksSection = styled.section`
  margin-top: 32px;
  padding: 0 24px;
  border-radius: 14px;
  background: var(--bg-panel);
  @media (max-width: 480px) { padding: 0 16px; }
`;

const Strip = styled.div`
  display: flex;
  align-items: center;
  gap: 40px;
  min-height: 64px;
  font-family: var(--font-sans);
  font-size: 16px;
  & > b { flex: none; font-weight: 500; color: var(--text-primary); }
  @media (max-width: 640px) { gap: 20px; }
`;

const StripCities = styled.div`
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 32px;
  height: 24px;
  line-height: 24px;
  overflow: hidden;
  min-width: 0;
`;

const StripCity = styled.span<{ $home?: boolean }>`
  white-space: nowrap;
  color: ${({ $home }) => ($home ? 'var(--color-accent-link)' : 'var(--text-muted)')};
  strong { margin-left: 10px; font-weight: 500; color: var(--text-primary); }
  small { margin-left: 8px; font-size: 14px; color: var(--text-hint); }
`;

const Clock = styled.div`
  min-width: 0;
`;

const ClockHead = styled.div<{ $home: boolean }>`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  b { font-weight: 500; color: ${({ $home }) => ($home ? 'var(--color-accent-link)' : 'var(--text-secondary)')}; }
  span { color: var(--text-muted); }
`;

const ClockTime = styled.div`
  margin: 8px 0 6px;
  font-family: var(--font-display);
  font-size: 40px;
  font-weight: 300;
  line-height: 1;
  color: var(--text-secondary);
  small { margin-left: 6px; font-family: var(--font-sans); font-size: 14px; color: var(--text-muted); }
`;

const ClockWeather = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-soft);
  & > span:first-child { color: var(--color-accent); }
`;

/* Daily quote: in the Next up card's place (the grey panel) when it's on */
/* The quote and its author as one block, centred vertically in the card,
   left-aligned */
const QuoteBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  text-align: left;
  padding: 18px 0 8px;
`;

const QuoteText = styled.blockquote`
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 300;
  font-style: italic;
  line-height: 1.35;
  color: var(--text-primary);
  text-wrap: balance;
  @media (max-width: 480px) { font-size: 23px; }
`;

const QuoteBy = styled.p`
  margin: 16px 0 0;
  font-size: 15px;
  color: var(--text-muted);
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 56px;
  margin-top: 44px;
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); }
`;

const Col = styled.div`
  display: flex;
  flex-direction: column;
  gap: 44px;
  min-width: 0;
`;

const SectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-default);
  h2 { margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 300; color: var(--text-secondary); }
  span { font-family: var(--font-sans); font-size: 13px; color: var(--text-muted); }
  button { padding: 0; border: none; background: none; font-family: var(--font-sans); font-size: 14px; font-weight: 600; color: var(--color-accent-link); cursor: pointer; }
  button:hover { text-decoration: underline; }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 52px;
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-secondary);
`;

const Muted = styled.p`
  margin: 14px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

/* ── Customize panel ── */

const Customize = styled.div`
  margin-top: 24px;
  padding: 20px 22px 22px;
  background: var(--bg-panel);
  border-radius: 12px;
  font-family: var(--font-sans);
  h3 { margin: 0 0 12px; font-size: 14px; font-weight: 500; color: var(--text-soft); }
`;

const ToggleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 32px;
  margin-bottom: 24px;
  label { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; color: var(--text-secondary); }
  @media (max-width: 640px) { grid-template-columns: minmax(0, 1fr); }
`;

const PlaceRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  font-size: 14px;
  color: var(--text-secondary);
  & + & { border-top: 1px solid var(--border-subtle); }
  small { margin-left: 8px; color: var(--text-muted); }
  button { display: inline-flex; padding: 4px; border: none; background: none; color: var(--text-muted); cursor: pointer; }
  button:hover { color: var(--color-danger); }
`;

const AddPlace = styled.form`
  display: flex;
  gap: 8px;
  margin-top: 12px;
  input {
    flex: 1;
    min-width: 0;
    height: 38px;
    padding: 0 14px;
    border: 1px solid var(--border-card) !important;
    border-radius: 10px;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
  }
  input:focus { border-color: var(--color-accent) !important; }
`;

/* ── Helpers ── */

function topicIdByName(topics: { id: number; name: string }[], ...names: string[]): number | undefined {
  return topics.find(t => names.includes(t.name.toLowerCase()))?.id;
}

function cfOf(e: DecryptedPost): Record<string, unknown> {
  return ((e.metadata as Record<string, unknown> | undefined)?._customFields as Record<string, unknown>) ?? {};
}

function time12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Save an entry's custom fields (optimistic; rolled back on failure). */
function useSaveFields() {
  const { encryptPost } = useEncryption();
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  return async (entry: DecryptedPost, cf: Record<string, unknown>, content = entry.content) => {
    const prev = { content: entry.content, metadata: entry.metadata };
    const metadata: Record<string, unknown> = { ...((entry.metadata as Record<string, unknown>) ?? {}), _customFields: cf };
    updateDecryptedEntry(entry.id, { content, metadata });
    try {
      const tid = metadata._taxonomyId as number | undefined;
      const enc = await encryptPost(content, metadata);
      await entriesApi.update(entry.id, {
        contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
        metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
        taxonomyIds: tid ? [tid] : [],
      });
    } catch (err) {
      console.error('Dashboard save failed:', err);
      updateDecryptedEntry(entry.id, prev);
    }
  };
}

/* ── Sections ── */

function clockParts(tz: string, now: Date): [string, string] {
  const [t, ampm] = now.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).split(' ');
  return [t, ampm ?? ''];
}

function WorldClocks({ places, now, open, onToggle }: { places: Place[]; now: Date; open: boolean; onToggle: () => void }) {
  const [weather, setWeather] = useState<Record<string, CurrentWeather>>({});
  useEffect(() => {
    let live = true;
    for (const p of places) {
      currentWeather(p).then(w => { if (live) setWeather(prev => ({ ...prev, [p.name]: w })); }).catch(() => {});
    }
    return () => { live = false; };
  }, [places]);

  return (
    <ClocksSection aria-label="World clocks">
      <Strip>
        <b>World clocks</b>
        <StripCities>
          {places.slice(0, MAX_PLACES).map((p, i) => {
            const [t, ampm] = clockParts(p.timezone, now);
            const w = weather[p.name];
            return (
              <StripCity key={`${p.name}-${i}`} $home={i === 0}>
                {p.name}<strong>{t} {ampm}</strong>{w && <small>{w.tempF}°</small>}
              </StripCity>
            );
          })}
        </StripCities>
        <LinkBtn type="button" aria-expanded={open} onClick={onToggle}>
          {open ? 'Show less' : `All ${places.length} ${places.length === 1 ? 'city' : 'cities'}`}
        </LinkBtn>
      </Strip>
      {open && (
        <Clocks>
          {places.slice(0, MAX_PLACES).map((p, i) => {
            const [t, ampm] = clockParts(p.timezone, now);
            const diff = hoursFromLocal(p.timezone, now);
            const w = weather[p.name];
            const d = w ? describeWeather(w.code, w.isDay) : null;
            return (
              <Clock key={`${p.name}-${i}`}>
                <ClockHead $home={i === 0}><b>{p.name}</b><span>{diff === 0 ? 'Local' : `${diff > 0 ? '+' : ''}${diff}h`}</span></ClockHead>
                <ClockTime>{t}<small>{ampm}</small></ClockTime>
                <ClockWeather>
                  {d ? <><MaterialIcon $size={18} aria-hidden="true">{d.icon}</MaterialIcon><span>{w!.tempF}°F · {d.label}</span></> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </ClockWeather>
              </Clock>
            );
          })}
        </Clocks>
      )}
    </ClocksSection>
  );
}

/* Next up: the next medication doses still to take today (upcoming first,
   else the latest overdue), with Mark all taken and Snooze 30 min. Snoozes
   are a per-browser convenience (localStorage). */
const SNOOZE_KEY = 'dashboard-snooze-v1';
const SNOOZE_MS = 30 * 60_000;

function readSnoozes(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}') as Record<string, number>; } catch { return {}; }
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function spanLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

function partOfDay(hhmm: string): string {
  const h = Math.floor(minutesOf(hhmm) / 60);
  if (h < 5) return 'Night';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 22) return 'Evening';
  return 'Night';
}

type Doses = ReturnType<typeof useTodayDoses>;

/** The dose group the Next up card shows, or null when nothing is due */
function nextGroup(groups: DoseGroup[], now: Date, snoozes: Record<string, number>, today: string): DoseGroup | null {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const open = groups.filter(g => g.pending.length > 0 && !((snoozes[`${today}|${g.time}`] ?? 0) > now.getTime()));
  return open.find(g => minutesOf(g.time) >= nowMin) ?? open.filter(g => minutesOf(g.time) < nowMin).at(-1) ?? null;
}

function NextUp({ doses, now }: { doses: Doses; now: Date }) {
  const navigate = useNavigate();
  const [snoozes, setSnoozes] = useState(readSnoozes);
  const [busy, setBusy] = useState(false);
  const today = toDateStr(now);
  const g = nextGroup(doses.groups, now, snoozes, today);

  const snooze = (time: string) => {
    const next = { ...Object.fromEntries(Object.entries(snoozes).filter(([k]) => k.startsWith(today))), [`${today}|${time}`]: Date.now() + SNOOZE_MS };
    setSnoozes(next);
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  if (!g) return (
    <NextCard aria-label="Next up">
      <NextTop><b>Next up</b>{doses.total > 0 && <span>{doses.taken} of {doses.total} taken</span>}</NextTop>
      <NextTitle>{doses.total > 0 ? 'All caught up' : 'No medications scheduled'}</NextTitle>
      <NextList>{doses.total > 0 ? 'Nothing else is due right now.' : 'Add reminder times to a medication and its doses show up here.'}</NextList>
      <NextActions><PillButton type="button" $variant="neutral" onClick={() => navigate('/health')}>Health</PillButton></NextActions>
    </NextCard>
  );

  const diff = minutesOf(g.time) - (now.getHours() * 60 + now.getMinutes());
  const when = diff >= 0 ? `Next up · ${diff === 0 ? 'now' : `in ${spanLabel(diff)}`}` : `Overdue · ${spanLabel(-diff)} ago`;
  return (
    <NextCard aria-label="Next up">
      <NextTop><b>{when}</b><span>{time12(g.time)}</span></NextTop>
      <NextTitle>{partOfDay(g.time)} medications</NextTitle>
      <NextList>{g.pending.map(d => d.medicationName).join(', ')}</NextList>
      {doses.error && <NextList role="alert" style={{ color: 'var(--color-danger)' }}>{doses.error}</NextList>}
      <NextActions>
        <PillButton type="button" disabled={busy} onClick={async () => { setBusy(true); await doses.takeAll(g.pending); setBusy(false); }}>
          {busy ? 'Saving…' : 'Mark all taken'}
        </PillButton>
        <PillButton type="button" $variant="neutral" onClick={() => snooze(g.time)}>Snooze 30 min</PillButton>
      </NextActions>
    </NextCard>
  );
}

/* Medications: today's doses as one flat list by time — round tick, the
   name, "Taken 1:35 PM" or the scheduled time on the right */
const DoseName = styled.span<{ $taken: boolean }>`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ $taken }) => ($taken ? 'var(--text-muted)' : 'var(--text-secondary)')};
`;

const DoseWhen = styled.span`
  flex: none;
  font-size: 14px;
  color: var(--text-muted);
`;

function Medications({ doses }: { doses: Doses }) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState<string | null>(null);
  return (
    <section aria-label="Medications">
      <SectionHead>
        <h2>Medications</h2>
        {doses.total > 0 ? <span>{doses.taken} of {doses.total} taken</span> : <button type="button" onClick={() => navigate('/health/meds')}>Med list</button>}
      </SectionHead>
      {doses.total === 0 ? <Muted>No medications scheduled today.</Muted> : doses.scheduled.map((d, i) => {
        const key = `${d.medicationPostId}-${d.time}`;
        const taken = doses.isTaken(d);
        const log = doses.logOf(d);
        return (
          <Row key={`${key}-${i}`}>
            <Checkbox checked={taken} disabled={saving === key}
              aria-label={taken ? `Mark ${d.medicationName} as not taken` : `Mark ${d.medicationName} as taken`}
              onChange={async () => { setSaving(key); await doses.setTaken(d, !taken); setSaving(null); }} />
            <DoseName $taken={taken}>{d.medicationName}{d.dosage ? ` ${d.dosage}` : ''}</DoseName>
            <DoseWhen>{taken && log?.takenAt ? `Taken ${log.takenAt}` : time12(d.time)}</DoseWhen>
          </Row>
        );
      })}
    </section>
  );
}

/* Today's priorities: numbered, a round tick to finish, "Add a priority" */
const PNum = styled.span<{ $done?: boolean }>`
  width: 18px;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  color: ${({ $done }) => ($done ? 'var(--color-accent-link)' : 'var(--color-accent-link)')};
`;

const PText = styled.span<{ $done?: boolean }>`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ $done }) => ($done ? 'var(--text-muted)' : 'var(--text-secondary)')};
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
`;


const BareInput = styled.input`
  && {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-secondary);
  }
  &::placeholder { color: var(--text-hint); }
`;

/** Today's Priorities-topic entry and its items */
function useTodayPriorities() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const today = toDateStr(new Date());
  const tid = topicIdByName(allTopics, 'priorities');
  const entry = useMemo(() => entries.find(e =>
    (e.metadata as Record<string, unknown>)?._taxonomyId === tid && tid !== undefined
    && toDateStr(e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt)) === today), [entries, tid, today]);
  const items = ((entry ? cfOf(entry).priorities : undefined) as PriorityItem[] | undefined) ?? [];
  return { entry, items, tid };
}

function Priorities() {
  const setTopics = useEntriesStore(s => s.setTopics);
  const addDecryptedEntry = useEntriesStore(s => s.addDecryptedEntry);
  const { encryptPost } = useEncryption();
  const save = useSaveFields();
  const [draft, setDraft] = useState('');
  const { entry, items, tid } = useTodayPriorities();
  const done = items.filter(i => i.done).length;
  const textOf = (list: PriorityItem[]) => `<p>${list.map(i => i.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join(' · ')}</p>`;

  const write = async (next: PriorityItem[]) => {
    if (entry) return save(entry, { ...cfOf(entry), priorities: next }, textOf(next));
    let topicId = tid;
    if (topicId === undefined) {
      const t = await topicsApi.create({ name: 'Priorities', icon: 'flag' });
      setTopics([...useEntriesStore.getState().allTopics, t]);
      topicId = t.id;
    }
    const metadata = { _taxonomyId: topicId, _customFields: { priorities: next } };
    const content = textOf(next);
    const enc = await encryptPost(content, metadata);
    const res = await entriesApi.create({
      contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
      metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
      isEncrypted: true, taxonomyIds: [topicId],
    });
    addDecryptedEntry({ id: res.id as number, content, metadata, isEncrypted: true,
      createdAt: new Date(res.createdAt as string), updatedAt: new Date((res.updatedAt || res.createdAt) as string) });
  };

  const add = () => {
    const text = draft.trim();
    if (!text || items.length >= 5) return;
    setDraft('');
    void write([...items, { id: crypto.randomUUID(), text, done: false }]);
  };

  return (
    <section aria-label="Today's priorities">
      <SectionHead><h2>Today's priorities</h2>{items.length > 0 && <span>{done} of {items.length} done</span>}</SectionHead>
      {items.map((p, i) => (
        <Row key={p.id}>
          <PNum>{i + 1}</PNum>
          <PText $done={p.done}>{p.text}</PText>
          <Checkbox checked={p.done} aria-label={p.done ? `Mark "${p.text}" not done` : `Mark "${p.text}" done`}
            onChange={() => void write(items.map(x => (x.id === p.id ? { ...x, done: !x.done } : x)))} />
        </Row>
      ))}
      {items.length < 5 && (
        <Row>
          <PNum style={{ color: 'var(--text-faint)' }}>{items.length + 1}</PNum>
          <BareInput value={draft} placeholder="Add a priority" aria-label="Add a priority"
            onChange={e => setDraft(e.target.value)} onBlur={add}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        </Row>
      )}
    </section>
  );
}

const MealRow = styled(Row)`
  span:first-child { width: 120px; flex: none; font-size: 14px; color: var(--text-muted); }
`;

function Menu() {
  const navigate = useNavigate();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const today = toDateStr(new Date());
  const plan = useMemo(() => menuDays(entries, topicIdByName(allTopics, 'menu plan')).get(today), [entries, allTopics, today]);
  return (
    <section aria-label="On the menu">
      <SectionHead><h2>On the menu</h2><button type="button" onClick={() => navigate('/menu')}>Week</button></SectionHead>
      {MENU_SLOTS.filter(s => s.key !== 'snack' || plan?.snack?.mealName || plan?.snack?.recipeName).map(s => {
        const slot = plan?.[s.key];
        const name = (slot?.mealName || slot?.recipeName || '').trim();
        return (
          <MealRow key={s.key}>
            <span>{s.label}</span>
            <span style={name ? undefined : { color: 'var(--text-hint)' }}>{name || 'Nothing planned'}</span>
          </MealRow>
        );
      })}
    </section>
  );
}

/* Coming up: today's medication doses still to take, then events, meetings
   and bills over the next two weeks. The kind is a plain label in its colour
   (no fill, no outline). */
type UpKind = 'event' | 'meeting' | 'bill' | 'meds';
const KindPill = styled.span<{ $kind: UpKind }>`
  flex: none;
  padding: 3px 0 3px 10px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ $kind }) => `color-mix(in srgb, ${KIND_COLOR[$kind]} 62%, var(--text-primary))`};
`;
const KIND_COLOR: Record<UpKind, string> = { event: 'var(--chart-blue)', meeting: 'var(--chart-violet)', bill: 'var(--chart-amber)', meds: 'var(--color-accent)' };
const KIND_LABEL: Record<UpKind, string> = { event: 'Event', meeting: 'Meeting', bill: 'Bill', meds: 'Meds' };

const UpRow = styled(Row)`
  align-items: flex-start;
  padding: 14px 0;
  & > .when { width: 130px; flex: none; padding-top: 2px; font-size: 14px; color: var(--text-muted); }
  & > .what { flex: 1; min-width: 0; cursor: pointer; }
  & > .what small { display: block; margin-top: 4px; font-size: 14px; color: var(--text-muted); }
  @media (max-width: 480px) { & > .when { width: 86px; } }
`;

function whenLabel(day: string, time: string | undefined, today: string): string {
  const t = time ? time12(time) : '';
  if (day === today) return t || 'Today';
  if (day === toDateStr(addDaysLocal(1))) return t ? `Tomorrow ${t}` : 'Tomorrow';
  const d = new Date(day + 'T12:00:00');
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  return t ? `${wd} ${t}` : wd;
}

function addDaysLocal(n: number): Date { const d = new Date(); d.setDate(d.getDate() + n); return d; }

function ComingUp({ financeOn, doses, now }: { financeOn: boolean; doses: Doses; now: Date }) {
  const navigate = useNavigate();
  const openInJournal = useOpenInJournal();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const bills = useFinance('bills', { enabled: financeOn });
  const today = toDateStr(new Date());
  const end = addDays(today, 14);

  const items = useMemo(() => {
    const eventIds = new Set(allTopics.filter(t => ['event', 'events'].includes(t.name.toLowerCase())).map(t => t.id));
    const meetingIds = new Set(allTopics.filter(t => ['meeting', 'meetings'].includes(t.name.toLowerCase())).map(t => t.id));
    const out: { key: string; day: string; time?: string; title: string; sub?: string; kind: UpKind; open: () => void }[] = [];
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const g of doses.groups) {
      if (!g.pending.length || minutesOf(g.time) < nowMin) continue;
      out.push({ key: `m${g.time}`, day: today, time: g.time, title: `${partOfDay(g.time)} medications`,
        sub: `${g.pending.length} ${g.pending.length === 1 ? 'dose' : 'doses'}`, kind: 'meds', open: () => navigate('/health') });
    }
    for (const e of entries) {
      const tid = (e.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
      const kind = tid !== undefined && eventIds.has(tid) ? 'event' : tid !== undefined && meetingIds.has(tid) ? 'meeting' : null;
      if (!kind) continue;
      const cf = cfOf(e);
      const day = String(cf.startDate ?? '');
      if (!day || day < today || day > end) continue;
      const title = (builtinEntryName(cf) || stripHtml(e.content).trim()).slice(0, 80) || 'Untitled';
      const sub = [cf.location, kind === 'meeting' ? cf.meetingTopic : undefined].filter(v => typeof v === 'string' && v.trim()).join(' · ');
      out.push({ key: `e${e.id}`, day, time: cf.allDay ? undefined : (cf.startTime as string | undefined) || undefined, title, sub: sub || undefined, kind, open: () => openInJournal(e.id) });
    }
    if (financeOn) {
      for (const { bill, date } of billOccurrences(bills.records, today, end)) {
        out.push({ key: `b${bill.id}${date}`, day: date, title: bill.name, sub: `${formatCents(bill.amountCents)} due`, kind: 'bill', open: () => navigate('/finance') });
      }
    }
    return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '99').localeCompare(b.time ?? '99')).slice(0, 8);
  }, [entries, allTopics, bills.records, financeOn, today, end, openInJournal, navigate, doses.groups, now]);

  return (
    <section aria-label="Coming up">
      <SectionHead><h2>Coming up</h2><button type="button" onClick={() => navigate('/calendar')}>Calendar</button></SectionHead>
      {items.length === 0 ? <Muted>Nothing in the next two weeks.</Muted> : items.map(it => (
        <UpRow key={it.key}>
          <span className="when">{whenLabel(it.day, it.time, today)}</span>
          <span className="what" role="button" tabIndex={0} onClick={it.open} onKeyDown={e => { if (e.key === 'Enter') it.open(); }}>
            {it.title}{it.sub && <small>{it.sub}</small>}
          </span>
          <KindPill $kind={it.kind}>{KIND_LABEL[it.kind]}</KindPill>
        </UpRow>
      ))}
    </section>
  );
}

/* Shopping list: the newest open list's items as outline pills (got = struck) */
const Pills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
`;

const ItemPill = styled.button<{ $got: boolean }>`
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $got }) => ($got ? 'var(--text-muted)' : 'var(--text-secondary)')};
  text-decoration: ${({ $got }) => ($got ? 'line-through' : 'none')};
  cursor: pointer;
  &:hover { border-color: var(--control-border); }
`;

function Shopping() {
  const navigate = useNavigate();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const save = useSaveFields();
  const list = useMemo(() => latestOpenList(entries, topicIdByName(allTopics, 'shopping list', 'shopping lists')), [entries, allTopics]);
  const items = ((list ? cfOf(list).items : undefined) as ShoppingItem[] | undefined) ?? [];
  const left = items.filter(i => !i.checked).length;
  return (
    <section aria-label="Shopping list">
      <SectionHead><h2>Shopping list</h2>{list ? <span>{left} left</span> : <button type="button" onClick={() => navigate('/shopping')}>Start one</button>}</SectionHead>
      {!list ? <Muted>No open shopping list.</Muted> : items.length === 0 ? <Muted>No items yet.</Muted> : (
        <Pills>
          {[...items.filter(i => !i.checked), ...items.filter(i => i.checked)].map(i => (
            <ItemPill key={i.id} type="button" $got={!!i.checked} aria-pressed={!!i.checked}
              onClick={() => void save(list, { ...cfOf(list), items: items.map(x => (x.id === i.id ? { ...x, checked: !x.checked } : x)) })}>
              {i.name}
            </ItemPill>
          ))}
        </Pills>
      )}
    </section>
  );
}

/* ── View ── */

export function DashboardView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const ff = useEntriesStore(s => s.featureFlags);
  const [config, saveConfig, configLoaded] = useEncryptedSetting<DashboardConfig>('dashboardConfig', DEFAULT_CONFIG);
  const [customizing, setCustomizing] = useState(false);
  const displayName = useUIStore(s => s.displayName) ?? '';
  const themeMode = useUIStore(s => s.themeMode);
  const setThemeMode = useUIStore(s => s.setThemeMode);
  const changeTheme = (mode: 'light' | 'dark') => {
    if (mode === themeMode) return;
    setThemeMode(mode);
    void settingsApi.upsert('themeMode', mode).catch(() => {});
  };
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeError, setPlaceError] = useState('');
  const [homeWeather, setHomeWeather] = useState<CurrentWeather | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);
  const medsOn = ff.medicationEnabled !== false;
  const doses = useTodayDoses(isReady && medsOn);

  const places = config.places ?? NO_PLACES;
  const home = places[0];
  useEffect(() => {
    if (!home) { setHomeWeather(null); return; }
    let live = true;
    currentWeather(home).then(w => { if (live) setHomeWeather(w); }).catch(() => {});
    return () => { live = false; };
  }, [home]);

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to continue" /></ContentTemplate>
      <UnlockDialog onUnlock={handleUnlock} />
    </>
  );
  if (isLoading || !isReady || !configLoaded) return (
    <ContentTemplate><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></ContentTemplate>
  );

  const shown = (k: SectionKey) => !(config.hidden ?? []).includes(k);
  const hd = homeWeather ? describeWeather(homeWeather.code, homeWeather.isDay) : null;
  const eyebrow = [
    now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    homeWeather && hd && home ? `${homeWeather.tempF}° and ${hd.label.toLowerCase()} in ${home.name}` : null,
  ].filter(Boolean).join(' · ');
  const financeOn = ff.financeEnabled === true;
  const hello = displayName.trim() ? `${greeting(now)}, ${displayName.trim()}` : greeting(now);
  const quote = dailyQuote(now);
  const kitchenOn = true;

  const toggleSection = (k: SectionKey, on: boolean) =>
    void saveConfig({ ...config, hidden: on ? (config.hidden ?? []).filter(x => x !== k) : [...(config.hidden ?? []), k] });
  const addPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = placeQuery.trim();
    if (!q) return;
    setPlaceError('');
    try {
      const p = await findPlace(q);
      await saveConfig({ ...config, places: [...places, p].slice(0, MAX_PLACES) });
      setPlaceQuery('');
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Couldn’t find that place');
    }
  };

  // The card beside the wellness check-in: the daily quote when it's on, else Next up (medications)
  const lead = shown('quote') ? (
    <NextCard aria-label="Daily quote">
      <NextTop $plain><b>Daily quote</b></NextTop>
      <QuoteBody>
        <QuoteText>{quote.text}</QuoteText>
        <QuoteBy>— {quote.author}</QuoteBy>
      </QuoteBody>
    </NextCard>
  ) : shown('nextUp') && medsOn ? <NextUp doses={doses} now={now} /> : null;

  const left: ReactNode[] = [];
  const right: ReactNode[] = [];
  if (shown('priorities')) left.push(<Priorities key="p" />);
  if (shown('comingUp')) left.push(<ComingUp key="c" financeOn={financeOn} doses={doses} now={now} />);
  if (shown('menu') && kitchenOn) right.push(<Menu key="m" />);
  if (shown('meds') && medsOn) right.push(<Medications key="d" doses={doses} />);
  if (shown('shopping')) right.push(<Shopping key="s" />);

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <DateBlock>
              <Hello>{hello}</Hello>
              <Eyebrow>{eyebrow}</Eyebrow>
            </DateBlock>
            <HeadActions>
              <ThemeSwitch role="group" aria-label="Theme">
                {(['light', 'dark'] as const).map(m => (
                  <ThemeOpt key={m} type="button" $on={themeMode === m} aria-pressed={themeMode === m} onClick={() => changeTheme(m)}>
                    {m === 'light' ? 'Light' : 'Dark'}
                  </ThemeOpt>
                ))}
              </ThemeSwitch>
              <CustomizeBtn type="button" $variant="neutral" aria-expanded={customizing} onClick={() => setCustomizing(c => !c)}>
                {customizing ? 'Done' : 'Customize view'}
              </CustomizeBtn>
            </HeadActions>
          </Head>

          {customizing && (
            <Customize aria-label="Customize view">
              <h3>Show on this page</h3>
              <ToggleGrid>
                {SECTIONS.map(s => (
                  <label key={s.key}>{s.label}<Toggle checked={shown(s.key)} aria-label={s.label} onChange={v => toggleSection(s.key, v)} /></label>
                ))}
              </ToggleGrid>
              <h3>Cities (the first is home)</h3>
              {places.length === 0 && <Muted style={{ marginTop: 0 }}>Add your city for the weather, then up to seven more for world clocks.</Muted>}
              {places.map((p, i) => (
                <PlaceRow key={`${p.name}-${i}`}>
                  <span>{p.name}<small>{i === 0 ? 'Home' : p.timezone.replace(/_/g, ' ')}</small></span>
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => void saveConfig({ ...config, places: places.filter((_, j) => j !== i) })}>
                    <Icon name="x" size={14} strokeWidth={2} />
                  </button>
                </PlaceRow>
              ))}
              {places.length < MAX_PLACES && (
                <AddPlace onSubmit={e => void addPlace(e)}>
                  <input value={placeQuery} onChange={e => setPlaceQuery(e.target.value)} placeholder="Add a city, e.g. Portland, OR" aria-label="Add a city" />
                  <OutlineBtn type="submit" disabled={!placeQuery.trim()}>Add</OutlineBtn>
                </AddPlace>
              )}
              {placeError && <Muted style={{ color: 'var(--color-danger)' }}>{placeError}</Muted>}
              <Muted>Only the cities' coordinates are sent to Open-Meteo for the weather; the list itself is stored encrypted.</Muted>
            </Customize>
          )}

          {(lead || shown('wellness')) && (
            <Hero $single={!(lead && shown('wellness'))}>
              {lead}
              {shown('wellness') && <WellnessCheckIn title="Wellness check-in" quad bare />}
            </Hero>
          )}

          {shown('clocks') && places.length > 0 && <WorldClocks places={places} now={now} open={!!config.clocksExpanded} onToggle={() => void saveConfig({ ...config, clocksExpanded: !config.clocksExpanded })} />}
          {shown('clocks') && places.length === 0 && !customizing && (
            <Muted style={{ marginTop: 20 }}>Add your city under Customize view for the weather and world clocks.</Muted>
          )}


          {(left.length > 0 || right.length > 0) && (
            <Columns>
              <Col>{left}</Col>
              <Col>{right}</Col>
            </Columns>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}

const NO_PLACES: Place[] = [];
