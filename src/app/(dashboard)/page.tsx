'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardIndexPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main dashboard page
    router.replace('/dashboard/dashboard');
  }, [router]);

  return null;
}
