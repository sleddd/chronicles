import { useState, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { HealthTabBar } from '../components/molecules/HealthTabBar.js';
import { FilterTabs } from '../components/molecules/FilterTabs.js';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
import { NewEntryCard } from '../components/organisms/NewEntryCard.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { PrintButton } from '../components/atoms/PrintButton.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal } from '../hooks/useOpenInJournal.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { builtinEntryName, stripHtml } from '../utils/stripHtml.js';
import { toDateStr, startOfWeek, startOfMonth } from '../utils/dateUtils.js';
import type { DateFilter } from '../types/health.js';

const DATE_FILTERS = [
  { value: 'all' as const, label: 'All' },
  { value: 'today' as const, label: 'Today' },
  { value: 'week' as const, label: 'This Week' },
  { value: 'month' as const, label: 'This Month' },
];

/* ── Layout (mirrors Topics) ── */

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
  padding: 53px 0 16px;
`;

const Title = styled.h1`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 0;
  @media (max-width: 480px) { font-size: 34px; }
`;

const NewBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 9px 4px;
  font-family: var(--font-label);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: transparent;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 120ms ease;
  &:hover { opacity: 0.7; }
`;

/* Tabs row — full-bleed within the column. */
const TabsRow = styled.div`
  margin: 0;
`;

const SubTabs = styled.div`
  padding: 10px 0 4px;
`;

const SummaryBar = styled.div`
  display: flex;
  justify-content: flex-start;
  gap: 32px;
  padding: 14px 4px;
  border-top: 1px solid var(--border-subtle);
`;

const SumItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const SumLabel = styled.span`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

const SumValue = styled.span`
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  color: var(--text-primary);
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
`;

/* Print-only report: a heading + details table replaces the on-screen list,
   which carries none of the entry's structured fields. */
const PrintReport = styled.div`
  display: none;
  @media print { display: block; }
`;

const PrintTitle = styled.h1`
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 300;
  color: var(--text-primary);
  margin: 0 0 4px;
`;

const PrintDate = styled.p`
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--text-tertiary);
  margin: 0 0 16px;
`;

const PrintTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--text-primary);

  th, td {
    text-align: left;
    vertical-align: top;
    padding: 6px 8px 6px 0;
    border-bottom: 1px solid var(--border-default);
  }
  th {
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  tr { break-inside: avoid; }
`;

/* ── Helpers ── */

/** Human-readable value for a structured field in the print report. */
function formatFieldValue(key: string, value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (key === 'severity') return `${value}/10`;
  if (key === 'duration' && /^\d+$/.test(String(value))) return `${value} min`;
  const str = String(value);
  // snake_case enum values (e.g. once_daily) → "Once daily"
  if (/^[a-z]+(_[a-z]+)+$/.test(str)) {
    const words = str.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return str;
}

/* ── Props ── */

interface SummaryField {
  key: string;
  label: string;
  format?: (total: number) => string;
}

interface HealthViewProps {
  /** Topic names whose entries this page shows. */
  topicNames: string[];
  metaFields?: { key: string; label: string }[];
  showDateFilter?: boolean;
  printable?: boolean;
  summaryFields?: SummaryField[];
  /** Page title — defaults to "Health". */
  title?: string;
  /** Heading for the printed report — defaults to the page title. */
  printTitle?: string;
  /** Tab bar shown under the title — defaults to the Health tabs. */
  tabBar?: React.ReactNode;
}

/**
 * Unified single-column Health entry page: "Health" title, the Health tab bar
 * (tabs), a date filter (sub-tabs), then the entry list. Entries swipe to
 * reveal edit/delete; clicking (or swipe-edit) opens the entry in the journal
 * editor — its breadcrumb leads back here.
 */
export function HealthView({ topicNames, metaFields = [], showDateFilter = true, printable = false, summaryFields = [], title = 'Health', printTitle, tabBar }: HealthViewProps) {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const accentColor = useUIStore(s => s.accentColor) || '#4A5568';
  const openInJournal = useOpenInJournal();

  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // The add affordance appears when the page's names resolve to exactly one
  // real topic — singular/plural aliases (Recipe/Recipes) still count as one
  const addTopic = useMemo(() => {
    const matches = allTopics.filter(t => topicNames.some(n => n.toLowerCase() === t.name.toLowerCase()));
    return matches.length === 1 ? matches[0] : undefined;
  }, [allTopics, topicNames]);

  const topicIds = useMemo(() => {
    const lowerNames = new Set(topicNames.map(n => n.toLowerCase()));
    return new Set(allTopics.filter(t => lowerNames.has(t.name.toLowerCase())).map(t => t.id));
  }, [allTopics, topicNames]);

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStr = toDateStr(now);
    const weekStart = toDateStr(startOfWeek(now));
    const monthStart = toDateStr(startOfMonth(now));

    return entries.filter(entry => {
      const taxId = (entry.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
      if (!taxId || !topicIds.has(taxId)) return false;
      if (dateFilter === 'all') return true;
      const entryDateStr = toDateStr(entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt));
      if (dateFilter === 'today') return entryDateStr === todayStr;
      if (dateFilter === 'week') return entryDateStr >= weekStart;
      if (dateFilter === 'month') return entryDateStr >= monthStart;
      return true;
    });
  }, [entries, topicIds, dateFilter]);

  const sortedEntries = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [filtered]
  );

  const getTopicForEntry = useCallback((entry: typeof entries[number]) => {
    const taxId = (entry.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
    return taxId ? allTopics.find(t => t.id === taxId) : undefined;
  }, [allTopics]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await deleteEntryWithImages(id);
    } catch (err) { console.error('Failed to delete entry:', err); }
  }, []);

  const summaries = useMemo(() => {
    if (summaryFields.length === 0) return [];
    return summaryFields.map(sf => {
      let total = 0;
      for (const entry of filtered) {
        const cf = ((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>) || {};
        const v = cf[sf.key];
        if (v != null) total += parseFloat(String(v)) || 0;
      }
      return { label: sf.label, value: sf.format ? sf.format(total) : String(total) };
    });
  }, [filtered, summaryFields]);

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to continue" /></ContentTemplate>
      <UnlockDialog onUnlock={handleUnlock} />
    </>
  );

  if (isLoading || !isReady) return (
    <ContentTemplate>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Spinner size={40} />
      </div>
    </ContentTemplate>
  );

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head data-print-hide={printable || undefined}>
            <Title>{title}</Title>
            {(addTopic || printable) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} data-print-hide>
                {addTopic && (
                  <NewBtn onClick={() => setIsAddOpen(true)}>
                    <MaterialIcon $size={16} aria-hidden="true">add</MaterialIcon>
                    New entry
                  </NewBtn>
                )}
                {printable && <PrintButton />}
              </div>
            )}
          </Head>

          <TabsRow data-print-hide>{tabBar ?? <HealthTabBar />}</TabsRow>

          {showDateFilter && (
            <SubTabs data-print-hide>
              <FilterTabs options={DATE_FILTERS} active={dateFilter} onChange={setDateFilter} flush bordered={false} />
            </SubTabs>
          )}

          {summaries.length > 0 && (dateFilter === 'today' || dateFilter === 'week') && (
            <SummaryBar>
              {summaries.map(s => (
                <SumItem key={s.label}>
                  <SumLabel>{s.label}</SumLabel>
                  <SumValue>{s.value}</SumValue>
                </SumItem>
              ))}
            </SummaryBar>
          )}

          {addTopic && isAddOpen && (
            <div data-print-hide>
              <NewEntryCard
                topic={addTopic}
                accentColor={accentColor}
                hideButton
                isOpen={isAddOpen}
                onOpenChange={setIsAddOpen}
              />
            </div>
          )}

          {printable && (
            <PrintReport>
              <PrintTitle>{printTitle ?? title}</PrintTitle>
              <PrintDate>Printed {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</PrintDate>
              {sortedEntries.length === 0 ? (
                <p>No entries.</p>
              ) : (
                <PrintTable>
                  <thead>
                    <tr>
                      <th>Entry</th>
                      {metaFields.map(f => <th key={f.key}>{f.label}</th>)}
                      <th>Notes</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEntries.map(entry => {
                      const cf = ((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>) || {};
                      const created = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
                      return (
                        <tr key={entry.id}>
                          <td>{stripHtml(entry.content).trim() || builtinEntryName(cf)}</td>
                          {metaFields.map(f => <td key={f.key}>{formatFieldValue(f.key, cf[f.key])}</td>)}
                          <td>{formatFieldValue('notes', cf.notes)}</td>
                          <td>{created.toLocaleDateString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </PrintTable>
              )}
            </PrintReport>
          )}

          {sortedEntries.length === 0 ? (
            <div data-print-hide={printable || undefined}><EmptyState message="No entries yet." /></div>
          ) : (
            <List data-print-hide={printable || undefined}>
              {sortedEntries.map(entry => {
                const created = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
                const topic = getTopicForEntry(entry);
                return (
                  <SwipeActions
                    key={entry.id}
                    accentColor={accentColor}
                    onEdit={() => openInJournal(entry.id)}
                    onDelete={() => handleDelete(entry.id)}
                  >
                    <EntryListCard
                      content={entry.content}
                      createdAt={created}
                      topicName={topic?.name}
                      fallbackTitle={builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)}
                      onClick={() => openInJournal(entry.id)}
                    />
                  </SwipeActions>
                );
              })}
            </List>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
