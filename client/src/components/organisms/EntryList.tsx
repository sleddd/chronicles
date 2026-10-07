import styled from 'styled-components';
import { memo, useMemo, useCallback, useState } from 'react';
import { useUIStore } from '../../stores/uiStore.js';
import { useEntriesStore } from '../../stores/entriesStore.js';
import { EntryTableHead } from '../molecules/EntryTable.js';
import { EntryCard } from './EntryCard.js';
import { Checkbox } from '../atoms/Checkbox.js';
import { entries as entriesApi } from '../../services/api.js';
import { removeEntriesLocally } from '../../services/calendarSync.js';
import { collectImageKeys, bestEffortDeleteImages } from '../../services/imageStorage.js';
import { filterDeletableImageKeys } from '../../utils/entryActions.js';
import { stripHtml, summarizeUserFields, builtinEntryName } from '../../utils/stripHtml.js';

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
  padding: 0;
  flex-shrink: 0;
  background: transparent;
`;

const EmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--s-7, 32px);
  color: var(--text-secondary);
  font-size: var(--text-sm, 15px);
`;

const BulkBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-subtle, ${({ theme }) => theme.colors.border});
  font-family: var(--font-label);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
`;

const BulkButton = styled.button<{ $danger?: boolean }>`
  padding: 3px 10px;
  font-family: var(--font-label);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ $danger }) => ($danger ? 'var(--color-danger, #c0392b)' : 'var(--text-secondary)')};
  background: transparent;
  border: 1px solid var(--border-default, ${({ theme }) => theme.colors.border});
  border-radius: var(--r-md, 1px);
  cursor: pointer;
  &:hover { background: var(--bg-hover); }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const BulkSpacer = styled.span`
  margin-left: auto;
`;

/* Label across from the Select button — same type as the button text. */
const BulkLabel = styled.span`
  font-family: var(--font-label);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
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
export const EntryList = memo(function EntryList({ onToggleBookmark }: EntryListProps = {}) {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const topics = useEntriesStore(s => s.topics);
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const removeEntry = useEntriesStore(s => s.removeEntry);
  const selectedTopicId = useUIStore(s => s.selectedTopicId);
  const setSelectedTopicId = useUIStore(s => s.setSelectedTopicId);
  const selectedEntryId = useUIStore(s => s.selectedEntryId);
  const setSelectedEntryId = useUIStore(s => s.setSelectedEntryId);
  const viewMode = useUIStore(s => s.viewMode);
  const selectedDate = useUIStore(s => s.selectedDate);
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const searchKeyword = useUIStore(s => s.searchKeyword);
  const searchDateFrom = useUIStore(s => s.searchDateFrom);
  const searchDateTo = useUIStore(s => s.searchDateTo);
  const calendarSyncEnabled = useUIStore(s => s.calendarSyncEnabled);

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [alsoDeleteRemote, setAlsoDeleteRemote] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkConfirm(false);
    setAlsoDeleteRemote(false);
  }, []);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setBulkConfirm(false);
  }, []);

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

  const handleToggleComplete = useCallback((entryId: number, completed: boolean) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    const meta = entry.metadata as Record<string, unknown>;
    const existingFields = (meta?._customFields as Record<string, unknown>) || {};
    const updatedFields = { ...existingFields, isCompleted: completed };
    const updatedMeta = { ...meta, _customFields: updatedFields };
    updateDecryptedEntry(entryId, { metadata: updatedMeta });
  }, [entries, updateDecryptedEntry]);

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

      if (searchKeyword) {
        const keyword = searchKeyword.toLowerCase();
        const contentMatch = entry.content.toLowerCase().includes(keyword);
        const metadataMatch = JSON.stringify(entry.metadata).toLowerCase().includes(keyword);
        const topic = taxId ? topics.find(t => t.id === taxId) : undefined;
        const topicMatch = topic?.name?.toLowerCase().includes(keyword) ?? false;
        if (!contentMatch && !metadataMatch && !topicMatch) return false;
      }

      if (searchDateFrom || searchDateTo) {
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

  const selectedEntries = useMemo(
    () => filteredEntries.filter(e => selectedIds.has(e.id)),
    [filteredEntries, selectedIds],
  );
  const selectionHasSyncLinks = useMemo(
    () => selectedEntries.some(e => !!((e.metadata?._customFields as Record<string, unknown> | undefined)?._sync)),
    [selectedEntries],
  );

  const handleBulkDelete = useCallback(async () => {
    if (selectedEntries.length === 0) return;
    setBulkDeleting(true);
    // R2 keys for entries whose delete succeeds — only those objects are removed,
    // so a failed entry delete never strips images from a surviving entry
    const cleanupKeys: string[] = [];
    try {
      if (alsoDeleteRemote) {
        // Plain deletes — the sync hook's deletion tracker propagates linked
        // entries to Google Calendar
        for (const entry of selectedEntries) {
          try {
            const imageKeys = collectImageKeys([entry]);
            await entriesApi.delete(entry.id);
            removeEntry(entry.id);
            cleanupKeys.push(...imageKeys);
          } catch (err) {
            console.error('Failed to delete entry:', err);
          }
        }
      } else {
        // Strip sync links first so nothing is deleted from Google Calendar
        await removeEntriesLocally(selectedEntries);
        // Per-entry failures are swallowed above — clean up only entries gone from the store
        const remaining = new Set(useEntriesStore.getState().decryptedEntries.map(e => e.id));
        cleanupKeys.push(...collectImageKeys(selectedEntries.filter(e => !remaining.has(e.id))));
      }
    } finally {
      // Skip objects still referenced by surviving entries (library reuse)
      const deletable = filterDeletableImageKeys(cleanupKeys);
      if (deletable.length > 0) void bestEffortDeleteImages(deletable);
      setBulkDeleting(false);
      exitSelectMode();
    }
  }, [selectedEntries, alsoDeleteRemote, removeEntry, exitSelectMode]);

  if (filteredEntries.length === 0) {
    return <EmptyState>No entries yet</EmptyState>;
  }

  return (
    <ListContainer>
      <BulkBar>
        {!selectMode ? (
          <>
            <BulkLabel>BULK EDIT</BulkLabel>
            <BulkSpacer />
            <BulkButton onClick={() => setSelectMode(true)}>Select</BulkButton>
          </>
        ) : (
          <>
            <span>{selectedIds.size} selected</span>
            <BulkButton onClick={() => { setSelectedIds(new Set(filteredEntries.map(e => e.id))); setBulkConfirm(false); }}>
              Select all
            </BulkButton>
            <BulkSpacer />
            {!bulkConfirm ? (
              <BulkButton $danger disabled={selectedIds.size === 0 || bulkDeleting} onClick={() => setBulkConfirm(true)}>
                Delete ({selectedIds.size})
              </BulkButton>
            ) : (
              <>
                <span style={{ textTransform: 'none', letterSpacing: 0 }}>
                  Delete {selectedIds.size} {selectedIds.size === 1 ? 'entry' : 'entries'}?
                </span>
                {calendarSyncEnabled && selectionHasSyncLinks && (
                  <Checkbox
                    checked={alsoDeleteRemote}
                    onChange={setAlsoDeleteRemote}
                    label="Also delete from Google Calendar"
                  />
                )}
                <BulkButton $danger disabled={bulkDeleting} onClick={handleBulkDelete}>
                  {bulkDeleting ? 'Deleting…' : 'Confirm delete'}
                </BulkButton>
              </>
            )}
            <BulkButton disabled={bulkDeleting} onClick={exitSelectMode}>Cancel</BulkButton>
          </>
        )}
      </BulkBar>
      <EntryTableHead inset />
      {groups.map(([dateKey, groupEntries]) => {
        return (
          <div key={dateKey}>
            {groupEntries.map(entry => {
              const meta = entry.metadata as Record<string, unknown>;
              const customFields = meta?._customFields as Record<string, unknown> | undefined;
              const topic = getTopicForEntry(entry);
              const customType = getCustomType(topic?.name);
              const hasCheckbox = customType !== null && CHECKABLE_TYPES.has(customType);
              const isCompleted = hasCheckbox && !!customFields?.isCompleted;
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
                  key={selectMode ? undefined : entry.id}
                  id={entry.id}
                  content={entry.content}
                  date={entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt)}
                  topicName={topic?.name}
                  topicColor={topicBarColor(topic?.name, topic?.color)}
                  topicId={topic?.id}
                  active={selectMode ? selectedIds.has(entry.id) : selectedEntryId === entry.id}
                  onClick={() => (selectMode ? toggleSelected(entry.id) : setSelectedEntryId(entry.id))}
                  onDelete={selectMode ? undefined : () => handleDelete(entry.id)}
                  onTopicClick={selectMode ? undefined : handleTopicClick}
                  onToggleComplete={hasCheckbox && !selectMode ? handleToggleComplete : undefined}
                  onToggleBookmark={selectMode ? undefined : handleToggleBookmarkLocal}
                  hasCheckbox={hasCheckbox}
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
    </ListContainer>
  );
});
