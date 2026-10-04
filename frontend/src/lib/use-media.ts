'use client';

import { useSyncExternalStore } from 'react';

/// ตรงกับ media query หรือไม่ (อัปเดตเมื่อหมุนจอ/ย่อหน้าต่าง)
///
/// หน้าที่ใช้ตัวนี้อยู่หลัง SessionProvider จึง render ฝั่ง client เสมอ — ค่าฝั่ง server เป็น false
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);

      media.addEventListener('change', onChange);

      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/// จอมือถือ (เล็กกว่า md = 768px) — ใช้เลือกเลย์เอาต์มือถือแบบภาพบรีฟ
export function useIsMobile(): boolean {
  return useMedia('(max-width: 767px)');
}
