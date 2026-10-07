import { Suspense } from 'react';
import { HomeView } from '@/components/home/home-view';

// HomeView อ่าน ?q= และ ?designType= ด้วย useSearchParams จึงต้องอยู่ใต้ Suspense
export default function Page() {
  return (
    <Suspense fallback={null}>
      <HomeView tab="home" />
    </Suspense>
  );
}
