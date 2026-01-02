import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';
import { SettingsPanel } from '@/components/settings/SettingsPanel';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <PasswordReentryModal />
      <div className="flex-1 overflow-auto py-6">
        <SettingsPanel />
      </div>
    </div>
  );
}
