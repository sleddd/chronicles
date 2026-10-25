import { Fragment, useMemo, useState } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import { ExerciseSubTabs } from '../components/molecules/ExerciseSubTabs.js';
import {
  Page, Inner, Head, Title, CsvLink, PeriodControls, Summary, Figures, Dates, Scroll, Table, Row, Name, Events,
  figure, fmtDay, fmtTime, rangeLabel, saveCsv,
} from '../components/molecules/HistoryKit.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { topics as topicsApi } from '../services/api.js';
import { stripHtml } from '../utils/stripHtml.js';
import { csvCell } from '../utils/csv.js';
import { exerciseTypeLabel } from '../utils/exerciseSummary.js';
import { medPeriodRange, type MedPeriod } from '../utils/medHistory.js';
import { formatShort, sessionsFrom } from '../utils/training.js';
import {
  buildExerciseHistory, exerciseHistoryTotals, searchExerciseHistory, type ExerciseHistoryRow,
} from '../utils/exerciseHistory.js';

/* Health → Exercise → History: what you did over a period, laid out like Med
   history — big text sub tabs with Download CSV across, period chips and a
   rounded search, "42 sessions  6 exercises  18 h 30" in big figures with
   the dates across, then one row per exercise (Sessions, Days, Time,
   Distance, Last done), each opening into its sessions (tap one to open it). */

const SubTabs = styled.div`
  padding: 32px 0 0;
`;

const fmtMiles = (mi: number) => (mi >= 10 ? Math.round(mi) : Math.round(mi * 10) / 10);

function downloadCsv(rows: ExerciseHistoryRow[], range: { from: string; to: string }) {
  const lines = ['date,time,exercise,activity,training category,minutes,distance,unit,from schedule'];
  for (const r of rows) {
    for (const e of [...r.events].reverse()) {
      lines.push([e.date, e.time ?? '', r.name, exerciseTypeLabel(e.exerciseType), e.category, e.minutes ? String(e.minutes) : '',
        e.distance ? String(e.distance) : '', e.distance ? e.unit : '', e.link ? 'yes' : 'no'].map(csvCell).join(','));
    }
  }
  saveCsv(lines, `exercise-${range.from}-to-${range.to}.csv`);
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
          <SubTabs>
            <ExerciseSubTabs aside={<CsvLink onClick={() => downloadCsv(rows, range)} disabled={!rows.length} />} />
          </SubTabs>

          <PeriodControls period={period} onPeriod={setPeriod} custom={custom} onCustom={setCustom} range={range}
            query={query} onQuery={setQuery} searchLabel="Search exercise" />

          <Summary>
            <Figures>
              <span><strong>{totals.sessions}</strong>{totals.sessions === 1 ? 'session' : 'sessions'}</span>
              <span><strong>{totals.exercises}</strong>{totals.exercises === 1 ? 'exercise' : 'exercises'}</span>
              {totals.minutes > 0 && <span>{figure(formatShort(totals.minutes))}</span>}
            </Figures>
            <Dates>{rangeLabel(range)}</Dates>
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
                          <td className="num">{r.sessions}</td>
                          <td className="num">{r.days}</td>
                          <td className={`num${r.minutes ? '' : ' muted'}`}>{r.minutes ? formatShort(r.minutes) : '—'}</td>
                          <td className={`num${r.miles ? '' : ' muted'}`}>{r.miles ? `${fmtMiles(r.miles)} mi` : '—'}</td>
                          <td className="num">{fmtDay(r.last, multiYear)}</td>
                        </Row>
                        {isOpen && (
                          <tr>
                            <Events colSpan={6}>
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
                            </Events>
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
