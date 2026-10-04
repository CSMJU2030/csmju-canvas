import { useSyncExternalStore } from 'react';

/// รายการ "ใช้งานล่าสุด" ของแผงต่าง ๆ ในหน้าแก้ไข (เทมเพลต องค์ประกอบ เซ็ตฟอนต์)
///
/// เป็นความสะดวกส่วนตัวของผู้ใช้ในเบราว์เซอร์นี้ จึงเก็บใน localStorage — ถ้าเบราว์เซอร์ปิดการเก็บ
/// (โหมดส่วนตัว) ก็แค่ไม่มีรายการ ไม่กระทบงาน · ไม่มีข้อมูลบุคคล เก็บแค่ id/สรุปของสิ่งที่กดใช้

export type RecentKey = 'templates' | 'elements' | 'fontsets';

const PREFIX = 'csc.recent.';
const LIMIT = 12;
const EMPTY: never[] = [];
const cache = new Map<RecentKey, unknown[]>();
const listeners = new Set<() => void>();

function read<T>(key: RecentKey): T[] {
  if (cache.has(key)) return cache.get(key) as T[];

  let items: T[] = EMPTY;

  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;

    if (Array.isArray(parsed)) items = parsed as T[];
  } catch {
    // อ่านไม่ได้ = ไม่มีรายการ
  }

  cache.set(key, items);

  return items;
}

/// ใส่รายการไว้หน้าสุด (ตัวซ้ำย้ายขึ้นมา) — `id` ใช้เทียบตัวซ้ำ
export function pushRecent<T extends { id: string }>(key: RecentKey, item: T) {
  if (typeof window === 'undefined') return;

  const next = [item, ...read<T>(key).filter((existing) => existing.id !== item.id)].slice(0, LIMIT);

  cache.set(key, next);

  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(next));
  } catch {
    // เก็บไม่ได้ก็ยังแสดงในหน้านี้ได้จนกว่าจะปิด
  }

  for (const listener of listeners) listener();
}

export function useRecent<T>(key: RecentKey): T[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    () => read<T>(key),
    () => EMPTY,
  );
}
