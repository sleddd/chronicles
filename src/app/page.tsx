import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { redirect } from 'next/navigation';
import { JournalLayout } from '@/components/journal/JournalLayout';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';
import { Header } from '@/components/layout/Header';

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <Header />
      <PasswordReentryModal />
      <div className="flex-1 overflow-hidden bg-white">
        <JournalLayout />
      </div>
    </div>
  );
}
