import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { redirect } from 'next/navigation';
import { JournalLayout } from '@/components/journal/JournalLayout';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';
import { Header } from '@/components/layout/Header';

interface PageProps {
  searchParams: Promise<{ entry?: string; new?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const params = await searchParams;
  // If ?new=true is passed, explicitly set to null for new entry
  // Otherwise use the entry param if provided
  const isNewEntry = params.new === 'true';
  const initialEntryId = isNewEntry ? null : (params.entry || null);

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <PasswordReentryModal />
      <div className="flex-1 overflow-hidden min-h-0">
        <JournalLayout key={isNewEntry ? 'new' : initialEntryId || 'default'} initialEntryId={initialEntryId} />
      </div>
    </div>
  );
}
