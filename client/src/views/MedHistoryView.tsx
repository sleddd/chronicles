import { Fragment, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { DateInput } from '../components/atoms/DateInput.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import { FilterTabs } from '../components/molecules/FilterTabs.js';
import { SearchInput } from '../components/molecules/SearchInput.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { doses as dosesApi, type DoseLogRecord } from '../services/api.js';
import { foodRowsFrom, parseDay } from '../utils/foodLog.js';
import { stripHtml } from '../utils/stripHtml.js';
import { csvCell } from '../utils/csv.js';
import {
  MED_PERIODS, buildMedHistory, medHistoryTotals, medPeriodRange, searchMedHistory,
  type MedHistoryRow, type MedInfo, type MedPeriod,
} from '../utils/medHistory.js';

/* Health → Med history: what was taken over a period, how often, and when —
   searchable, with each medication opening into its doses. Doses ticked off in
   the schedule plus medications and supplements logged in Meals. */

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
  padding: 0 24px 64px;
  @media (max-width: 768px) { padding: 0 16px 48px; }
`;

const Title = styled.h1`
  margin: 0;
  padding: 53px 0 28px;
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  @media (max-width: 480px) { font-size: 34px; }
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-top: 24px;
  > :last-child { margin-left: auto; }
`;

const SearchBox = styled.div`
  flex: 1 1 220px;
  max-width: 320px;
`;

const Range = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  font-size: 15px;
  color: var(--text-muted);
`;

const Summary = styled.p`
  margin: 28px 0 16px;
  font-size: 15px;
  color: var(--text-muted);
  strong { font-family: var(--font-display); font-size: 22px; font-weight: 300; color: var(--text-primary); }
`;

/* The Meals log's table look: one outlined --bg-panel box, hairline rows, no column rules */
const Scroll = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
`;

const Table = styled.table`
  width: 100%;
  min-width: 560px;
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
  th:first-child, td:first-child { padding-left: 24px; }
  th:last-child, td:last-child { padding-right: 24px; }
  tbody tr:last-child td { border-bottom: none; }
  th { font-size: 14px; font-weight: 500; color: var(--text-tertiary); white-space: nowrap; padding: 18px 14px 6px; border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: var(--text-muted); }
`;

const MedRow = styled.tr`
  cursor: pointer;
  &:hover td { background: var(--bg-row-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

const Name = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  span { font-size: 13px; color: var(--text-muted); }
  /* The app's chevron (CollapsibleCard), turning as the row opens */
  &::before {
    content: '';
    flex: none;
    width: 7px;
    height: 7px;
    border-right: 1.5px solid var(--text-muted);
    border-bottom: 1.5px solid var(--text-muted);
    transform: translateY(-3px) rotate(-45deg);
    transition: transform 0.15s ease;
  }
  &[data-open='true']::before { transform: translateY(-4px) rotate(45deg); }
`;

const Doses = styled.td`
  && { padding-top: 0; padding-bottom: 18px; background: var(--bg-app); }
  ul { list-style: none; margin: 0; padding: 4px 0 0 17px; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px 24px; }
  li { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; color: var(--text-secondary); }
  li span { color: var(--text-muted); }
  li[data-skipped] { color: var(--text-muted); text-decoration: line-through; }
`;

const fmtDay = (day: string, withYear = false) =>
  parseDay(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });

const fmtTime = (hhmm: string) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

function downloadCsv(rows: MedHistoryRow[], range: { from: string; to: string }) {
  const lines = ['date,time,medication,dosage,status,source'];
  for (const r of rows) {
    for (const e of [...r.events].reverse()) {
      lines.push([e.day, e.time, r.name, r.dosage, e.status, e.source === 'meals' ? 'logged in Meals' : 'schedule'].map(csvCell).join(','));
    }
  }
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `medications-${range.from}-to-${range.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MedHistoryView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const [period, setPeriod] = useState<MedPeriod>('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [doses, setDoses] = useState<DoseLogRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    dosesApi.getAll()
      .then(({ logs }) => { if (!cancelled) setDoses(logs); })
      .catch(() => { if (!cancelled) { setDoses([]); setLoadError(true); } });
    return () => { cancelled = true; };
  }, [isReady]);

  const meds = useMemo<MedInfo[]>(() => {
    const topicId = allTopics.find(t => t.name.toLowerCase() === 'medication')?.id;
    if (topicId === undefined) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown> | undefined)?._taxonomyId === topicId)
      .map(e => {
        const cf = ((e.metadata as Record<string, unknown>)._customFields ?? {}) as Record<string, unknown>;
        const name = typeof cf.medicationName === 'string' && cf.medicationName.trim() ? cf.medicationName : stripHtml(e.content);
        return { id: e.id, name: name.trim().slice(0, 120), dosage: typeof cf.dosage === 'string' ? cf.dosage.trim() : '' };
      });
  }, [entries, allTopics]);

  const foodRows = useMemo(() => {
    const topicId = allTopics.find(t => t.name.toLowerCase() === 'meals')?.id;
    return foodRowsFrom(entries, topicId);
  }, [entries, allTopics]);

  const range = useMemo(() => medPeriodRange(period, new Date(), custom), [period, custom]);
  const all = useMemo(() => (doses ? buildMedHistory(doses, meds, foodRows, range) : []), [doses, meds, foodRows, range]);
  const rows = useMemo(() => searchMedHistory(all, query), [all, query]);
  const totals = medHistoryTotals(rows);

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (needsUnlock) return (<><ContentTemplate><EmptyState message="Unlock your journal to see your medication history" /></ContentTemplate><UnlockDialog onUnlock={handleUnlock} /></>);
  if (isLoading || !isReady || !doses) return (<ContentTemplate><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></ContentTemplate>);

  const multiYear = range.from.slice(0, 4) !== range.to.slice(0, 4);
  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Title>Health</Title>
          <HealthTabBar />

          <Controls>
            <FilterTabs options={MED_PERIODS} active={period} onChange={setPeriod} label="Period" />
            <SearchBox><SearchInput value={query} onChange={setQuery} placeholder="Search medications" /></SearchBox>
            <PillButton type="button" $variant="neutral" onClick={() => downloadCsv(rows, range)} disabled={!rows.length}>Download CSV</PillButton>
          </Controls>
          {period === 'custom' && (
            <Range>
              <span>From</span>
              <DateInput value={custom.from || range.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
              <span>To</span>
              <DateInput value={custom.to || range.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
            </Range>
          )}

          <Summary>
            <strong>{totals.taken}</strong> {totals.taken === 1 ? 'dose' : 'doses'} taken across{' '}
            <strong>{totals.medications}</strong> {totals.medications === 1 ? 'medication' : 'medications'}
            {totals.skipped > 0 && <> · {totals.skipped} skipped</>} · {fmtDay(range.from, multiYear)} – {fmtDay(range.to, true)}
          </Summary>

          {loadError && <Summary role="alert">Couldn’t load your dose history. Medications logged in Meals are shown.</Summary>}

          {rows.length === 0 ? (
            <EmptyState message={query ? 'No medications match that search.' : 'Nothing taken in this period.'} />
          ) : (
            <Scroll>
              <Table>
                <thead>
                  <tr>
                    <th>Medication</th>
                    <th className="num">Taken</th>
                    <th className="num">Days</th>
                    <th className="num">Skipped</th>
                    <th className="num">Last taken</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const isOpen = open.has(r.key);
                    return (
                      <Fragment key={r.key}>
                        <MedRow tabIndex={0} aria-expanded={isOpen} onClick={() => toggle(r.key)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(r.key); } }}>
                          <td><Name data-open={isOpen}>{r.name}{r.dosage && <span>{r.dosage}</span>}</Name></td>
                          <td className="num">{r.taken}×</td>
                          <td className="num">{r.days}</td>
                          <td className={`num${r.skipped ? '' : ' muted'}`}>{r.skipped || '—'}</td>
                          <td className="num muted">{r.lastTaken ? fmtDay(r.lastTaken, multiYear) : '—'}</td>
                        </MedRow>
                        {isOpen && (
                          <tr>
                            <Doses colSpan={5}>
                              <ul aria-label={`${r.name} doses`}>
                                {r.events.map(e => (
                                  <li key={e.key} data-skipped={e.status === 'skipped' ? '' : undefined}>
                                    {fmtDay(e.day, multiYear)}
                                    <span>{e.status === 'skipped' ? 'Skipped' : fmtTime(e.time) || (e.source === 'meals' ? 'Logged' : 'Taken')}</span>
                                  </li>
                                ))}
                              </ul>
                            </Doses>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </Table>
            </Scroll>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
