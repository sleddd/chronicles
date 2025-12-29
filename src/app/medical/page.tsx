'use client';

import { Header } from '@/components/layout/Header';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';
import { MedicalView } from '@/components/medical/MedicalView';
import { useTimezone } from '@/lib/hooks/useTimezone';

export default function MedicalPage() {
  const { today, loading: timezoneLoading } = useTimezone();

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
        <MedicalView selectedDate={today} />
      </div>
    </div>
  );
}
