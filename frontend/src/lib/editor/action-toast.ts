import { create } from 'zustand';

/// ป๊อปอัปเล็กมุมขวาบอกว่าคีย์ลัด (หรือปุ่ม) เพิ่งทำอะไร เช่น "เลิกทำ · Ctrl+Z"
///
/// ซ้อนได้ไม่เกิน 3 อัน ใหม่สุดอยู่บน · ทำอย่างเดิมซ้ำภายในเวลาที่ยังแสดงอยู่ = นับเพิ่ม (×3) แทนการซ้อนอันใหม่
/// ผู้ชมปิดได้ (เก็บใน localStorage ของเครื่องนี้)

export interface ActionToast {
  id: number;
  label: string;
  keys: string | null;
  count: number;
  /// ทำไม่ได้ (เช่น ไม่มีอะไรให้เลิกทำ) — แสดงเป็นโทนจาง
  muted: boolean;
}

export const ACTION_TOAST_MS = 1600;
const MAX_TOASTS = 3;
const PREF_KEY = 'csc-action-toasts';

function readEnabled(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

interface ActionToastState {
  toasts: ActionToast[];
  enabled: boolean;
  push(label: string, keys?: string | null, muted?: boolean): void;
  dismiss(id: number): void;
  setEnabled(enabled: boolean): void;
}

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useActionToasts = create<ActionToastState>((set, get) => ({
  toasts: [],
  enabled: readEnabled(),
  push(label, keys = null, muted = false) {
    if (!get().enabled) return;

    const same = get().toasts.find((t) => t.label === label && t.keys === keys);
    const id = same?.id ?? nextId++;

    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => get().dismiss(id), ACTION_TOAST_MS),
    );

    if (same) {
      set({ toasts: [{ ...same, count: same.count + 1 }, ...get().toasts.filter((t) => t.id !== id)] });
      return;
    }

    const next = [{ id, label, keys, count: 1, muted }, ...get().toasts];

    for (const dropped of next.slice(MAX_TOASTS)) clearTimeout(timers.get(dropped.id));
    set({ toasts: next.slice(0, MAX_TOASTS) });
  },
  dismiss(id) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
  setEnabled(enabled) {
    try {
      localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off');
    } catch {
      // ใช้ได้แค่ในหน้าที่เปิดอยู่
    }
    if (!enabled) set({ toasts: [] });
    set({ enabled });
  },
}));

/// เรียกจากคีย์ลัดหรือปุ่มต่าง ๆ — `keys` ใช้รูปแบบเดียวกับตารางคีย์ลัด เช่น "Mod+Z"
export function notifyAction(label: string, keys?: string | null, muted = false) {
  useActionToasts.getState().push(label, keys ?? null, muted);
}
