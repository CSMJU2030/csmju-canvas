import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_TOAST_MS, notifyAction, useActionToasts } from './action-toast';
import { createShape, createText } from './factory';
import { SHORTCUT_GROUPS, formatKeys, searchShortcuts } from './shortcuts';
import { useEditor } from './store';
import { blankDocument } from './types';

const PAGE = { width: 1920, height: 1080 };

function load() {
  useEditor.getState().load(
    { designId: 'd1', title: 'งานทดสอบ', designType: 'presentation', width: PAGE.width, height: PAGE.height, access: 'OWNER', linkAccess: 'NONE' },
    blankDocument(),
  );
}

describe('ตารางคีย์ลัด', () => {
  it('Mod เป็น Ctrl บน Windows และเป็นสัญลักษณ์บน macOS', () => {
    expect(formatKeys('Mod+Shift+Z / Mod+Y', false)).toBe('Ctrl+Shift+Z / Ctrl+Y');
    expect(formatKeys('Mod+Shift+Z / Mod+Y', true)).toBe('⌘⇧Z / ⌘Y');
    expect(formatKeys('Shift+ลูกศร', true)).toBe('⇧+ลูกศร');
    expect(formatKeys('PageDown / PageUp', false)).toBe('PageDown / PageUp');
  });

  it('ค้นหาได้ทั้งชื่อการกระทำและปุ่ม (พิมพ์ Ctrl ก็เจอ)', () => {
    expect(searchShortcuts('').length).toBe(SHORTCUT_GROUPS.length);
    expect(searchShortcuts('ตัด').flatMap((g) => g.items.map((s) => s.keys))).toContain('Mod+X');
    expect(searchShortcuts('ctrl+g').flatMap((g) => g.items.map((s) => s.label))).toEqual(['จัดกลุ่ม']);
    expect(searchShortcuts('ไม่มีคำนี้แน่นอน')).toEqual([]);
  });

  it('ไม่มีปุ่มซ้ำกันในตาราง', () => {
    const keys = SHORTCUT_GROUPS.flatMap((g) => g.items.map((s) => s.keys));

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('ป๊อปอัปมุมขวา', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useActionToasts.setState({ toasts: [], enabled: true });
  });

  afterEach(() => vi.useRealTimers());

  it('ทำซ้ำอย่างเดิมนับเพิ่มแทนการซ้อน · ไม่เกิน 3 อัน · หายเองตามเวลา', () => {
    notifyAction('เลิกทำ', 'Mod+Z');
    notifyAction('เลิกทำ', 'Mod+Z');
    expect(useActionToasts.getState().toasts).toHaveLength(1);
    expect(useActionToasts.getState().toasts[0].count).toBe(2);

    notifyAction('คัดลอก', 'Mod+C');
    notifyAction('วาง', 'Mod+V');
    notifyAction('ลบ', 'Delete');
    expect(useActionToasts.getState().toasts.map((t) => t.label)).toEqual(['ลบ', 'วาง', 'คัดลอก']);

    vi.advanceTimersByTime(ACTION_TOAST_MS + 1);
    expect(useActionToasts.getState().toasts).toEqual([]);
  });

  it('ปิดป๊อปอัปแล้วไม่แสดงอีก', () => {
    useActionToasts.getState().setEnabled(false);
    notifyAction('เลิกทำ', 'Mod+Z');
    expect(useActionToasts.getState().toasts).toEqual([]);
    useActionToasts.getState().setEnabled(true);
  });
});

describe('ตัดและวางที่ตำแหน่งเดิม', () => {
  beforeEach(load);

  it('Ctrl+X ลบชิ้นที่เลือกแต่เก็บไว้วาง · วางที่ตำแหน่งเดิมได้พิกัดเดิม id ใหม่', () => {
    const s = useEditor.getState;
    const rect = createShape(PAGE, 'rect');

    s().addElements([rect]);
    s().cutSelected();
    expect(s().doc.pages[0].elements).toHaveLength(0);
    expect(s().clipboard).toHaveLength(1);

    s().pasteInPlace();

    const pasted = s().doc.pages[0].elements[0];

    expect([pasted.x, pasted.y]).toEqual([rect.x, rect.y]);
    expect(pasted.id).not.toBe(rect.id);
  });

  it('ชิ้นที่ล็อกอยู่ไม่ถูกตัดออก', () => {
    const s = useEditor.getState;
    const text = { ...createText(PAGE, 'body'), locked: true };

    s().addElements([text]);
    s().select([text.id]);
    s().cutSelected();
    expect(s().doc.pages[0].elements).toHaveLength(1);
  });
});
