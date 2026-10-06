'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, qs } from '@/lib/csmju/api';
import { useUserFonts } from '@/lib/editor/fonts';
import type { Asset } from '@/lib/types';

export const MY_FONTS_KEY = ['assets', 'fonts'] as const;

/// รายการ "ฟอนต์ของฉัน" (asset ชนิด font/*) + จำชื่อไว้ให้แถบเครื่องมือ/ตัวเลือกฟอนต์แสดงชื่อไฟล์แทน uuid
export function useMyFonts() {
  const query = useQuery({
    queryKey: MY_FONTS_KEY,
    queryFn: () => api.list<Asset>(`/assets${qs({ kind: 'font', limit: 100 })}`),
  });
  const items = query.data?.items;

  useEffect(() => {
    if (items) useUserFonts.getState().setNames(items);
  }, [items]);

  return query;
}
