'use client';

import { create } from 'zustand';
import { cx } from '@/components/csmju/primitives';

/// ไอคอนอัปโหลดที่เคลื่อนไหว + สถานะ "กำลังอัปโหลด" ของทั้งแอป (ไฟล์เบา ใช้ได้ทั้งหน้าแรกและหน้าแก้ไข)

interface UploadActivity {
  active: number;
  begin(count: number): void;
  end(count?: number): void;
}

export const useUploadActivity = create<UploadActivity>((set) => ({
  active: 0,
  begin: (count) => set((s) => ({ active: s.active + count })),
  end: (count = 1) => set((s) => ({ active: Math.max(0, s.active - count) })),
}));

/// ไอคอนอัปโหลด (เมฆ + ลูกศร) — ลูกศรลอยขึ้นวนไปเรื่อย ๆ ระหว่างอัปโหลด และขยับหนึ่งรอบเมื่อชี้ที่ปุ่ม (class `group`)
/// ผู้ใช้ที่ตั้ง "ลดการเคลื่อนไหว" ในระบบจะไม่เห็นอนิเมชัน
export function UploadIcon({ className, strokeWidth = 2, animate }: { className?: string; strokeWidth?: number; animate?: boolean; 'aria-hidden'?: boolean }) {
  const uploading = useUploadActivity((s) => s.active > 0);

  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('csmju-upload-icon overflow-visible', (animate ?? uploading) && 'csmju-upload-busy', className)}
    >
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <g className="csmju-upload-arrow">
        <path d="M12 13v8" />
        <path d="m8 17 4-4 4 4" />
      </g>
    </svg>
  );
}

