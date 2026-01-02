'use client';

import { GoalsView } from '@/components/goals/GoalsView';
import { Header } from '@/components/layout/Header';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';

export default function GoalsPage() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <PasswordReentryModal />
      <div className="flex-1 overflow-auto">
        <GoalsView />
      </div>
    </div>
  );
}
