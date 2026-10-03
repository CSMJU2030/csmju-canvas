'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/csmju/api';
import { SessionProvider } from '@/lib/csmju/session';
import type { Preference } from '@/lib/types';
import { ToastProvider } from './primitives';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // 401 ถูกจัดการที่ SessionProvider (พาไป /auth/login) — ไม่ต้องลองซ้ำ
          queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SessionProvider>
          <AccessibilityPreferences />
          {children}
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/// ใช้การตั้งค่า "การเข้าถึง" ของผู้ใช้กับทั้งหน้า (ข้อความใหญ่ · คอนทราสต์สูง · ลดการเคลื่อนไหว)
function AccessibilityPreferences() {
  const { data } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => api.get<Preference>('/preferences'),
  });

  useEffect(() => {
    if (!data) return;

    const root = document.documentElement;

    root.dataset.contrast = data.highContrast ? 'high' : 'normal';
    root.dataset.text = data.largeText ? 'large' : 'normal';
    root.dataset.motion = data.reduceMotion ? 'reduce' : 'normal';
    applyTheme(data.theme);
  }, [data]);

  return null;
}

/// ใช้ธีมกับทั้งหน้า และจำสำเนาไว้ให้สคริปต์ใน layout ตั้งได้ก่อนวาดเฟรมแรกครั้งหน้า
export function applyTheme(theme: Preference['theme']) {
  const value = theme === 'LIGHT' ? 'light' : theme === 'DARK' ? 'dark' : 'system';

  document.documentElement.dataset.theme = value;

  try {
    window.localStorage.setItem('csmju-canvas:theme', value);
  } catch {
    // โหมดส่วนตัวบล็อก storage — ครั้งหน้าจะแวบเป็นธีมตามระบบก่อนแล้วค่อยเปลี่ยน
  }
}
