'use client';

import { useState, useCallback, useEffect } from 'react';
import { EntriesList } from '@/components/journal/EntriesList';
import { EntryEditor } from '@/components/journal/EntryEditor';
import { useTimezone } from '@/lib/hooks/useTimezone';
import { useTaskMigration } from '@/lib/hooks/useTaskMigration';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

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
  // On mobile: show editor view when an entry is selected
  const [mobileShowEditor, setMobileShowEditor] = useState(!!initialEntryId);

  // Update selectedEntryId when initialEntryId changes (e.g., from URL navigation)
  useEffect(() => {
    if (initialEntryId) {
      setSelectedEntryId(initialEntryId);
      setMobileShowEditor(true);
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
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-row h-full min-h-0">
      {/* Entries list - hidden on mobile when viewing editor */}
      <div
        className={`backdrop-blur-md bg-white/80 min-h-0 ${
          mobileShowEditor ? 'hidden md:block md:w-1/3' : 'flex-1 md:w-1/3 md:flex-none'
        }`}
      >
        <div className="h-full overflow-hidden">
          <EntriesList
            key={refreshKey}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onSelectEntry={(entryId) => {
              setSelectedEntryId(entryId);
              setMobileShowEditor(true);
            }}
            onEntryCreated={(entryId) => {
              handleEntrySaved();
              if (entryId) {
                setSelectedEntryId(entryId);
                setMobileShowEditor(true);
              }
            }}
            today={today}
            selectedEntryId={selectedEntryId}
          />
        </div>
      </div>

      {/* Editor panel - full screen on mobile when viewing, always visible on desktop */}
      <div
        className={`overflow-auto backdrop-blur-md bg-white/90 flex-1 border-t border-border md:border-t-0 ${
          mobileShowEditor ? 'block' : 'hidden md:block'
        }`}
      >
        {/* Back button on mobile */}
        {mobileShowEditor && (
          <button
            onClick={() => {
              setMobileShowEditor(false);
              setSelectedEntryId(null);
            }}
            className="md:hidden w-full flex items-center gap-1 text-sm text-gray-600 p-4 border-b border-border"
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
          onSelectEntry={(entryId) => {
            setSelectedEntryId(entryId);
            // On mobile, go back to entries list when closing/saving
            if (entryId === null) {
              setMobileShowEditor(false);
            }
          }}
          today={today}
          onTopicsChange={handleEntrySaved}
        />
      </div>
    </div>
  );
}
