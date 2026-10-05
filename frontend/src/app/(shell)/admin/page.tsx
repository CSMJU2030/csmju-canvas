'use client';

import { Suspense } from 'react';
import { AdminPage } from '@/components/admin/admin-page';
import { Spinner } from '@/components/csmju/primitives';

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <AdminPage />
    </Suspense>
  );
}
