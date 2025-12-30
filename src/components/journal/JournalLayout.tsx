'use client';

import { useState, useCallback, useEffect } from 'react';
import { EntriesList } from '@/components/journal/EntriesList';
import { EntryEditor } from '@/components/journal/EntryEditor';
import { useTimezone } from '@/lib/hooks/useTimezone';
import { useTaskMigration } from '@/lib/hooks/useTaskMigration';

interface Props {
  initialEntryId?: string | null;
}

export function JournalLayout({ initialEntryId }: Props) {
  const { today, loading: timezoneLoading } = useTimezone();
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(initialEntryId || null);

  // Activate task auto-migration on app load and at midnight
  useTaskMigration(today);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);
  // Collapsed by default on mobile only (check on mount)
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false; // Default to expanded for SSR
  });

  // Update selectedEntryId when initialEntryId changes (e.g., from URL navigation)
  useEffect(() => {
    if (initialEntryId) {
      setSelectedEntryId(initialEntryId);
    }
  }, [initialEntryId]);

  // Set selected date when timezone loads (and on initial load)
  useEffect(() => {
    if (!timezoneLoading && today) {
      setSelectedDate((prev) => prev || today);
    }
  }, [today, timezoneLoading]);

  const handleEntrySaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Wait for both timezone to load AND selectedDate to be set
  if (timezoneLoading || !selectedDate) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-row h-full bg-white">
      {/* Entries list - collapses on mobile when editor expanded */}
      <div
        className={`border-r bg-gray-50 overflow-auto transition-all duration-300 ${
          isEditorCollapsed
            ? 'flex-1 md:w-1/3 md:flex-none'
            : 'w-0 md:w-1/3 overflow-hidden'
        }`}
      >
        <div className={`${isEditorCollapsed ? 'block' : 'hidden md:block'}`}>
          <EntriesList
            key={refreshKey}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            selectedEntryId={selectedEntryId}
            onSelectEntry={(entryId) => {
              setSelectedEntryId(entryId);
              // Expand editor when selecting an entry (mobile only)
              if (window.innerWidth < 768) {
                setIsEditorCollapsed(false);
              }
            }}
            onEntryCreated={handleEntrySaved}
            today={today}
          />
        </div>
      </div>

      {/* Editor panel - 40px wide when collapsed, full width when expanded (mobile only) */}
      <div
        className={`overflow-auto bg-white transition-all duration-300 ${
          isEditorCollapsed ? 'w-10 md:flex-1' : 'flex-1'
        }`}
      >
        {/* Mobile collapsed strip when editor is collapsed */}
        {isEditorCollapsed && (
          <button
            onClick={() => setIsEditorCollapsed(false)}
            className="md:hidden w-10 h-full flex flex-col items-center justify-center bg-gray-100 border-l"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-xs text-gray-500 mt-2" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
              Editor
            </span>
          </button>
        )}

        {/* Editor content */}
        <div className={`${isEditorCollapsed ? 'hidden md:block' : 'block'}`}>
          {/* Back button on mobile when expanded */}
          {!isEditorCollapsed && (
            <button
              onClick={() => setIsEditorCollapsed(true)}
              className="md:hidden flex items-center gap-1 text-sm text-gray-600 p-4 pb-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Entries
            </button>
          )}
          <EntryEditor
            entryId={selectedEntryId}
            date={selectedDate}
            onEntrySaved={handleEntrySaved}
            onSelectEntry={setSelectedEntryId}
            today={today}
          />
        </div>
      </div>
    </div>
  );
}
