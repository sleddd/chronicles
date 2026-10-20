import styled from 'styled-components';
import { TrendChart, ChartLegend, type TrendSeries } from '../molecules/charts/TrendChart.js';
import { StatTile, StatTileRow } from '../molecules/StatTile.js';
import type { PeriodType } from '../../types/health.js';
import type {
  DecryptedSymptom,
  DecryptedFood,
  DecryptedMedicationLog,
  DecryptedExercise,
  DecryptedWellness,
  WellnessTrendPoint,
  WellnessInsight,
} from '../../utils/correlationAnalysis.js';
import {
  calculateExerciseImpact,
  calculateExerciseFrequency,
  calculateSymptomCoOccurrences,
  calculateWellnessTrend,
  calculateWellnessInsights,
} from '../../utils/correlationAnalysis.js';
import { useMemo, useState } from 'react';
import { FilterTabs } from '../molecules/FilterTabs.js';
import { Chips, Chip } from '../molecules/fields/formKit.js';
import {
  TRIGGER_WINDOWS, TRIGGER_KIND_LABEL, triggerEvents, symptomTriggers, standsOut, beforeLabel, applyTriggerReviews, triggerKey,
  type TriggerWindow, type TriggerReviews, type TriggerVerdict, type SymptomTrigger, type TriggerReview, type ReviewedTriggers,
} from '../../utils/foodSymptoms.js';
import { TickMark } from '../atoms/TickMark.js';
import type { HealthChange } from '../../utils/healthChanges.js';

/* Health → Reports. Sections (Wellness, Symptoms, Meals, Exercise) are big
   thin Work Sans headings on the canvas; their content sits in --bg-panel
   cards (12px corners, no outline). Insights are outlined boxes inside a
   panel. Props only apart from local UI state (the chosen wellness metric). */

/* ── Layout ── */

const Report = styled.div`
  display: flex;
  flex-direction: column;
  padding: 8px 0 32px;
`;

const SectionHeading = styled.h2`
  margin: 44px 0 26px;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 300;
  line-height: 1.1;
  color: var(--text-secondary);
  &:first-child { margin-top: 32px; }
  @media (max-width: 480px) { font-size: 22px; margin-top: 36px; }
  padding-left: 16px;
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  @media (max-width: 900px) { gap: 12px; }
`;

const Grid = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, minmax(0, 1fr));
  gap: 20px;
  align-items: start;
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); gap: 12px; }
`;

export const Panel = styled.section`
  min-width: 0;
  padding: 24px 28px 28px;
  background: var(--bg-panel);
  border-radius: 12px;
  @media (max-width: 480px) { padding: 18px; }
`;

const PanelHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 20px;
  margin-bottom: 28px;
`;

const PanelTitle = styled.h3`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
`;

const PanelSub = styled.p`
  margin: 4px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
`;

const Quiet = styled.p`
  margin: 16px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  &:first-child { margin-top: 0; }
`;

/* ── Insights ── */

const InsightBox = styled.div`
  padding: 18px 24px 20px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
  & + & { margin-top: 12px; }
  @media (max-width: 480px) { padding: 18px; }
`;

const InsightHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-bottom: 12px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
`;

const Pill = styled.span<{ $found?: boolean }>`
  padding: 3px 12px;
  border-radius: 999px;
  font-family: var(--font-sans);
  font-size: 13px;
  background: ${({ $found }) => ($found
    ? 'color-mix(in oklab, var(--chart-green) 16%, var(--bg-panel))'
    : 'var(--bg-row-hover)')};
  color: ${({ $found }) => ($found ? 'color-mix(in oklab, var(--chart-green), white 25%)' : 'var(--text-muted)')};
`;

const Facts = styled.dl`
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 26px;
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  dt { color: var(--text-muted); }
  dd { margin: 0; color: var(--text-secondary); }
`;

/* "6+ glasses: avg 0.0 symptoms/day" → ["6+ glasses", "0.0 symptoms / day"] */
function splitFact(line: string): [string, string] {
  const i = line.indexOf(': ');
  if (i < 0) return ['', line];
  return [line.slice(0, i), line.slice(i + 2).replace(/^avg /, '').replace(/\s*\/\s*day/, ' / day')];
}

/* ── Symptom bars ── */

const SEVERITY_BANDS = [
  { name: 'Mild', range: '1–3', color: 'var(--mood-4)' },
  { name: 'Moderate', range: '4–6', color: 'var(--chart-amber)' },
  { name: 'Severe', range: '7–10', color: 'var(--mood-1)' },
];
const bandColor = (sev: number) => SEVERITY_BANDS[sev <= 3 ? 0 : sev <= 6 ? 1 : 2].color;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  span { display: inline-flex; align-items: center; gap: 8px; }
  i { width: 11px; height: 11px; border-radius: 3px; }
`;

const Bars = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 12px;
  height: 260px;
  @media (max-width: 480px) { gap: 6px; height: 200px; }
`;

const BarCol = styled.div`
  flex: 1;
  min-width: 0;
  max-width: 54px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
`;

const BarCount = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
`;

const Bar = styled.div<{ $h: number; $color: string }>`
  width: 100%;
  height: ${({ $h }) => $h}%;
  min-height: 6px;
  border-radius: 6px 6px 3px 3px;
  background: ${({ $color }) => $color};
`;

const BarLabel = styled.span`
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
`;

/* ── Changes ── */

const ChangeRow = styled.div`
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr) max-content;
  align-items: baseline;
  gap: 18px;
  padding: 13px 0;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 15px;
  &:first-of-type { border-top: none; padding-top: 0; }
  .when { color: var(--text-muted); font-size: 14px; }
  .what { min-width: 0; padding: 0; border: none; background: none; text-align: left; font: inherit; color: var(--text-secondary); }
  button.what { cursor: pointer; }
  button.what:hover { text-decoration: underline; }
  .kind { font-size: 13px; color: var(--text-muted); }
  @media (max-width: 480px) { grid-template-columns: 56px minmax(0, 1fr); .kind { display: none; } }
`;

/* Under a chart: which change each ◆ marks */
const MarkerKey = styled.ul`
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  li { display: flex; align-items: center; gap: 10px; }
  i { flex: none; width: 8px; height: 8px; background: var(--text-muted); transform: rotate(45deg); }
`;

/* A ◆ over a symptom bar whose day had a change */
const BarChange = styled.i`
  width: 8px;
  height: 8px;
  background: var(--text-muted);
  transform: rotate(45deg);
`;

/* ── Lists ── */

const ListRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 0;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 15px;
  &:last-child { padding-bottom: 0; }
`;

const ListName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  &::first-letter { text-transform: uppercase; }
`;

const ListCount = styled.span`
  flex: none;
  color: var(--text-muted);
`;

const RowText = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const RowSub = styled.span`
  margin-top: 3px;
  font-size: 13px;
  color: var(--text-muted);
`;

const WindowRow = styled.div`
  margin: -8px 0 20px;
`;

const Verdict = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  margin-top: 8px;
`;

const ReviewBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  &:hover { color: var(--text-secondary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }
`;

const Confirmed = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-accent-soft);
`;

const DismissedToggle = styled(ReviewBtn)`
  margin-top: 16px;
`;

/* The two fact lines under a trigger */
function TriggerFacts({ t }: { t: SymptomTrigger }) {
  return (
    <>
      <RowSub>{TRIGGER_KIND_LABEL[t.kind]} · before {t.before} of {t.of} {plural(t.of, 'time')} · {beforeLabel(t.avgHours)}</RowSub>
      <RowSub>Usually on {Math.round(t.usual * 100)}% of days{standsOut(t) ? ' · stands out' : ''}</RowSub>
    </>
  );
}

/* "2026-10-19" → "Oct 19" */
const shortDate = (day: TriggerReview['at']) =>
  new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const DISMISSED_PAGE = 5;

/* A list of possible triggers with the owner's reviews: confirmed ones pinned
   first, then the open ones with Confirm / Not a trigger, then the ones marked
   not a trigger folded away (this period's first, newest first, five at a
   time) so they never pile up. `withSymptom` titles rows "Food → Symptom"
   (Possible triggers); without it, just the food (Before a symptom). */
function TriggerList({ reviewed, onReview, withSymptom, openLimit, empty }: {
  reviewed: ReviewedTriggers;
  onReview?: (t: Pick<SymptomTrigger, 'kind' | 'trigger' | 'symptom'>, verdict: TriggerVerdict | null) => void;
  withSymptom?: boolean;
  openLimit: number;
  empty: string;
}) {
  const [shown, setShown] = useState(0);
  const title = (t: { trigger: string; symptom: string }) => (withSymptom ? `${t.trigger} → ${t.symptom}` : t.trigger);
  const label = (t: { trigger: string; symptom: string }) => `${t.trigger} → ${t.symptom}`;
  const count = (t: SymptomTrigger) => (withSymptom ? `${Math.round(t.share * 100)}%` : `${t.before} of ${t.of} ${plural(t.of, 'time')}`);
  const facts = (t: SymptomTrigger) => (withSymptom ? <TriggerFacts t={t} /> : (
    <RowSub>{TRIGGER_KIND_LABEL[t.kind]} · usually on {Math.round(t.usual * 100)}% of days{standsOut(t) ? ' · stands out' : ''}</RowSub>
  ));
  const open = reviewed.open.slice(0, openLimit);
  const dismissed = [...reviewed.dismissed].sort((a, b) =>
    Number(!a.row) - Number(!b.row) || b.review.at.localeCompare(a.review.at));

  return (
    <>
      {reviewed.confirmed.map(({ review, row }) => (
        <ListRow key={triggerKey(review)}>
          <RowText>
            <ListName title={title(review)}>{title(review)}</ListName>
            {row ? facts(row) : <RowSub>{TRIGGER_KIND_LABEL[review.kind]} · not seen in this period</RowSub>}
            <Verdict>
              <Confirmed><TickMark checked size={16} />Confirmed {shortDate(review.at)}</Confirmed>
              {onReview && <ReviewBtn type="button" onClick={() => onReview(review, null)} aria-label={`Undo confirm ${label(review)}`}>Undo</ReviewBtn>}
            </Verdict>
          </RowText>
          {row && <ListCount>{count(row)}</ListCount>}
        </ListRow>
      ))}
      {open.length === 0 && reviewed.confirmed.length === 0 ? <Quiet>{empty}</Quiet> : open.map(t => (
        <ListRow key={triggerKey(t)}>
          <RowText>
            <ListName title={title(t)}>{title(t)}</ListName>
            {facts(t)}
            {onReview && (
              <Verdict>
                <ReviewBtn type="button" onClick={() => onReview(t, 'confirmed')} aria-label={`Confirm ${label(t)}`}>
                  <TickMark checked={false} size={16} />Confirm
                </ReviewBtn>
                <ReviewBtn type="button" onClick={() => onReview(t, 'dismissed')} aria-label={`${label(t)} is not a trigger`}>
                  Not a trigger
                </ReviewBtn>
              </Verdict>
            )}
          </RowText>
          <ListCount>{count(t)}</ListCount>
        </ListRow>
      ))}
      {dismissed.length > 0 && (
        <>
          <DismissedToggle type="button" aria-expanded={shown > 0} onClick={() => setShown(n => (n ? 0 : DISMISSED_PAGE))}>
            {dismissed.length} marked not a trigger · {shown ? 'Hide' : 'Show'}
          </DismissedToggle>
          {dismissed.slice(0, shown).map(({ review, row }) => (
            <ListRow key={triggerKey(review)}>
              <RowText>
                <ListName style={{ color: 'var(--text-muted)' }} title={title(review)}>{title(review)}</ListName>
                <RowSub>{TRIGGER_KIND_LABEL[review.kind]} · marked {shortDate(review.at)}{row ? '' : ' · not seen in this period'}</RowSub>
              </RowText>
              {onReview && <ReviewBtn type="button" onClick={() => onReview(review, null)} aria-label={`Restore ${label(review)}`}>Restore</ReviewBtn>}
            </ListRow>
          ))}
          {shown > 0 && shown < dismissed.length && (
            <DismissedToggle type="button" onClick={() => setShown(n => n + DISMISSED_PAGE)}>
              Show {Math.min(DISMISSED_PAGE, dismissed.length - shown)} more
            </DismissedToggle>
          )}
        </>
      )}
    </>
  );
}

/* ── Exercise ── */

const BigFigures = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 32px;
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-secondary);
  small { margin-left: 8px; font-family: var(--font-sans); font-size: 14px; font-weight: 400; color: var(--text-muted); }
`;

const WeekRow = styled.div`
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  align-items: center;
  gap: 18px;
  font-family: var(--font-sans);
  font-size: 14px;
  & + & { margin-top: 14px; }
  & > span:first-child { color: var(--text-muted); }
  & > span:last-child { color: var(--text-secondary); }
  @media (max-width: 480px) { gap: 12px; font-size: 15px; }
`;

const WeekBar = styled.div<{ $pct: number }>`
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(var(--color-accent), var(--color-accent)) no-repeat left / ${({ $pct }) => Math.max(4, $pct)}% 100%;
`;

const ImpactRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  font-family: var(--font-sans);
  & + & { margin-top: 18px; }
`;

const ImpactName = styled.div`
  font-size: 15px;
  color: var(--text-secondary);
  &::first-letter { text-transform: uppercase; }
`;

const ImpactSub = styled.div`
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-muted);
`;

const ImpactChange = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 15px;
  color: var(--text-muted);
  white-space: nowrap;
`;

const Delta = styled.b<{ $worse: boolean; $flat: boolean }>`
  font-weight: 600;
  color: ${({ $worse, $flat }) => ($flat ? 'var(--text-muted)' : $worse ? 'var(--mood-1)' : 'var(--chart-green)')};
`;

/* ── Helpers ── */

type WellnessMetric = 'water' | 'mood' | 'sleep';

const METRICS: Record<WellnessMetric, { name: string; color: string; max: number; unit: string; pick: (p: WellnessTrendPoint) => number }> = {
  water: { name: 'Water', color: 'var(--chart-blue)', max: 8, unit: '', pick: p => p.waterGlasses },
  mood: { name: 'Mood', color: 'var(--chart-amber)', max: 5, unit: '', pick: p => p.moodScore },
  sleep: { name: 'Sleep', color: 'var(--chart-violet)', max: 10, unit: 'h', pick: p => p.sleepHours },
};

/* Trailing 7-day average of the logged (non-zero) days — the dashed comparison line. */
function rollingAverage(vals: (number | null)[]): (number | null)[] {
  return vals.map((_, i) => {
    const win = vals.slice(Math.max(0, i - 6), i + 1).filter((v): v is number => v !== null);
    return win.length ? +(win.reduce((t, v) => t + v, 0) / win.length).toFixed(2) : null;
  });
}

const dayLabel = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* "W2026-10-11" → "Week of Oct 11", "2026-10" → "Oct 2026" */
function periodLabel(key: string): string {
  if (key.startsWith('W')) return `Week of ${dayLabel(key.slice(1))}`;
  if (/^\d{4}-\d{2}$/.test(key)) return new Date(key + '-15T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return dayLabel(key);
}

const PERIOD_TITLE: Record<PeriodType, string> = {
  today: 'Today', week: 'This week', month: 'This month', year: 'This year', custom: 'This period',
};

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`;

/* ── Props ── */

interface HealthReportProps {
  symptoms: DecryptedSymptom[];
  foods: DecryptedFood[];
  /** Meals for the food ↔ symptom patterns (reaching a little before the range); defaults to foods */
  patternFoods?: DecryptedFood[];
  medLogs: DecryptedMedicationLog[];
  exercises: DecryptedExercise[];
  wellness: DecryptedWellness[];
  period: PeriodType;
  /** Kept for callers; the report now draws in the accent token directly */
  accentColor?: string;
  /** Things changed in the period (medications, the Changes topic), newest first */
  changes?: HealthChange[];
  /** The owner's verdicts on possible triggers (encrypted setting, held by the view) */
  triggerReviews?: TriggerReviews;
  /** Mark a trigger confirmed / not a trigger (null clears); omitted = no buttons */
  onReviewTrigger?: (t: Pick<SymptomTrigger, 'kind' | 'trigger' | 'symptom'>, verdict: TriggerVerdict | null) => void;
  /** Open a change's entry (the medication, or the Changes entry) */
  onOpenChange?: (entryId: number) => void;
}

/* ── Component ── */

export function HealthReport({ symptoms, foods, patternFoods = foods, medLogs, exercises, wellness, period, triggerReviews, onReviewTrigger, changes = [], onOpenChange }: HealthReportProps) {
  // Food, medications and exercise before each symptom (What comes before symptoms)
  const [triggerWindow, setTriggerWindow] = useState<TriggerWindow>('4');
  const events = useMemo(() => triggerEvents(patternFoods, medLogs, exercises), [patternFoods, medLogs, exercises]);
  const reviewed = useMemo(() =>
    applyTriggerReviews(symptomTriggers(symptoms, events, Number(triggerWindow)), triggerReviews), [symptoms, events, triggerWindow, triggerReviews]);

  const coOccurrences = useMemo(() =>
    symptoms.length > 0 ? calculateSymptomCoOccurrences(symptoms) : [], [symptoms]);

  const exerciseImpact = useMemo(() =>
    exercises.length > 0 ? calculateExerciseImpact(symptoms, exercises) : [], [symptoms, exercises]);

  const exerciseFrequency = useMemo(() =>
    exercises.length > 0 ? calculateExerciseFrequency(exercises, period === 'year' ? 'month' : 'week') : [], [exercises, period]);

  /* Symptoms per day (per month over a year): count + average severity */
  const symptomBars = useMemo(() => {
    const byKey = new Map<string, number[]>();
    for (const s of symptoms) {
      const d = new Date(s.occurredAt);
      const key = period === 'year' ? localDay(d).slice(0, 7) : localDay(d);
      byKey.set(key, [...(byKey.get(key) ?? []), s.severity || 5]);
    }
    return [...byKey.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, sevs]) => ({
        key, count: sevs.length, avg: sevs.reduce((t, v) => t + v, 0) / sevs.length,
        changes: changes.filter(c => (period === 'year' ? c.date.slice(0, 7) : c.date) === key),
      }));
  }, [symptoms, period, changes]);

  const topSymptoms = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const s of symptoms) {
      const k = s.name.toLowerCase();
      const cur = counts.get(k);
      counts.set(k, { name: cur?.name ?? s.name, n: (cur?.n ?? 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  }, [symptoms]);

  const [chosenSymptom, setChosenSymptom] = useState('');
  const beforeSymptom = topSymptoms.find(t => t.name.toLowerCase() === chosenSymptom.toLowerCase())?.name ?? topSymptoms[0]?.name ?? '';
  // Everything before the chosen symptom, split by the reviews for that symptom
  const before = useMemo(() => {
    if (!beforeSymptom) return applyTriggerReviews([], {});
    const rows = symptomTriggers(symptoms, events, Number(triggerWindow), { symptom: beforeSymptom, minTimes: 1, minShare: 0 });
    const forSymptom = Object.fromEntries(Object.entries(triggerReviews ?? {})
      .filter(([, r]) => r?.symptom?.trim().toLowerCase() === beforeSymptom.trim().toLowerCase()));
    return applyTriggerReviews(rows, forSymptom);
  }, [symptoms, events, beforeSymptom, triggerWindow, triggerReviews]);


  const exerciseTotals = useMemo(() => {
    if (exercises.length === 0) return null;
    const byType = new Map<string, number>();
    for (const e of exercises) byType.set(e.exerciseType.toLowerCase(), (byType.get(e.exerciseType.toLowerCase()) ?? 0) + 1);
    const types = [...byType.entries()].sort((a, b) => b[1] - a[1]);
    const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
    return {
      sessions: exercises.length,
      minutes: exercises.reduce((t, e) => t + (e.duration || 0), 0),
      note: types.length === 1 ? `All logged as ${cap(types[0][0])}` : `Mostly ${cap(types[0][0])} · ${types.length} types`,
    };
  }, [exercises]);

  const wellnessTrend: WellnessTrendPoint[] = useMemo(() =>
    wellness.length > 0 ? calculateWellnessTrend(wellness) : [], [wellness]);

  const wellnessInsights: WellnessInsight[] = useMemo(() =>
    wellness.length >= 3 ? calculateWellnessInsights(wellness, symptoms, exercises) : [],
    [wellness, symptoms, exercises]);

  const wellnessSummary = useMemo(() => {
    if (wellness.length === 0) return null;
    const avg = (pick: (w: DecryptedWellness) => number) => {
      const xs = wellness.map(pick).filter(v => v > 0);
      return xs.length ? xs.reduce((t, v) => t + v, 0) / xs.length : 0;
    };
    return { avgWater: avg(w => w.waterGlasses), avgMood: avg(w => w.moodScore), avgSleep: avg(w => w.sleepHours), days: wellness.length };
  }, [wellness]);

  const [metric, setMetric] = useState<WellnessMetric>('sleep');
  const chart = useMemo(() => {
    const m = METRICS[metric];
    const values = wellnessTrend.map(p => (m.pick(p) > 0 ? m.pick(p) : null));
    const series: TrendSeries[] = [
      { label: 'Daily', values, color: m.color },
      { label: '7-day average', values: rollingAverage(values), ghost: true },
    ];
    // Each change sits on the first logged day on or after it
    const byIndex = new Map<number, HealthChange[]>();
    for (const c of changes) {
      const i = wellnessTrend.findIndex(p => p.date >= c.date);
      if (i >= 0) byIndex.set(i, [...(byIndex.get(i) ?? []), c]);
    }
    const markers = [...byIndex].sort((a, b) => a[0] - b[0]).map(([index, cs]) => ({
      index, label: cs.map(c => `${dayLabel(c.date)} · ${c.text}`).join(' · '), cs,
    }));
    return { m, labels: wellnessTrend.map(p => dayLabel(p.date)), series, markers };
  }, [wellnessTrend, metric, changes]);

  const hasAnything = changes.length > 0 || wellness.length > 0 || symptoms.length > 0 || exercises.length > 0 || foods.length > 0;
  const maxBar = Math.max(1, ...symptomBars.map(b => b.count));
  const maxWeek = Math.max(1, ...exerciseFrequency.map(d => d.count));

  if (!hasAnything) {
    return <Report><Quiet style={{ marginTop: 40 }}>Nothing logged in this period yet. Wellness check-ins, symptoms, meals and exercise show up here as you log them.</Quiet></Report>;
  }

  return (
    <Report>
      {changes.length > 0 && (
        <>
          <SectionHeading>Changes</SectionHeading>
          <Panel aria-label="Changes in this period">
            <PanelHead>
              <div>
                <PanelTitle>Changes in this period</PanelTitle>
                <PanelSub>What you changed, to line up against the data below. Marked ◆ on the charts.</PanelSub>
              </div>
            </PanelHead>
            {changes.map((c, i) => (
              <ChangeRow key={`${c.entryId}-${c.date}-${i}`}>
                <span className="when">{dayLabel(c.date)}</span>
                {onOpenChange
                  ? <button type="button" className="what" onClick={() => onOpenChange(c.entryId)}>{c.text}</button>
                  : <span className="what">{c.text}</span>}
                <span className="kind">{c.source === 'medication' ? 'Medication' : 'Other'}</span>
              </ChangeRow>
            ))}
          </Panel>
        </>
      )}

      {(wellnessSummary || symptoms.length > 0) && (
        <>
          <SectionHeading>Wellness</SectionHeading>
          <Stack>
            {wellnessSummary && (
              <StatTileRow $cols={3}>
                <StatTile
                  value={wellnessSummary.avgWater.toFixed(1)} unit="/ 8" name="Water"
                  caption={`avg glasses · ${wellnessSummary.days} ${plural(wellnessSummary.days, 'day')}`}
                  progress={wellnessSummary.avgWater / 8} color={METRICS.water.color}
                  selected={metric === 'water'} onSelect={() => setMetric('water')}
                />
                <StatTile
                  value={wellnessSummary.avgMood > 0 ? wellnessSummary.avgMood.toFixed(1) : '—'} unit="/ 5" name="Mood"
                  caption="avg score"
                  progress={wellnessSummary.avgMood / 5} color={METRICS.mood.color}
                  selected={metric === 'mood'} onSelect={() => setMetric('mood')}
                />
                <StatTile
                  value={wellnessSummary.avgSleep > 0 ? wellnessSummary.avgSleep.toFixed(1) : '—'} unit="h" name="Sleep"
                  caption="avg per night"
                  progress={wellnessSummary.avgSleep / 10} color={METRICS.sleep.color}
                  selected={metric === 'sleep'} onSelect={() => setMetric('sleep')}
                />
              </StatTileRow>
            )}

            {wellnessTrend.length > 1 && (
              <Panel aria-label={`${chart.m.name} over time`}>
                <PanelHead>
                  <PanelTitle>{chart.m.name} over time</PanelTitle>
                  <ChartLegend series={chart.series} />
                </PanelHead>
                <TrendChart
                  ariaLabel={`${chart.m.name} by day`}
                  labels={chart.labels}
                  yMax={chart.m.max}
                  formatTick={v => `${v}${chart.m.unit}`}
                  series={chart.series}
                  markers={chart.markers}
                />
                {chart.markers.length > 0 && (
                  <MarkerKey aria-label="Changes on this chart">
                    {chart.markers.flatMap(mk => mk.cs).map((c, i) => (
                      <li key={i}><i aria-hidden="true" />{dayLabel(c.date)} · {c.text}</li>
                    ))}
                  </MarkerKey>
                )}
              </Panel>
            )}

            <Panel aria-label="Insights">
              <PanelHead>
                <div>
                  <PanelTitle>Insights</PanelTitle>
                  <PanelSub>Cross-correlations between sleep, water, mood, exercise and symptoms</PanelSub>
                </div>
              </PanelHead>
              {wellnessInsights.map((insight, i) => (
                <InsightBox key={`w${i}`}>
                  <InsightHead>
                    {insight.label}
                    <Pill $found={insight.direction === 'positive'}>
                      {insight.direction === 'positive' ? 'Pattern found' : 'Tracking'} · {insight.dataPoints} {plural(insight.dataPoints, 'day')}
                    </Pill>
                  </InsightHead>
                  <Facts>
                    {[insight.high, insight.low].map(line => {
                      const [k, v] = splitFact(line);
                      return <div key={line} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>;
                    })}
                  </Facts>
                </InsightBox>
              ))}
              {wellnessInsights.length === 0 && (
                <Quiet>No patterns yet. Keep logging sleep, water, mood and symptoms to find them. Food, medications and exercise are under What comes before symptoms.</Quiet>
              )}
            </Panel>
          </Stack>
        </>
      )}

      {symptoms.length > 0 && (
        <>
          <SectionHeading>Symptoms</SectionHeading>
          <Stack>
            <Grid $cols={2}>
              <Panel aria-label="Frequency and severity">
                <PanelHead>
                  <PanelTitle>Frequency and severity</PanelTitle>
                  <Legend>
                    {SEVERITY_BANDS.map(b => <span key={b.name}><i style={{ background: b.color }} />{b.name} {b.range}</span>)}
                  </Legend>
                </PanelHead>
                <Bars role="img" aria-label="Symptoms per day, coloured by average severity">
                  {symptomBars.map(b => (
                    <BarCol key={b.key} title={`${periodLabel(b.key)}: ${b.count} · avg severity ${b.avg.toFixed(1)}${b.changes.map(c => ` · changed: ${c.text}`).join('')}`}>
                      {b.changes.length > 0 && <BarChange aria-label={`Changed: ${b.changes.map(c => c.text).join(', ')}`} />}
                      <BarCount>{b.count}</BarCount>
                      <Bar $h={(b.count / maxBar) * 78} $color={bandColor(Math.round(b.avg))} />
                    </BarCol>
                  ))}
                </Bars>
                <Bars as="div" aria-hidden="true" style={{ height: 'auto', marginTop: 10 }}>
                  {symptomBars.map(b => (
                    <BarCol key={b.key} style={{ height: 'auto' }}><BarLabel>{periodLabel(b.key).replace(/ \d{4}$/, '')}</BarLabel></BarCol>
                  ))}
                </Bars>
              </Panel>

              <Panel aria-label="Most common">
                <PanelHead><PanelTitle>Most common</PanelTitle></PanelHead>
                {topSymptoms.map(t => (
                  <ListRow key={t.name}><ListName title={t.name}>{t.name}</ListName><ListCount>{t.n}×</ListCount></ListRow>
                ))}
              </Panel>
            </Grid>

            {coOccurrences.length > 0 && (
              <Panel aria-label="Often together">
                <PanelHead>
                  <div>
                    <PanelTitle>Often together</PanelTitle>
                    <PanelSub>Symptoms that tend to occur within 24 hours of each other</PanelSub>
                  </div>
                </PanelHead>
                {coOccurrences.slice(0, 8).map((co, i) => (
                  <ListRow key={i}>
                    <ListName>{co.symptom1.name} ↔ {co.symptom2.name}</ListName>
                    <ListCount>{co.correlation}% · {co.coOccurrences}×</ListCount>
                  </ListRow>
                ))}
              </Panel>
            )}
          </Stack>
        </>
      )}

      {symptoms.length > 0 && events.length > 0 && (
        <>
          <SectionHeading>What comes before symptoms</SectionHeading>
          <WindowRow>
            <FilterTabs options={[...TRIGGER_WINDOWS]} active={triggerWindow} onChange={setTriggerWindow} label="Before a symptom" />
          </WindowRow>
          <Grid $cols={2}>
            <Panel aria-label="Possible triggers">
              <PanelHead>
                <div>
                  <PanelTitle>Possible triggers</PanelTitle>
                  <PanelSub>Food, medications and exercise logged before a symptom</PanelSub>
                </div>
              </PanelHead>
              <TriggerList
                reviewed={reviewed} onReview={onReviewTrigger} withSymptom openLimit={12}
                empty="Nothing yet. Something shows up here once it has come before the same symptom at least twice."
              />
            </Panel>

            <Panel aria-label="Before a symptom">
              <PanelHead>
                <div>
                  <PanelTitle>Before a symptom</PanelTitle>
                  <PanelSub>Everything logged before it, and how often you usually have it</PanelSub>
                </div>
              </PanelHead>
              {topSymptoms.length > 1 && (
                <Chips role="group" aria-label="Symptom" style={{ marginBottom: 12 }}>
                  {topSymptoms.map(t => (
                    <Chip key={t.name} type="button" $active={t.name === beforeSymptom} aria-pressed={t.name === beforeSymptom}
                      onClick={() => setChosenSymptom(t.name)}>{t.name}</Chip>
                  ))}
                </Chips>
              )}
              <TriggerList
                reviewed={before} onReview={onReviewTrigger} openLimit={10}
                empty={`Nothing logged before ${beforeSymptom ? beforeSymptom.toLowerCase() : 'it'} in this window.`}
              />
            </Panel>
          </Grid>
          <Quiet>These are patterns in what you logged, not a diagnosis. Talk with your doctor before changing a medication or cutting foods out.</Quiet>
        </>
      )}


      {exerciseTotals && (
        <>
          <SectionHeading>Exercise</SectionHeading>
          <Grid $cols={3}>
            <Panel aria-label={PERIOD_TITLE[period]}>
              <PanelHead><PanelTitle>{PERIOD_TITLE[period]}</PanelTitle></PanelHead>
              <BigFigures>
                <span>{exerciseTotals.sessions}<small>{plural(exerciseTotals.sessions, 'session')}</small></span>
                <span>{exerciseTotals.minutes}<small>min</small></span>
              </BigFigures>
              <Quiet>{exerciseTotals.note}</Quiet>
            </Panel>

            <Panel aria-label={period === 'year' ? 'By month' : 'By week'}>
              <PanelHead><PanelTitle>{period === 'year' ? 'By month' : 'By week'}</PanelTitle></PanelHead>
              {exerciseFrequency.slice(-6).map(d => (
                <WeekRow key={d.period}>
                  <span>{periodLabel(d.period)}</span>
                  <WeekBar $pct={(d.count / maxWeek) * 100} />
                  <span>{d.count} · {d.totalDuration} min</span>
                </WeekRow>
              ))}
            </Panel>

            <Panel aria-label="Impact on symptoms">
              <PanelHead>
                <div>
                  <PanelTitle>Impact on symptoms</PanelTitle>
                  <PanelSub>Severity change within 24 hours</PanelSub>
                </div>
              </PanelHead>
              {exerciseImpact.length === 0 ? (
                <Quiet>Not enough symptoms around your workouts yet.</Quiet>
              ) : exerciseImpact.map(impact => {
                const change = +(impact.avgSeverityAfter - impact.avgSeverityBefore).toFixed(1);
                return (
                  <ImpactRow key={impact.exerciseType}>
                    <div>
                      <ImpactName>{impact.exerciseType}</ImpactName>
                      <ImpactSub>{impact.occurrences} data {plural(impact.occurrences, 'point')}</ImpactSub>
                    </div>
                    <ImpactChange>
                      <span>{impact.avgSeverityBefore} → {impact.avgSeverityAfter}</span>
                      <Delta $worse={change > 0} $flat={change === 0}>{change > 0 ? `+${change}` : change < 0 ? `−${Math.abs(change)}` : '±0'}</Delta>
                    </ImpactChange>
                  </ImpactRow>
                );
              })}
            </Panel>
          </Grid>
        </>
      )}
    </Report>
  );
}
