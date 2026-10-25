import { Fragment, useMemo, useState } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import {
  Page, Inner, Head, Title, CsvLink, PeriodControls, Summary, Figures, Dates, Scroll, Table, Row, Name, Events,
  fmtDay, fmtTime, rangeLabel, saveCsv,
} from '../components/molecules/HistoryKit.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { topics as topicsApi } from '../services/api.js';
import { entryDay } from '../utils/foodLog.js';
import { stripHtml } from '../utils/stripHtml.js';
import { csvCell } from '../utils/csv.js';
import { formatShort } from '../utils/training.js';
import { medPeriodRange, type MedPeriod } from '../utils/medHistory.js';
import {
  buildSymptomHistory, searchSymptomHistory, severityWord, symptomEventsFrom, symptomHistoryTotals, type SymptomHistoryRow,
} from '../utils/symptomHistory.js';

/* Health → Symptoms: what you noticed over a period, laid out like Exercise
   history — Log symptom and Download CSV in the header, period chips and a
   rounded search, "12 times  5 symptoms  9 days" in big figures with the dates
   across, then one row per symptom (Times, Days, Average, Worst, Last), each
   opening into its occurrences (tap one to open it). */

const HeadActions = styled.div`
  display: flex;
  align-items: center;
  gap: 24px;
  @media (max-width: 480px) { gap: 16px; }
`;

function downloadCsv(rows: SymptomHistoryRow[], range: { from: string; to: string }) {
  const lines = ['date,time,symptom,severity,minutes,notes'];
  for (const r of rows) {
    for (const e of [...r.events].reverse()) {
      lines.push([e.date, e.time, r.name, e.severity === null ? '' : String(e.severity), e.minutes ? String(e.minutes) : '', e.notes]
        .map(csvCell).join(','));
    }
  }
  saveCsv(lines, `symptoms-${range.from}-to-${range.to}.csv`);
}

export function SymptomHistoryView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const openInJournal = useOpenInJournal();
  const newEntry = useNewEntryInJournal();
  const [period, setPeriod] = useState<MedPeriod>('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const events = useMemo(() => {
    const topicId = allTopics.find(t => t.name.toLowerCase() === 'symptom')?.id;
    if (topicId === undefined) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown> | undefined)?._taxonomyId === topicId)
      .flatMap(e => symptomEventsFrom({
        id: e.id,
        day: entryDay(e, 'occurredDate'),
        title: stripHtml(e.content),
        cf: ((e.metadata as Record<string, unknown>)._customFields ?? {}) as Record<string, unknown>,
      }));
  }, [entries, allTopics]);
  const range = useMemo(() => medPeriodRange(period, new Date(), custom), [period, custom]);
  const all = useMemo(() => buildSymptomHistory(events, range), [events, range]);
  const rows = useMemo(() => searchSymptomHistory(all, query), [all, query]);
  const totals = symptomHistoryTotals(rows);

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const logSymptom = async () => {
    const { allTopics: topics, setTopics } = useEntriesStore.getState();
    let topic = topics.find(t => t.name.toLowerCase() === 'symptom');
    if (!topic) {
      topic = await topicsApi.create({ name: 'Symptom', icon: 'flask' });
      setTopics([...topics, topic]);
    }
    newEntry(topic.id);
  };

  if (needsUnlock) return (<><ContentTemplate><EmptyState message="Unlock your journal to see your symptoms" /></ContentTemplate><UnlockDialog onUnlock={handleUnlock} /></>);
  if (isLoading || !isReady) return (<ContentTemplate><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner size={40} /></div></ContentTemplate>);

  const multiYear = range.from.slice(0, 4) !== range.to.slice(0, 4);
  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>Health</Title>
            <HeadActions>
              <CsvLink onClick={() => downloadCsv(rows, range)} disabled={!rows.length} />
              <PillButton type="button" onClick={() => void logSymptom()}>Log symptom</PillButton>
            </HeadActions>
          </Head>
          <HealthTabBar />

          <PeriodControls period={period} onPeriod={setPeriod} custom={custom} onCustom={setCustom} range={range}
            query={query} onQuery={setQuery} searchLabel="Search symptoms" />

          <Summary>
            <Figures>
              <span><strong>{totals.times}</strong>{totals.times === 1 ? 'time' : 'times'}</span>
              <span><strong>{totals.symptoms}</strong>{totals.symptoms === 1 ? 'symptom' : 'symptoms'}</span>
              {totals.days > 0 && <span><strong>{totals.days}</strong>{totals.days === 1 ? 'day' : 'days'}</span>}
            </Figures>
            <Dates>{rangeLabel(range)}</Dates>
          </Summary>

          {rows.length === 0 ? (
            <EmptyState message={query ? 'No symptoms match that search.' : 'No symptoms logged in this period.'} />
          ) : (
            <Scroll>
              <Table>
                <thead>
                  <tr>
                    <th>Symptom</th>
                    <th className="num">Times</th>
                    <th className="num">Days</th>
                    <th className="num">Average</th>
                    <th className="num">Worst</th>
                    <th className="num">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const isOpen = open.has(r.key);
                    return (
                      <Fragment key={r.key}>
                        <Row tabIndex={0} aria-expanded={isOpen} onClick={() => toggle(r.key)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(r.key); } }}>
                          <td><Name>{r.name}{r.detail && <span>{r.detail}</span>}</Name></td>
                          <td className="num">{r.times}</td>
                          <td className="num">{r.days}</td>
                          <td className={`num${r.average === null ? ' muted' : ''}`}>{r.average === null ? '—' : r.average}</td>
                          <td className={`num${r.worst === null ? ' muted' : ''}`}>{r.worst === null ? '—' : `${r.worst} · ${severityWord(r.worst)}`}</td>
                          <td className="num">{fmtDay(r.last, multiYear)}</td>
                        </Row>
                        {isOpen && (
                          <tr>
                            <Events colSpan={6}>
                              <ul aria-label={`${r.name} times`}>
                                {r.events.map((e, i) => (
                                  <li key={`${e.id}-${i}`}>
                                    <button type="button" onClick={() => openInJournal(e.id)} title={e.notes || undefined}>
                                      {fmtDay(e.date, multiYear)}
                                      <span>
                                        {[fmtTime(e.time), e.severity === null ? '' : `${e.severity} ${severityWord(e.severity)}`,
                                          e.minutes ? formatShort(e.minutes) : ''].filter(Boolean).join(' · ') || 'Logged'}
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
