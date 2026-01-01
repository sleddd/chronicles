'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function MedicalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Redirect to /health with same query params for backwards compatibility
    const tab = searchParams.get('tab');
    const url = tab ? `/health?tab=${tab}` : '/health';
    router.replace(url);
  }, [router, searchParams]);

  return (
    <div className="h-screen flex items-center justify-center">
      <div className="text-gray-500">Redirecting...</div>
    </div>
  );
}
