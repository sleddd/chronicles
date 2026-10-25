import { Fragment } from 'react';
import styled from 'styled-components';
import { DateInput } from '../atoms/DateInput.js';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { RoundSearch } from './RoundSearch.js';
import { Chips, Chip } from './fields/formKit.js';
import { parseDay } from '../../utils/foodLog.js';
import { MED_PERIODS, type MedPeriod } from '../../utils/medHistory.js';

/* The history pages' shared look (Health → Exercise → History, Symptoms):
   period chips with a rounded search across, big thin summary figures with the
   dates across, then a --bg-panel table (no outline, a firmer rule under the
   header) whose rows open into their events. Props only. */

export const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

export const Inner = styled.div`
  width: 100%;
  max-width: 1150px;
  margin: 0 auto;
  padding: 0 24px 64px;
  @media (max-width: 768px) { padding: 0 16px 48px; }
`;

export const Head = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 53px 0 28px;
`;

export const Title = styled.h1`
  margin: 0;
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  @media (max-width: 480px) { font-size: 34px; }
`;

const CsvButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  cursor: pointer;
  &:hover:not(:disabled) { color: var(--text-primary); }
  &:disabled { color: var(--text-placeholder); cursor: default; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }
`;

/** "↓ Download CSV" as a plain link */
export function CsvLink({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <CsvButton type="button" onClick={onClick} disabled={disabled}>
      <MaterialIcon $size={20}>download</MaterialIcon>Download CSV
    </CsvButton>
  );
}

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin-top: 24px;
`;

const SearchBox = styled.div`
  flex: 0 1 330px;
  @media (max-width: 768px) { flex: 1 1 100%; }
`;

const Range = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  font-size: 15px;
  color: var(--text-muted);
`;

/** Period chips on the left, the rounded search on the right, From / To under them for Custom */
export function PeriodControls({ period, onPeriod, custom, onCustom, range, query, onQuery, searchLabel }: {
  period: MedPeriod;
  onPeriod: (p: MedPeriod) => void;
  custom: { from: string; to: string };
  onCustom: (c: { from: string; to: string }) => void;
  range: { from: string; to: string };
  query: string;
  onQuery: (q: string) => void;
  searchLabel: string;
}) {
  return (
    <>
      <Controls>
        <Chips role="group" aria-label="Period">
          {MED_PERIODS.map(p => (
            <Chip key={p.value} type="button" $active={period === p.value} aria-pressed={period === p.value}
              onClick={() => onPeriod(p.value)}>{p.label}</Chip>
          ))}
        </Chips>
        <SearchBox><RoundSearch value={query} onChange={onQuery} placeholder={searchLabel} ariaLabel={searchLabel} /></SearchBox>
      </Controls>
      {period === 'custom' && (
        <Range>
          <span>From</span>
          <DateInput value={custom.from || range.from} onChange={e => onCustom({ ...custom, from: e.target.value })} />
          <span>To</span>
          <DateInput value={custom.to || range.to} onChange={e => onCustom({ ...custom, to: e.target.value })} />
        </Range>
      )}
    </>
  );
}

/* "3 sessions   3 exercises   28 min" in big thin figures, the dates across from them */
export const Summary = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 24px;
  margin: 32px 0 14px;
  font-family: var(--font-sans);
`;

export const Figures = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 28px;
  font-size: 15px;
  color: var(--text-secondary);
  strong { margin-right: 6px; font-family: var(--font-display); font-size: 30px; font-weight: 300; color: var(--text-primary); }
`;

export const Dates = styled.span`
  font-size: 14px;
  color: var(--text-muted);
`;

/** "18 h 30" → big "18" h big "30"; "28 min" → big "28" min */
export function figure(text: string) {
  return text.split(' ').map((part, i) => (/^\d/.test(part) ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part} </Fragment>));
}

export const Scroll = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding: 6px 24px;
  background: var(--bg-panel);
  border-radius: 12px;
  @media (max-width: 480px) { padding: 4px 14px; }
`;

export const Table = styled.table`
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  th, td {
    text-align: left;
    padding: 14px;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: middle;
  }
  th:first-child, td:first-child { padding-left: 0; }
  th:last-child, td:last-child { padding-right: 0; }
  tbody tr:last-child td { border-bottom: none; }
  th { font-size: 14px; font-weight: 400; color: var(--text-muted); white-space: nowrap; padding: 16px 14px 14px; border-bottom: 1px solid var(--border-card); }
  td { padding-top: 18px; padding-bottom: 18px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: var(--text-muted); }
`;

export const Row = styled.tr`
  cursor: pointer;
  &:hover td { background: var(--bg-row-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

export const Name = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  span { font-size: 13px; color: var(--text-muted); }
`;

/* A row's events, opened under it: one button per event (opens its entry) */
export const Events = styled.td`
  && { padding-top: 0; padding-bottom: 18px; background: var(--bg-app); }
  ul { list-style: none; margin: 0; padding: 4px 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 6px 24px; }
  button {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-secondary);
    text-align: left;
    cursor: pointer;
  }
  button:hover { text-decoration: underline; }
  button span { color: var(--text-muted); }
`;

export const fmtDay = (day: string, withYear = false) =>
  parseDay(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });

export const fmtTime = (hhmm?: string) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

/** "Oct 1 – 31, 2026", "Sep 1 – Oct 31, 2026", "Dec 1, 2025 – Jan 31, 2026" */
export function rangeLabel({ from, to }: { from: string; to: string }): string {
  const a = parseDay(from), b = parseDay(to);
  const md = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (a.getFullYear() !== b.getFullYear()) return `${md(a)}, ${a.getFullYear()} – ${md(b)}, ${b.getFullYear()}`;
  if (a.getMonth() === b.getMonth()) return `${md(a)} – ${b.getDate()}, ${b.getFullYear()}`;
  return `${md(a)} – ${md(b)}, ${b.getFullYear()}`;
}

/** Save `lines` as a CSV file */
export function saveCsv(lines: string[], filename: string) {
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
