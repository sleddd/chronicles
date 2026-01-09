'use client';

import { Header } from '@/components/layout/Header';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';
import { EntertainmentView } from '@/components/entertainment/EntertainmentView';

export default function EntertainmentPage() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <PasswordReentryModal />
      <div className="flex-1 overflow-hidden">
        <EntertainmentView />
      </div>
    </div>
  );
}
