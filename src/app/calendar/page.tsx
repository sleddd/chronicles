'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarView } from '@/components/calendar/CalendarView';
import { EventModal } from '@/components/calendar/EventModal';
import { Header } from '@/components/layout/Header';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';
import { useTimezone } from '@/lib/hooks/useTimezone';

export default function CalendarPage() {
  const router = useRouter();
  const { today, loading: timezoneLoading } = useTimezone();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [modalDate, setModalDate] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleEventSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleCreateEvent = useCallback((date: string) => {
    setModalDate(date);
    setSelectedEventId(null);
    setShowEventModal(true);
  }, []);

  const handleEventSelect = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    setShowEventModal(true);
  }, []);

  const handleDateSelect = useCallback((date: string) => {
    router.push(`/?date=${date}`);
  }, [router]);

  const handleEntrySelect = useCallback((entryId: string) => {
    router.push(`/?entry=${entryId}`);
  }, [router]);

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
      <div className="flex-1 overflow-hidden">
        <CalendarView
          key={refreshKey}
          onEventSelect={handleEventSelect}
          onEntrySelect={handleEntrySelect}
          onDateSelect={handleDateSelect}
          onCreateEvent={handleCreateEvent}
          selectedEventId={selectedEventId}
          today={today}
        />
      </div>

      {showEventModal && (
        <EventModal
          eventId={selectedEventId}
          initialDate={modalDate || today}
          onClose={() => {
            setShowEventModal(false);
            setSelectedEventId(null);
          }}
          onSaved={handleEventSaved}
        />
      )}
    </div>
  );
}
