import { Fragment, useMemo, useState } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { DateInput } from '../components/atoms/DateInput.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import { ExerciseSubTabs } from '../components/molecules/ExerciseSubTabs.js';
import { FilterTabs } from '../components/molecules/FilterTabs.js';
import { SearchInput } from '../components/molecules/SearchInput.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { topics as topicsApi } from '../services/api.js';
import { parseDay } from '../utils/foodLog.js';
import { stripHtml } from '../utils/stripHtml.js';
import { csvCell } from '../utils/csv.js';
import { exerciseTypeLabel } from '../utils/exerciseSummary.js';
import { MED_PERIODS, medPeriodRange, type MedPeriod } from '../utils/medHistory.js';
import { formatShort, sessionsFrom } from '../utils/training.js';
import {
  buildExerciseHistory, exerciseHistoryTotals, searchExerciseHistory, type ExerciseHistoryRow,
} from '../utils/exerciseHistory.js';

/* Health → Exercise → History: what you did over a period, laid out like Med
   history — Period tabs, a search, Download CSV, "42 sessions across 6
   exercises · 18 h 30", then one row per exercise (Sessions, Days, Time,
   Distance, Last done), each opening into its sessions (tap one to open it). */

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

const Head = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 53px 0 28px;
`;

const Title = styled.h1`
  margin: 0;
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  @media (max-width: 480px) { font-size: 34px; }
`;

const SubTabs = styled.div`
  padding: 24px 0 0;
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-top: 20px;
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

/* Med history's table: one outlined --bg-panel box, hairline rows, no column rules */
const Scroll = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
`;

const Table = styled.table`
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
  th:first-child, td:first-child { padding-left: 24px; }
  th:last-child, td:last-child { padding-right: 24px; }
  tbody tr:last-child td { border-bottom: none; }
  th { font-size: 14px; font-weight: 500; color: var(--text-tertiary); white-space: nowrap; padding: 18px 14px 6px; border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: var(--text-muted); }
`;

const Row = styled.tr`
  cursor: pointer;
  &:hover td { background: var(--bg-row-hover); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

const Name = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  span { font-size: 13px; color: var(--text-muted); }
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

const Sessions = styled.td`
  && { padding-top: 0; padding-bottom: 18px; background: var(--bg-app); }
  ul { list-style: none; margin: 0; padding: 4px 0 0 17px; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 6px 24px; }
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

const fmtDay = (day: string, withYear = false) =>
  parseDay(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });

const fmtTime = (hhmm?: string) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const fmtMiles = (mi: number) => (mi >= 10 ? Math.round(mi) : Math.round(mi * 10) / 10);

function downloadCsv(rows: ExerciseHistoryRow[], range: { from: string; to: string }) {
  const lines = ['date,time,exercise,activity,training category,minutes,distance,unit,from schedule'];
  for (const r of rows) {
    for (const e of [...r.events].reverse()) {
      lines.push([e.date, e.time ?? '', r.name, exerciseTypeLabel(e.exerciseType), e.category, e.minutes ? String(e.minutes) : '',
        e.distance ? String(e.distance) : '', e.distance ? e.unit : '', e.link ? 'yes' : 'no'].map(csvCell).join(','));
    }
  }
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `exercise-${range.from}-to-${range.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExerciseHistoryView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const [period, setPeriod] = useState<MedPeriod>('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sessions = useMemo(
    () => sessionsFrom(entries, allTopics.find(t => t.name.toLowerCase() === 'exercise')?.id, stripHtml),
    [entries, allTopics],
  );
  const range = useMemo(() => medPeriodRange(period, new Date(), custom), [period, custom]);
  const all = useMemo(() => buildExerciseHistory(sessions, range), [sessions, range]);
  const rows = useMemo(() => searchExerciseHistory(all, query), [all, query]);
  const totals = exerciseHistoryTotals(rows);

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const logExercise = async () => {
    const { allTopics: topics, setTopics } = useEntriesStore.getState();
    let topic = topics.find(t => t.name.toLowerCase() === 'exercise');
    if (!topic) {
      topic = await topicsApi.create({ name: 'Exercise', icon: 'dumbbell' });
      setTopics([...topics, topic]);
    }
    newEntry(topic.id);
  };

  if (needsUnlock) return (<><ContentTemplate><EmptyState message="Unlock your journal to see your exercise history" /></ContentTemplate><UnlockDialog onUnlock={handleUnlock} /></>);
  if (isLoading || !isReady) return (<ContentTemplate><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></ContentTemplate>);

  const multiYear = range.from.slice(0, 4) !== range.to.slice(0, 4);
  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Health</Title>
            <PillButton type="button" onClick={() => void logExercise()}>Log exercise</PillButton>
          </Head>
          <HealthTabBar />
          <SubTabs><ExerciseSubTabs /></SubTabs>

          <Controls>
            <FilterTabs options={MED_PERIODS} active={period} onChange={setPeriod} label="Period" />
            <SearchBox><SearchInput value={query} onChange={setQuery} placeholder="Search exercise" /></SearchBox>
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
            <strong>{totals.sessions}</strong> {totals.sessions === 1 ? 'session' : 'sessions'} across{' '}
            <strong>{totals.exercises}</strong> {totals.exercises === 1 ? 'exercise' : 'exercises'}
            {totals.minutes > 0 && <> · {formatShort(totals.minutes)}</>} · {fmtDay(range.from, multiYear)} – {fmtDay(range.to, true)}
          </Summary>

          {rows.length === 0 ? (
            <EmptyState message={query ? 'No exercise matches that search.' : 'No exercise logged in this period.'} />
          ) : (
            <Scroll>
              <Table>
                <thead>
                  <tr>
                    <th>Exercise</th>
                    <th className="num">Sessions</th>
                    <th className="num">Days</th>
                    <th className="num">Time</th>
                    <th className="num">Distance</th>
                    <th className="num">Last done</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const isOpen = open.has(r.key);
                    return (
                      <Fragment key={r.key}>
                        <Row tabIndex={0} aria-expanded={isOpen} onClick={() => toggle(r.key)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(r.key); } }}>
                          <td><Name data-open={isOpen}>{r.name}{r.detail && <span>{r.detail}</span>}</Name></td>
                          <td className="num">{r.sessions}×</td>
                          <td className="num">{r.days}</td>
                          <td className={`num${r.minutes ? '' : ' muted'}`}>{r.minutes ? formatShort(r.minutes) : '—'}</td>
                          <td className={`num${r.miles ? '' : ' muted'}`}>{r.miles ? `${fmtMiles(r.miles)} mi` : '—'}</td>
                          <td className="num muted">{fmtDay(r.last, multiYear)}</td>
                        </Row>
                        {isOpen && (
                          <tr>
                            <Sessions colSpan={6}>
                              <ul aria-label={`${r.name} sessions`}>
                                {r.events.map(e => (
                                  <li key={e.id}>
                                    <button type="button" onClick={() => openInJournal(e.id)} title={e.title}>
                                      {fmtDay(e.date, multiYear)}
                                      <span>
                                        {[fmtTime(e.time), e.minutes ? formatShort(e.minutes) : '', e.distance ? `${e.distance} ${e.unit}` : '']
                                          .filter(Boolean).join(' · ') || 'Logged'}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </Sessions>
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
