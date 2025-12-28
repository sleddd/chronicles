'use client';

import { useState, useCallback, useEffect } from 'react';
import { EntriesList } from '@/components/journal/EntriesList';
import { EntryEditor } from '@/components/journal/EntryEditor';
import { useTimezone } from '@/lib/hooks/useTimezone';

export function JournalLayout() {
  const { today, loading: timezoneLoading } = useTimezone();
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);

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
    <div className="flex h-full">
      <div className="w-1/3 border-r overflow-auto bg-gray-50">
        <EntriesList
          key={refreshKey}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          selectedEntryId={selectedEntryId}
          onSelectEntry={setSelectedEntryId}
          onEntryCreated={handleEntrySaved}
          today={today}
        />
      </div>

      <div className="flex-1 overflow-auto">
        <EntryEditor
          entryId={selectedEntryId}
          date={selectedDate}
          onEntrySaved={handleEntrySaved}
          today={today}
        />
      </div>
    </div>
  );
}
