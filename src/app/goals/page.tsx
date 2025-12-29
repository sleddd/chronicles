'use client';

import { useState, useCallback } from 'react';
import { GoalsView } from '@/components/goals/GoalsView';
import { EntryEditor } from '@/components/journal/EntryEditor';
import { Header } from '@/components/layout/Header';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';
import { useTimezone } from '@/lib/hooks/useTimezone';

export default function GoalsPage() {
  const { today, loading: timezoneLoading } = useTimezone();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleEntrySaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (timezoneLoading) {
    return (
      <div className="h-screen flex flex-col bg-white">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <Header />
      <PasswordReentryModal />
      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 border-r overflow-auto">
          <GoalsView
            key={refreshKey}
            onGoalSelect={setSelectedGoalId}
            selectedGoalId={selectedGoalId}
            refreshKey={refreshKey}
          />
        </div>
        <div className="w-1/2 overflow-auto">
          <EntryEditor
            entryId={selectedGoalId}
            date={today}
            onEntrySaved={handleEntrySaved}
            today={today}
            customType="goal"
          />
        </div>
      </div>
    </div>
  );
}
