import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { PasswordReentryModal } from '@/components/auth/PasswordReentryModal';
import { TopicsBrowser } from '@/components/topics/TopicsBrowser';

export default async function TopicsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="h-screen flex flex-col backdrop-blur-sm bg-white/30">
      <Header />
      <PasswordReentryModal />
      <div className="flex-1 overflow-hidden backdrop-blur-sm bg-white/30">
        <TopicsBrowser />
      </div>
    </div>
  );
}
