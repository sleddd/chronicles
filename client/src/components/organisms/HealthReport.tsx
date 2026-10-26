import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { TrendChart, ChartLegend, type TrendSeries } from '../molecules/charts/TrendChart.js';
import { StatTile } from '../molecules/StatTile.js';
import { FilterTabs } from '../molecules/FilterTabs.js';
import { JoinedGroup, JoinedBtn } from '../molecules/fields/formKit.js';
import { MOOD_WORDS, QUALITY_WORDS, STRESS_WORDS } from '../../utils/dailyInventory.js';
import { TRIGGER_KIND_LABEL, triggerKey, type TriggerEvent, type TriggerReviews, type TriggerReview, type TriggerVerdict } from '../../utils/foodSymptoms.js';
import {
  addDays, dayList, shortDay, lc, questionRows, metricTiles, metricSeries, rankedSymptoms, dayTriggers, exerciseReport,
  medicationReport, symptomGlance, loggedDays,
  type ReportScope, type CompareTarget, type MetricKey, type DayTrigger, type GlanceCell, type Tone,
} from '../../utils/healthReport.js';

/* Health → Reports: the daily inventory report. Mood, sleep, social time,
   exercise and stress tiles (the chosen one drives the chart), the inventory
   questions for today / 7 days / the range, and — once something is picked
   under "Compare with" — how mood or a symptom differs on days above and
   below the person's own average. Then possible triggers (food, medication,
   exercise), exercise and medication on days with vs without, and a
   day-by-day grid of every symptom. Section headings are big thin Work Sans
   on the canvas; content sits in --bg-panel cards. Props plus local UI state.
   The maths is in utils/healthReport. */

/* ── Layout ── */

const Report = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 8px 0 32px;
  @media (max-width: 900px) { gap: 12px; }
`;

const SectionHeading = styled.h2`
  margin: 32px 0 0;
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 200;
  line-height: 1.1;
  color: var(--text-primary);
  @media (max-width: 480px) { font-size: 26px; }
`;

const Sub = styled.span`
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

export const Panel = styled.section`
  min-width: 0;
  padding: 22px 26px;
  background: var(--bg-panel);
  border-radius: 12px;
  @media (max-width: 480px) { padding: 18px 16px; }
`;

const PanelHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 20px;
  margin-bottom: 14px;
`;

const PanelTitle = styled.h3`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 400;
  color: var(--text-primary);
`;

const Note = styled.p`
  margin: 12px 0 0;
  max-width: 820px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
  ${Report} > & { margin: 0; }
`;

const Quiet = styled.p`
  margin: 14px 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

/* ── Compare with ── */

const CompareRow = styled.div`
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 24px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  ${JoinedGroup} { overflow-x: auto; }
`;

const ClearBtn = styled(JoinedBtn)<{ $off: boolean }>`
  color: ${({ $off }) => ($off ? 'var(--text-placeholder)' : 'var(--text-secondary)')};
  cursor: ${({ $off }) => ($off ? 'default' : 'pointer')};
`;

const MoreBtn = styled(JoinedBtn)`
  color: var(--color-accent-link);
`;

/* The floating symptom list ("More symptoms") */
const Pop = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  width: min(340px, 100%);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-tile);
  border: 1px solid var(--border-pop);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  @media (min-width: 600px) { left: 110px; }
`;

const PopSearch = styled.input`
  height: 38px;
  padding: 0 10px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-sunken);
  border: 1px solid var(--border-field);
  border-radius: 6px;
  outline: none;
  &:focus { border-color: var(--color-accent-line); }
`;

const PopList = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 280px;
  overflow-y: auto;
`;

const PopItem = styled.button<{ $active: boolean }>`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: ${({ $active }) => ($active ? 'var(--bg-active)' : 'transparent')};
  font-family: var(--font-sans);
  font-size: 14px;
  text-align: left;
  color: var(--text-primary);
  cursor: pointer;
  &:hover { background: var(--bg-row-hover); }
  span { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
`;

/* ── Tiles ── */

const Tiles = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, minmax(0, 1fr));
  gap: 12px;
  @media (max-width: 1000px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 640px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

/* ── Tables (questions, triggers, exercise, medication) ──
   A grid per row; on phones each cell stacks under its own label */

const Table = styled.div<{ $cols: string }>`
  display: flex;
  flex-direction: column;
  --cols: ${({ $cols }) => $cols};
`;

const Row = styled.div<{ $head?: boolean }>`
  display: grid;
  grid-template-columns: var(--cols);
  gap: 20px;
  align-items: ${({ $head }) => ($head ? 'end' : 'center')};
  padding: ${({ $head }) => ($head ? '12px 0' : '14px 0')};
  border-bottom: 1px solid ${({ $head }) => ($head ? 'var(--border-card)' : 'var(--border-subtle)')};
  font-family: var(--font-sans);
  font-size: ${({ $head }) => ($head ? '13px' : '15px')};
  color: ${({ $head }) => ($head ? 'var(--text-muted)' : 'var(--text-primary)')};
  &:last-child { border-bottom: ${({ $head }) => ($head ? '' : 'none')}; }
  @media (max-width: 768px) {
    ${({ $head }) => ($head ? 'display: none;' : '')}
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px 12px;
    align-items: start;
  }
`;

const Cell = styled.span<{ $muted?: boolean; $tone?: Tone | 'less' | 'more' }>`
  min-width: 0;
  font-size: inherit;
  line-height: 1.45;
  text-wrap: pretty;
  color: ${({ $muted, $tone }) => ($tone === 'better' || $tone === 'less' ? 'var(--color-accent-soft)'
    : $tone === 'worse' || $tone === 'more' ? 'var(--chart-amber)'
    : $muted ? 'var(--text-secondary)' : 'inherit')};
  @media (max-width: 768px) {
    &[data-label]::before {
      content: attr(data-label);
      display: block;
      font-size: 12px;
      color: var(--text-muted);
    }
  }
`;

/* The row's name: full width above the values on phones */
const NameCell = styled(Cell)`
  display: flex;
  flex-direction: column;
  gap: 3px;
  small { font-size: 13px; color: var(--text-muted); }
  @media (max-width: 768px) { grid-column: 1 / -1; }
`;

/* A cell that spans the row on phones (the comparison sentence, buttons) */
const WideCell = styled(Cell)`
  @media (max-width: 768px) { grid-column: 1 / -1; }
`;

const CompareText = styled(WideCell)`
  font-size: 14px;
`;

const NeedText = styled(WideCell)`
  font-size: 13px;
  color: var(--text-muted);
`;

/* ── Triggers ── */

const WindowRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
`;

const Actions = styled(WideCell)`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  @media (max-width: 768px) { justify-content: flex-start; }
`;

const ReviewBtn = styled.button<{ $accent?: boolean }>`
  height: 30px;
  padding: 0 12px;
  border: 1px solid ${({ $accent }) => ($accent ? 'var(--color-accent-line)' : 'var(--border-pill, var(--border-card))')};
  border-radius: 8px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 13px;
  white-space: nowrap;
  color: ${({ $accent }) => ($accent ? 'var(--color-accent-soft)' : 'var(--text-secondary)')};
  cursor: pointer;
  &:hover { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Status = styled.span<{ $yes: boolean }>`
  font-size: 13px;
  color: ${({ $yes }) => ($yes ? 'var(--color-accent-soft)' : 'var(--text-muted)')};
`;

const UndoBtn = styled.button`
  padding: 6px 4px;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-secondary); }
`;

const LinkBtn = styled.button`
  padding: 0 0 0 6px;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-accent-link);
  cursor: pointer;
`;

/* ── Exercise ── */

const Figures = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px 40px;
  align-items: baseline;
  span { display: inline-flex; align-items: baseline; gap: 8px; font-family: var(--font-sans); font-size: 14px; color: var(--text-secondary); }
  b { font-family: var(--font-display); font-weight: 300; font-size: 30px; color: var(--text-primary); }
`;

/* ── Symptoms at a glance ── */

const SEVERITY_COLOR: Record<GlanceCell, string> = {
  mild: 'var(--mood-4)', moderate: 'var(--chart-amber)', severe: 'var(--mood-1)', none: 'var(--border-subtle)', unlogged: 'transparent',
};

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  span { display: inline-flex; align-items: center; gap: 6px; }
`;

const Swatch = styled.i<{ $c: string }>`
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: ${({ $c }) => $c};
`;

const HeatRow = styled.div<{ $head?: boolean }>`
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr) 50px 80px 150px;
  gap: 14px;
  align-items: center;
  min-height: 22px;
  padding: ${({ $head }) => ($head ? '0 0 6px' : '1.5px 0')};
  font-family: var(--font-sans);
  font-size: ${({ $head }) => ($head ? '12px' : '14px')};
  color: ${({ $head }) => ($head ? 'var(--text-muted)' : 'var(--text-primary)')};
  & > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .num { text-align: right; }
  .soft { font-size: 13px; color: var(--text-secondary); }
  @media (max-width: 768px) {
    grid-template-columns: 110px minmax(0, 1fr) 30px;
    .wide { display: none; }
  }
`;

const Cells = styled.span`
  display: flex;
  gap: 2px;
`;

const Square = styled.i<{ $c: string }>`
  flex: 1;
  height: 18px;
  border-radius: 2px;
  background: ${({ $c }) => $c};
`;

const Ends = styled.span`
  display: flex;
  justify-content: space-between;
`;

const Together = styled.div`
  display: flex;
  flex-direction: column;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-card);
`;

const TogetherRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 20px;
  padding: 8px 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  span:last-child { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }
`;

/* ── Helpers ── */

const plural = (n: number, a: string, b: string) => (n === 1 ? a : b);

const METRIC_COLOR: Record<MetricKey, string> = {
  symptom: 'var(--mood-2)', mood: 'var(--chart-amber)', sleep: 'var(--chart-violet)',
  social: 'var(--color-accent)', exercise: 'var(--mood-1)', stress: 'var(--chart-blue)',
};

/* The report's disclaimer: small muted text in a light outlined box at the foot */
const Disclaimer = styled.p`
  margin: 40px 0 0;
  padding: 16px 20px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
`;

/** "a", "a and b", "a, b and c" */
const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/* Plain findings, one per line with a small accent dot */
const Findings = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-secondary);
  li { position: relative; padding-left: 18px; }
  li::before { content: ''; position: absolute; left: 0; top: 0.62em; width: 6px; height: 6px; border-radius: 50%; background: var(--color-accent); }
  li button { margin-left: 8px; }
`;

const TRIGGER_WINDOWS = [
  { value: '0', label: 'Same day' },
  { value: '1', label: 'Within a day' },
  { value: '2', label: 'Within 2 days' },
] as const;
type WindowValue = typeof TRIGGER_WINDOWS[number]['value'];

/* A verdict from before, on something not seen in this range */
function PastRow({ r, onReviewTrigger }: { r: TriggerReview; onReviewTrigger?: (t: TriggerRef, verdict: TriggerVerdict | null) => void }) {
  const confirmed = r.verdict === 'confirmed';
  return (
    <Row>
      <NameCell>
        {r.trigger}
        <small>{r.kind === 'food' ? '' : `${TRIGGER_KIND_LABEL[r.kind]} · `}then {lc(r.symptom)}</small>
      </NameCell>
      <WideCell $muted style={{ gridColumn: 'span 2' }}>Not seen in this period</WideCell>
      <Actions>
        <Status $yes={confirmed}>{confirmed ? 'Marked as trigger' : 'Not a trigger'} · {shortDay(r.at)}</Status>
        {onReviewTrigger && <UndoBtn type="button" onClick={() => onReviewTrigger(r, null)}>{confirmed ? 'Undo' : 'Restore'}</UndoBtn>}
      </Actions>
    </Row>
  );
}

/* ── Props ── */

type TriggerRef = Pick<DayTrigger, 'kind' | 'trigger' | 'symptom'>;

interface HealthReportProps {
  /** Inventory and symptoms for the range and the last 30 days (utils/healthReport) */
  scope: ReportScope;
  /** The range column's header: "Last 30 days", "Since you started", "Last 12 months", "Oct 1 – Oct 20" */
  rangeLabel: string;
  /** Foods, medications and exercise as dated events (utils/foodSymptoms triggerEvents) */
  events: TriggerEvent[];
  /** Exercise sessions in the range */
  sessions: { day: string; minutes: number; type?: string }[];
  /** Medications taken (ticked doses and Meals rows logged as medication / supplement) */
  doses: { name: string; day: string }[];
  /** The owner's verdicts on possible triggers (encrypted setting, held by the view) */
  triggerReviews?: TriggerReviews;
  /** Mark a trigger confirmed / not a trigger (null clears); omitted = no buttons */
  onReviewTrigger?: (t: TriggerRef, verdict: TriggerVerdict | null) => void;
}

/* ── Component ── */

export function HealthReport({ scope, rangeLabel, events, sessions, doses, triggerReviews, onReviewTrigger }: HealthReportProps) {
  // Opens comparing with mood, so "You feel better on days…" shows straight away (× Clear hides it)
  const [target, setTarget] = useState<CompareTarget | null>({ kind: 'mood' });
  const [chartKey, setChartKey] = useState<MetricKey>('mood');
  const [moreOpen, setMoreOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [win, setWin] = useState<WindowValue>('1');
  const [exAll, setExAll] = useState(false);
  const [symAll, setSymAll] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const compareRef = useRef<HTMLDivElement>(null);

  const ranked = useMemo(() => rankedSymptoms(scope), [scope]);
  const days = useMemo(() => dayList(scope.range.from, scope.range.to), [scope]);
  const symptomTarget = target?.kind === 'symptom' ? target : undefined;
  const tiles = useMemo(() => metricTiles(scope, symptomTarget), [scope, symptomTarget]);
  const rows = useMemo(() => questionRows(scope, target), [scope, target]);
  // Food only — medications and supplements (Medication Impact covers them; and a pain reliever just follows its pain) and exercise stay out
  const foodEvents = useMemo(() => events.filter(e => e.kind === 'food'), [events]);
  const triggers = useMemo(() => dayTriggers(foodEvents, scope, Number(win)), [foodEvents, scope, win]);
  const exercise = useMemo(() => exerciseReport(scope, sessions), [scope, sessions]);
  const meds = useMemo(() => medicationReport(scope, doses), [scope, doses]);
  // Symptoms at a glance always shows the last 30 days, whatever the range
  const glance = useMemo(() => symptomGlance({ ...scope, range: { from: addDays(scope.today, -29), to: scope.today } }), [scope]);
  const hasAnything = useMemo(() =>
    loggedDays(scope, scope.range.from, scope.range.to).length > 0, [scope]);

  // The chart falls back to mood when the compared symptom is cleared
  const shownKey: MetricKey = chartKey === 'symptom' && !symptomTarget ? 'mood' : chartKey;

  /* Close the symptom list on a click outside or Escape */
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => { if (!compareRef.current?.contains(e.target as Node)) setMoreOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [moreOpen]);

  const pickSymptom = (key: string, name: string) => {
    setTarget(t => (t?.kind === 'symptom' && t.key === key ? null : { kind: 'symptom', key, name }));
    setMoreOpen(false);
    setQuery('');
  };

  const chart = useMemo(() => {
    const values = metricSeries(scope, shownKey, days, symptomTarget?.key);
    const nums = values.filter((v): v is number => v !== null);
    const peak = Math.max(0, ...nums);
    let yMax: number;
    let yTicks: number[];
    let formatTick: (v: number) => string;
    if (shownKey === 'mood' || shownKey === 'social' || shownKey === 'stress') {
      const words = shownKey === 'mood' ? MOOD_WORDS : shownKey === 'stress' ? STRESS_WORDS : QUALITY_WORDS;
      yMax = 5; yTicks = [1, 3, 5]; formatTick = v => words[v - 1] ?? '';
    } else if (shownKey === 'symptom') {
      yMax = 10; yTicks = [0, 5, 10]; formatTick = v => (v === 0 ? 'None' : v === 5 ? 'Moderate' : 'Severe');
    } else {
      const floor = shownKey === 'exercise' ? 30 : 8;
      const step = shownKey === 'exercise' ? 10 : 2;
      yMax = Math.max(floor, Math.ceil(peak / step) * step);
      yTicks = [0, yMax / 2, yMax];
      formatTick = v => (shownKey === 'sleep' ? `${v} h` : shownKey === 'exercise' ? `${v} min` : String(v));
    }
    const series: TrendSeries[] = [{ label: 'Daily', values, color: METRIC_COLOR[shownKey] }];
    // The compared outcome, scaled onto this chart's axis, as a pale line behind
    if (target && !(target.kind === 'mood' && shownKey === 'mood') && !(target.kind === 'symptom' && shownKey === 'symptom')) {
      const raw = target.kind === 'mood' ? metricSeries(scope, 'mood', days) : metricSeries(scope, 'symptom', days, target.key);
      const full = target.kind === 'mood' ? 5 : 10;
      series.push({
        label: target.kind === 'mood' ? 'Mood (very low → great)' : `${target.name} (none → severe)`,
        ghost: true,
        values: raw.map(v => (v === null ? null : (v / full) * yMax)),
      });
    }
    const name = shownKey === 'symptom' ? symptomTarget!.name : tiles.find(t => t.key === shownKey)?.name ?? '';
    return { series, yMax, yTicks, formatTick, title: `${name} over time`, labels: days.map(shortDay) };
  }, [scope, shownKey, days, symptomTarget, target, tiles]);

  if (!hasAnything) {
    return <Report><Quiet style={{ marginTop: 40 }}>Nothing logged in this period yet. Wellness check-ins, symptoms, meals and exercise show up here as you log them.</Quiet></Report>;
  }

  const top3 = ranked.slice(0, 3);
  const extra = symptomTarget && !top3.some(s => s.key === symptomTarget.key) ? [{ key: symptomTarget.key, name: symptomTarget.name, days: 0 }] : [];
  const q = query.trim().toLowerCase();
  const filtered = ranked.filter(s => !q || s.name.toLowerCase().includes(q));
  const comparing = !!target;
  const outcomeLabel = target?.kind === 'symptom' ? `Days with ${lc(target.name)}` : 'Your mood';
  const cols = comparing
    ? 'minmax(0, 1.3fr) repeat(3, minmax(0, 0.7fr)) minmax(0, 1.6fr)'
    : 'minmax(0, 1.6fr) repeat(3, minmax(0, 1fr))';

  const review = (t: DayTrigger) => triggerReviews?.[triggerKey(t)];
  // Verdicts on things that didn't come up in this range (newest first)
  const shown = new Set(triggers.triggers.map(triggerKey));
  const earlier = Object.entries(triggerReviews ?? {})
    .filter(([k, r]) => !shown.has(k) && r && typeof r === 'object' && r.kind === 'food')
    .map(([, r]) => r)
    .sort((a, b) => b.at.localeCompare(a.at));
  const past = { confirmed: earlier.filter(r => r.verdict === 'confirmed'), dismissed: earlier.filter(r => r.verdict === 'dismissed') };
  const exLess = exAll ? exercise.lessOften : exercise.lessOften.slice(0, 4);
  const exMore = exAll ? exercise.moreOften : exercise.moreOften.slice(0, 4);
  const heatRows = symAll ? glance.rows : glance.rows.slice(0, 10);

  return (
    <Report>
      {/* Compare with: mood or a symptom */}
      <CompareRow ref={compareRef}>
        <span>Compare with</span>
        <JoinedGroup role="group" aria-label="Compare with">
          <JoinedBtn type="button" $fill $active={target?.kind === 'mood'} aria-pressed={target?.kind === 'mood'}
            onClick={() => setTarget(t => (t?.kind === 'mood' ? null : { kind: 'mood' }))}>Mood</JoinedBtn>
          {[...top3, ...extra].map(s => {
            const on = symptomTarget?.key === s.key;
            return (
              <JoinedBtn key={s.key} type="button" $fill $active={on} aria-pressed={on} onClick={() => pickSymptom(s.key, s.name)}>{s.name}</JoinedBtn>
            );
          })}
          {ranked.length > 3 && (
            <MoreBtn type="button" $active={false} aria-expanded={moreOpen} onClick={() => setMoreOpen(o => !o)}>
              {moreOpen ? 'Close' : 'More symptoms ⌄'}
            </MoreBtn>
          )}
          <ClearBtn type="button" $active={false} $off={!comparing} disabled={!comparing} onClick={() => setTarget(null)}>× Clear</ClearBtn>
        </JoinedGroup>
        {moreOpen && (
          <Pop>
            <PopSearch autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${ranked.length} symptoms`} aria-label="Search symptoms" />
            <PopList>
              {filtered.map(s => (
                <PopItem key={s.key} type="button" $active={symptomTarget?.key === s.key} onClick={() => pickSymptom(s.key, s.name)}>
                  {s.name}<span>{s.days} {plural(s.days, 'day', 'days')}</span>
                </PopItem>
              ))}
              {filtered.length === 0 && <Quiet>No symptoms match “{query}”.</Quiet>}
            </PopList>
          </Pop>
        )}
      </CompareRow>

      <Tiles $cols={tiles.length === 6 ? 3 : 5}>
        {tiles.map(t => (
          <StatTile key={t.key} name={t.name} caption={t.caption} value={t.value} unit={t.unit} progress={t.progress}
            color={METRIC_COLOR[t.key]} selected={shownKey === t.key} onSelect={() => setChartKey(t.key)}
            rows={[['Today', t.today], ['7 days', t.week]]} />
        ))}
      </Tiles>

      <Panel aria-label={chart.title}>
        <PanelHead>
          <PanelTitle>{chart.title}</PanelTitle>
          <ChartLegend series={chart.series} solid />
        </PanelHead>
        <TrendChart labels={chart.labels} series={chart.series} yMax={chart.yMax} yTicks={chart.yTicks}
          formatTick={chart.formatTick} ariaLabel={chart.title} solid />
      </Panel>

      {rows.length > 0 && (
        <Panel aria-label="Questions">
          <Table $cols={cols}>
            <Row $head>
              <span>Question</span><span>Today</span><span>Last 7 days</span><span>{rangeLabel}</span>
              {comparing && <span>{outcomeLabel}</span>}
            </Row>
            {rows.map(r => (
              <Row key={r.key}>
                <NameCell>{r.label}</NameCell>
                <Cell data-label="Today">{r.today}</Cell>
                <Cell data-label="7 days">{r.week}</Cell>
                <Cell data-label={rangeLabel} $muted>{r.period}</Cell>
                {comparing && (r.compare === null ? <WideCell $muted>—</WideCell>
                  : r.compare.ready ? <CompareText>{r.compare.sentence}</CompareText>
                  : <NeedText>{r.compare.need}</NeedText>)}
              </Row>
            ))}
          </Table>
        </Panel>
      )}
      {comparing && (
        <Note>
          Averages only count days you logged. The last column compares {target.kind === 'symptom'
            ? `how often you had ${lc(target.name)}` : 'your usual mood'} on days above and below your own average, or on days you did something and days you didn’t. These are links, not causes.
        </Note>
      )}

      {/* Possible food triggers */}
      <SectionHeading>Possible food triggers</SectionHeading>
      <WindowRow>
        <span>Symptom shows up</span>
        <FilterTabs options={[...TRIGGER_WINDOWS]} active={win} onChange={setWin} />
      </WindowRow>
      <Panel aria-label="Possible food triggers">
        <Table $cols="minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) 210px">
          <Row $head><span>Trigger and symptom</span><span>After it</span><span>Other days</span><span /></Row>
          {triggers.triggers.map(t => {
            const r = review(t);
            return (
              <Row key={triggerKey(t)}>
                <NameCell>
                  {t.trigger}
                  <small>{t.kind === 'food' ? '' : `${TRIGGER_KIND_LABEL[t.kind]} · `}then {lc(t.symptom)}</small>
                </NameCell>
                <Cell data-label="After it">{t.hits} of {t.times} {plural(t.times, 'time', 'times')}</Cell>
                <Cell data-label="Other days" $muted>{Math.round(t.otherRate * 10)} in 10 other days</Cell>
                {onReviewTrigger ? (
                  <Actions>
                    {!r ? (
                      <>
                        <ReviewBtn type="button" $accent onClick={() => onReviewTrigger(t, 'confirmed')}>Trigger</ReviewBtn>
                        <ReviewBtn type="button" onClick={() => onReviewTrigger(t, 'dismissed')}>Not a trigger</ReviewBtn>
                      </>
                    ) : (
                      <>
                        <Status $yes={r.verdict === 'confirmed'}>{r.verdict === 'confirmed' ? 'Marked as trigger' : 'Not a trigger'} · {shortDay(r.at)}</Status>
                        <UndoBtn type="button" onClick={() => onReviewTrigger(t, null)}>Undo</UndoBtn>
                      </>
                    )}
                  </Actions>
                ) : <span />}
              </Row>
            );
          })}
          {/* Confirmed earlier but not seen in this range: kept so past findings stay in view */}
          {past.confirmed.map(r => (
            <PastRow key={triggerKey(r)} r={r} onReviewTrigger={onReviewTrigger} />
          ))}
          {showDismissed && past.dismissed.map(r => (
            <PastRow key={triggerKey(r)} r={r} onReviewTrigger={onReviewTrigger} />
          ))}
        </Table>
        {past.dismissed.length > 0 && (
          <LinkBtn type="button" style={{ padding: '10px 0 0' }} onClick={() => setShowDismissed(v => !v)}>
            {showDismissed ? 'Hide' : 'Show'} {past.dismissed.length} earlier marked not a trigger
          </LinkBtn>
        )}
        {triggers.triggers.length === 0 && past.confirmed.length === 0 && (
          <Quiet>Nothing stands out yet. Something shows here once a symptom has followed it at least 4 times, and far more often than on other days.</Quiet>
        )}
        {triggers.tooFew > 0 && (
          <Note>{triggers.tooFew} {plural(triggers.tooFew, 'thing was', 'things were')} logged on fewer than 3 days, too few to tell.</Note>
        )}
      </Panel>

      {/* Exercise */}
      <SectionHeading>Exercise</SectionHeading>
      <Figures>
        <span><b>{exercise.sessions}</b>{plural(exercise.sessions, 'session', 'sessions')}</span>
        <span><b>{exercise.minutes}</b>minutes</span>
        <span><b>{exercise.perWeek}</b>times a week</span>
      </Figures>
      <Panel aria-label="Exercise">
        {exercise.enough ? (
          <>
            {/* Plain statements, not a table */}
            <Findings>
              {exercise.findings.map(f => <li key={f}>{f}</li>)}
              {exercise.lessOften.length > 0 && (
                <li>
                  You get {listWords(exLess.map(lc))} less often on days you exercise.
                  {!exAll && exercise.lessOften.length > 4 && <LinkBtn type="button" onClick={() => setExAll(true)}>+{exercise.lessOften.length - 4} more</LinkBtn>}
                </li>
              )}
              {exercise.moreOften.length > 0 && (
                <li>
                  You get {listWords(exMore.map(lc))} more often on days you exercise.
                  {!exAll && exercise.moreOften.length > 4 && <LinkBtn type="button" onClick={() => setExAll(true)}>+{exercise.moreOften.length - 4} more</LinkBtn>}
                </li>
              )}
              {/* By activity — only where the difference is clear */}
              {exercise.byActivity.map(f => <li key={f}>{f}</li>)}
            </Findings>
            <Note>These are links, not causes. Symptoms and activities are named only when the difference is clear.</Note>
          </>
        ) : (
          <Quiet>Log at least 3 days with exercise and 3 without to see how it lines up with your mood, sleep and symptoms.</Quiet>
        )}
      </Panel>

      {/* Medication */}
      {meds.length > 0 && (
        <>
          <SectionHeading>Medication Impact</SectionHeading>
          <Panel aria-label="Medication Impact">
            <Table $cols="minmax(0, 1.2fr) minmax(0, 2fr)">
              {meds.map(m => (
                <Row key={m.name}>
                  <NameCell>{m.name}<small>Taken {m.taken} of {m.of} days lately</small></NameCell>
                  <WideCell style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
                    {m.lessOften.length > 0 && <span><Cell $tone="less">Less often: </Cell>{m.lessOften.join(', ')}</span>}
                    {m.moreOften.length > 0 && <span><Cell $tone="more">More often: </Cell>{m.moreOften.join(', ')}</span>}
                    {m.note && <Cell $muted>{m.note}</Cell>}
                  </WideCell>
                </Row>
              ))}
            </Table>
            <Note>How often each symptom shows up on days you took a medication, compared with days you didn’t. A link means the two tend to happen together. It doesn’t show that the medication causes or prevents the symptom.</Note>
          </Panel>
        </>
      )}

      {/* Symptoms at a glance */}
      {glance.rows.length > 0 && (
        <>
          <SectionHeading>Symptoms at a glance</SectionHeading>
          <Panel aria-label="Symptoms at a glance">
            <PanelHead>
              <Sub>
                {glance.rows.length} {plural(glance.rows.length, 'symptom', 'symptoms')} logged. Each square is a {glance.unit}. Symptoms that line up in the same column happened together.
              </Sub>
              <Legend>
                {(['mild', 'moderate', 'severe', 'none'] as const).map(b => (
                  <span key={b}><Swatch $c={SEVERITY_COLOR[b]} />{b.charAt(0).toUpperCase() + b.slice(1)}</span>
                ))}
              </Legend>
            </PanelHead>
            <HeatRow $head>
              <span />
              <Ends><span>{shortDay(glance.first)}</span><span>{shortDay(glance.last)}</span></Ends>
              <span className="num">Days</span><span className="wide">Usually</span><span className="wide">Often with</span>
            </HeatRow>
            {heatRows.map(r => (
              <HeatRow key={r.name}>
                <span title={r.name}>{r.name}</span>
                <Cells aria-label={`${r.name}, ${r.days} ${plural(r.days, 'day', 'days')}`}>
                  {r.cells.map((c, i) => <Square key={i} $c={SEVERITY_COLOR[c]} />)}
                </Cells>
                <span className="num">{r.days}</span>
                <span className="wide soft">{r.usual}</span>
                <span className="wide soft">{r.often ?? '—'}</span>
              </HeatRow>
            ))}
            {glance.rows.length > 10 && (
              <LinkBtn type="button" style={{ padding: '8px 0 0' }} onClick={() => setSymAll(a => !a)}>
                {symAll ? 'Show fewer' : `Show all ${glance.rows.length}`}
              </LinkBtn>
            )}
            <Together>
              <Sub style={{ paddingBottom: 6 }}>Tend to happen together</Sub>
              {glance.clusters.map(c => (
                <TogetherRow key={c.names}><span>{c.names}</span><span>{c.days}</span></TogetherRow>
              ))}
              {glance.clusters.length === 0 && (
                <Quiet>No clear groups yet. Symptoms need to land on the same day at least 3 times.</Quiet>
              )}
            </Together>
          </Panel>
        </>
      )}

      {/* Always at the foot of the report */}
      <Disclaimer role="note" aria-label="About this report">
        This report isn’t medical advice, and it can get things wrong. Use it with care, alongside what you know
        about your own body and experience. It’s meant to point out patterns worth noticing, not to be a medical
        authority on your health. Talk to a doctor or other health professional about any health concerns.
      </Disclaimer>
    </Report>
  );
}
