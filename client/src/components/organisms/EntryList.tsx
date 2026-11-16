import styled from 'styled-components';
import { memo, useMemo, useCallback, useEffect, useState } from 'react';
import { useUIStore } from '../../stores/uiStore.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { EntryCard } from './EntryCard.js';
import { Checkbox } from '../atoms/Checkbox.js';
import { LoadMore } from '../molecules/LoadMore.js';
import { useJournalSelect } from '../../stores/journalSelectStore.js';
import { entries as entriesApi } from '../../services/api.js';
import { collectImageKeys, bestEffortDeleteImages } from '../../services/imageStorage.js';
import { stripHtml, summarizeUserFields, builtinEntryName } from '../../utils/stripHtml.js';

/** Rows drawn at a time: the list adds this many more as its foot scrolls into view */
export const LIST_PAGE = 100;

const TOPIC_TO_TYPE: Record<string, string> = {
  task: 'task', goal: 'goal', milestone: 'milestone',
  meals: 'food', medication: 'medication', symptom: 'symptom',
  exercise: 'exercise', event: 'event', meeting: 'meeting',
};

/* DS entry-type color palette for the left color bar.
   journal=teal, task=amber, event=blue, goal=lime, quote=purple, meal=rose. */
const TYPE_COLOR: Record<string, string> = {
  journal: 'var(--color-accent)',
  task: '#d97706',
  event: '#2563eb',
  meeting: '#2563eb',
  goal: '#65a30d',
  milestone: '#65a30d',
  quote: '#9333ea',
  meal: '#e11d48',
  food: '#e11d48',
  meals: '#e11d48',
};

/** Resolve the color-bar tint for an entry from its topic name, falling back
 *  to the topic's own stored color, then the accent. */
function topicBarColor(topicName: string | undefined, fallback: string | null | undefined): string | undefined {
  if (topicName) {
    const key = topicName.toLowerCase();
    if (TYPE_COLOR[key]) return TYPE_COLOR[key];
  }
  return fallback || 'var(--color-accent)';
}

const ListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  /* Room above the first row (sitewide entry-list spacing) */
  padding: 6px 0 0;
  /* Fills the pane, so its colour runs to the foot on a wallpaper too */
  flex: 1 0 auto;
  background: transparent;
  html[data-wallpaper] & { background: var(--list-bg, var(--bg-app)); }
`;

/* The list's foot: "Show more" and "Showing 100 of 871", on the list's own colour */
const ListFoot = styled(LoadMore)`
  margin: 0;
  padding: 22px 0 28px;
`;

const EmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--s-7, 32px);
  color: var(--text-secondary);
  font-size: var(--text-sm, 15px);
`;

const SelectRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  & > label { padding: 18px 0 0 20px; flex-shrink: 0; }
  & > *:last-child { flex: 1; min-width: 0; }
`;

const CHECKABLE_TYPES = new Set(['task', 'goal', 'milestone']);

// ── Helpers ────────────────────────────────────────────────────────

/** YYYY-MM-DD string in local time */
function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


// ── Interface ──────────────────────────────────────────────────────

interface EntryListProps {
  onToggleBookmark?: (entryId: number, isFavorite: boolean) => void;
}

/* Memoized: the journal re-renders on every keystroke in the editor, and the
   list (which reads its data from the stores) must not re-render with it. */
/* All view: the month above its entries — thin Work Sans on the canvas, inset
   to the rows' text, with a rule under it */
const MonthHead = styled.h3`
  margin: 0;
  padding: 22px 20px 10px;
  border-bottom: 1px solid var(--border-subtle);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 300;
  color: var(--text-secondary);
  background: var(--list-bg, var(--bg-app));
`;

export const EntryList = memo(function EntryList({ onToggleBookmark }: EntryListProps = {}) {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const topics = useEntriesStore(s => s.topics);
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const removeEntry = useEntriesStore(s => s.removeEntry);
  const selectedTopicId = useUIStore(s => s.selectedTopicId);
  const setSelectedTopicId = useUIStore(s => s.setSelectedTopicId);
  const selectedEntryId = useUIStore(s => s.selectedEntryId);
  const setSelectedEntryId = useUIStore(s => s.setSelectedEntryId);
  const setShowMobileEditor = useUIStore(s => s.setShowMobileEditor);
  const viewMode = useUIStore(s => s.viewMode);
  const selectedDate = useUIStore(s => s.selectedDate);
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const searchKeyword = useUIStore(s => s.searchKeyword);
  const searchDateFrom = useUIStore(s => s.searchDateFrom);
  const searchDateTo = useUIStore(s => s.searchDateTo);

  // Select mode (started from the list head's ⋯ menu, ended there by Done / Delete)
  const selectMode = useJournalSelect(s => s.selecting);
  const selectedIds = useJournalSelect(s => s.ids);
  const toggleSelected = useJournalSelect(s => s.toggle);
  const stopSelecting = useJournalSelect(s => s.stop);
  // Leaving the journal ends it
  useEffect(() => () => stopSelecting(), [stopSelecting]);

  const handleTopicClick = useCallback((topicId: number) => {
    setSelectedTopicId(topicId);
  }, [setSelectedTopicId]);

  const handleToggleBookmarkLocal = useCallback((entryId: number, isFavorite: boolean) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    const meta = entry.metadata as Record<string, unknown>;
    const existingFields = (meta?._customFields as Record<string, unknown>) || {};
    const updatedFields = { ...existingFields, _isFavorite: isFavorite };
    const updatedMeta = { ...meta, _customFields: updatedFields };
    updateDecryptedEntry(entryId, { metadata: updatedMeta });
    onToggleBookmark?.(entryId, isFavorite);
  }, [entries, updateDecryptedEntry, onToggleBookmark]);

  const handleDelete = useCallback(async (entryId: number) => {
    try {
      // Collect R2 keys before the entry metadata disappears
      const entry = entries.find(e => e.id === entryId);
      const imageKeys = entry ? collectImageKeys([entry]) : [];
      await entriesApi.delete(entryId);
      removeEntry(entryId);
      if (imageKeys.length > 0) void bestEffortDeleteImages(imageKeys);
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  }, [entries, removeEntry]);

  const getTopicForEntry = (entry: { metadata: Record<string, unknown> }) => {
    const taxId = entry.metadata?._taxonomyId as number | undefined;
    return taxId ? topics.find(t => t.id === taxId) : undefined;
  };

  const getCustomType = (topicName: string | undefined): string | null => {
    if (!topicName) return null;
    return TOPIC_TO_TYPE[topicName.toLowerCase()] || null;
  };

  const enabledTopicIds = useMemo(() => new Set(topics.map(t => t.id)), [topics]);

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      const meta = entry.metadata as Record<string, unknown>;
      const customFields = meta?._customFields as Record<string, unknown> | undefined;
      const taxId = meta?._taxonomyId as number | undefined;

      // Hide entries whose topic is gone or switched off
      if (taxId && !enabledTopicIds.has(taxId)) return false;

      if (viewMode === 'date') {
        // Mirror the calendar: entries with a startDate (events, meetings)
        // belong to that day, not the day they were created
        const startDate = customFields?.startDate as string | undefined;
        if (startDate && /^\d{4}-\d{2}-\d{2}/.test(startDate)) {
          if (startDate.slice(0, 10) !== toLocalDateKey(selectedDate)) return false;
        } else {
          const entryDate = new Date(entry.createdAt);
          if (
            entryDate.getFullYear() !== selectedDate.getFullYear() ||
            entryDate.getMonth() !== selectedDate.getMonth() ||
            entryDate.getDate() !== selectedDate.getDate()
          ) return false;
        }
      }

      if (viewMode === 'tasks') {
        const tid = meta?._taxonomyId as number | undefined;
        const topic = tid ? topics.find(t => t.id === tid) : undefined;
        const type = getCustomType(topic?.name);
        if (type !== 'task') return false;
      }

      if (viewMode === 'favorites') {
        if (!customFields?._isFavorite) return false;
      }

      if (selectedTopicId !== null) {
        if (meta?._taxonomyId !== selectedTopicId) return false;
      }

      // Keyword and date range belong to the Search tab, where they're visible
      if (viewMode === 'search' && searchKeyword) {
        const keyword = searchKeyword.toLowerCase();
        const contentMatch = entry.content.toLowerCase().includes(keyword);
        const metadataMatch = JSON.stringify(entry.metadata).toLowerCase().includes(keyword);
        const topic = taxId ? topics.find(t => t.id === taxId) : undefined;
        const topicMatch = topic?.name?.toLowerCase().includes(keyword) ?? false;
        if (!contentMatch && !metadataMatch && !topicMatch) return false;
      }

      if (viewMode === 'search' && (searchDateFrom || searchDateTo)) {
        const entryDate = new Date(entry.createdAt);
        if (searchDateFrom && entryDate < new Date(searchDateFrom)) return false;
        if (searchDateTo) {
          const toDate = new Date(searchDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (entryDate > toDate) return false;
        }
      }

      return true;
    });
  }, [entries, topics, enabledTopicIds, selectedTopicId, selectedDate, viewMode, searchKeyword, searchDateFrom, searchDateTo]);

  // Group entries by local date key, newest first
  const groups = useMemo(() => {
    const map = new Map<string, typeof filteredEntries>();
    for (const entry of filteredEntries) {
      const key = toLocalDateKey(new Date(entry.createdAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    // Sort groups descending (newest first)
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredEntries]);
  // Only so many rows are drawn at once (a long journal's All view would draw
  // thousands): more as the list's foot scrolls into view. A different view,
  // topic, day or search starts from the top again
  const pageKey = [viewMode, selectedTopicId, viewMode === 'date' ? toLocalDateKey(selectedDate) : '', searchKeyword, searchDateFrom, searchDateTo].join('|');
  const [page, setPage] = useState({ key: pageKey, rows: LIST_PAGE });
  const shownRows = page.key === pageKey ? page.rows : LIST_PAGE;
  const showMore = useCallback(() => setPage({ key: pageKey, rows: shownRows + LIST_PAGE }), [pageKey, shownRows]);
  const shownGroups = useMemo(() => {
    if (filteredEntries.length <= shownRows) return groups;
    const out: typeof groups = [];
    let left = shownRows;
    for (const [key, rows] of groups) {
      if (left <= 0) break;
      out.push([key, rows.length > left ? rows.slice(0, left) : rows]);
      left -= rows.length;
    }
    return out;
  }, [groups, filteredEntries.length, shownRows]);
  // An open entry in view is the active row — then the first row needs no hint
  const openRowVisible = selectedEntryId != null && filteredEntries.some(e => e.id === selectedEntryId);

  if (filteredEntries.length === 0) {
    return <EmptyState>No entries yet</EmptyState>;
  }

  return (
    <ListContainer>
      {/* First row carries the active hint only while no (visible) entry is open */}
      {shownGroups.map(([dateKey, groupEntries], groupIndex) => {
        // All: a "Month YYYY" heading wherever the month changes
        const monthKey = dateKey.slice(0, 7);
        const newMonth = viewMode === 'all' && (groupIndex === 0 || shownGroups[groupIndex - 1][0].slice(0, 7) !== monthKey);
        return (
          <div key={dateKey}>
            {newMonth && (
              <MonthHead>
                {new Date(`${monthKey}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </MonthHead>
            )}
            {groupEntries.map((entry, rowIndex) => {
              const meta = entry.metadata as Record<string, unknown>;
              const customFields = meta?._customFields as Record<string, unknown> | undefined;
              const topic = getTopicForEntry(entry);
              const customType = getCustomType(topic?.name);
              const isCompleted = customType !== null && CHECKABLE_TYPES.has(customType) && !!customFields?.isCompleted;
              const isFavorite = !!customFields?._isFavorite;

              let previewText: string | undefined;
              if (!stripHtml(entry.content).trim() && customFields) {
                if ((meta._widgetType as string) === 'wellness-checkin') {
                  const w = (customFields.waterGlasses as number) || 0;
                  const g = (customFields.waterGoal as number) || 8;
                  const m = (customFields.moodScore as number) || 0;
                  const s = (customFields.sleepHours as number) || 0;
                  const parts = [w > 0 ? `${w}/${g} glasses` : '', m > 0 ? `Mood ${m}/5` : '', s > 0 ? `${s}h sleep` : ''].filter(Boolean);
                  previewText = parts.join(' · ') || 'Wellness check-in';
                } else if (builtinEntryName(customFields)) {
                  previewText = builtinEntryName(customFields);
                } else if (topic?.id) {
                  const defs = topicCustomFields[topic.id] ?? [];
                  const uf = (customFields._userFields as Record<string, unknown>) ?? {};
                  previewText = summarizeUserFields(defs, uf) || undefined;
                }
              }

              const card = (
                <EntryCard
                  hint={groupIndex === 0 && rowIndex === 0 && !openRowVisible}
                  showDate={viewMode !== 'date'}
                  key={selectMode ? undefined : entry.id}
                  id={entry.id}
                  content={entry.content}
                  date={entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt)}
                  topicName={selectedTopicId !== null ? undefined : topic?.name}
                  topicColor={topicBarColor(topic?.name, topic?.color)}
                  topicId={topic?.id}
                  active={selectMode ? selectedIds.has(entry.id) : selectedEntryId === entry.id}
                  onClick={() => {
                    if (selectMode) { toggleSelected(entry.id); return; }
                    setSelectedEntryId(entry.id);
                    // Phones: reopening the entry that's already selected doesn't
                    // change the id, so show the editor pane directly
                    setShowMobileEditor(true);
                  }}
                  onDelete={selectMode ? undefined : () => handleDelete(entry.id)}
                  onTopicClick={selectMode ? undefined : handleTopicClick}
                  onToggleBookmark={selectMode ? undefined : handleToggleBookmarkLocal}
                  isCompleted={isCompleted}
                  isFavorite={isFavorite}
                  customType={customType || undefined}
                  previewText={previewText}
                />
              );

              if (!selectMode) return card;
              return (
                <SelectRow key={entry.id}>
                  <Checkbox checked={selectedIds.has(entry.id)} onChange={() => toggleSelected(entry.id)} />
                  {card}
                </SelectRow>
              );
            })}
          </div>
        );
      })}
      <ListFoot shown={shownRows} total={filteredEntries.length} onMore={showMore} />
    </ListContainer>
  );
});
