'use client';

import { Header } from '@/components/layout/Header';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';
import { HealthView } from '@/components/health/HealthView';
import { useTimezone } from '@/lib/hooks/useTimezone';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function HealthPage() {
  const { today, loading: timezoneLoading } = useTimezone();

  if (timezoneLoading) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <PasswordReentryModal />
      <div className="flex-1 overflow-hidden">
        <HealthView selectedDate={today} />
      </div>
    </div>
  );
}
