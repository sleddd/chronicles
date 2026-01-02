'use client';

import { Header } from '@/components/layout/Header';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';
import { HealthView } from '@/components/health/HealthView';
import { useTimezone } from '@/lib/hooks/useTimezone';

export default function HealthPage() {
  const { today, loading: timezoneLoading } = useTimezone();

  if (timezoneLoading) {
    return (
      <div className="h-screen flex flex-col backdrop-blur-sm bg-white/30">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col backdrop-blur-sm bg-white/30">
      <Header />
      <PasswordReentryModal />
      <div className="flex-1 overflow-hidden">
        <HealthView selectedDate={today} />
      </div>
    </div>
  );
}
