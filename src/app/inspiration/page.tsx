'use client';

import { Header } from '@/components/layout/Header';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';
import { InspirationView } from '@/components/inspiration/InspirationView';

export default function InspirationPage() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <PasswordReentryModal />
      <div className="flex-1 overflow-hidden">
        <InspirationView />
      </div>
    </div>
  );
}
