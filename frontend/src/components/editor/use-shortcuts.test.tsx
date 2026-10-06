import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useActionToasts } from '@/lib/editor/action-toast';
import { createShape, createText } from '@/lib/editor/factory';
import { useEditor } from '@/lib/editor/store';
import type { TextElement } from '@/lib/editor/types';
import { blankDocument } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import { useShortcuts } from './use-shortcuts';

const PAGE = { width: 1920, height: 1080 };

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

function release(key: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}

describe('คีย์ลัดของหน้าแก้ไข', () => {
  beforeEach(() => {
    useEditor.getState().load(
      { designId: 'd1', title: 'งานทดสอบ', designType: 'presentation', width: PAGE.width, height: PAGE.height, access: 'OWNER', linkAccess: 'NONE' },
      blankDocument(),
    );
    useActionToasts.setState({ toasts: [], enabled: true });
    useEditorUi.getState().set({ overlay: null });
  });

  it('ลูกศรที่กดติดกันนับเป็น undo ขั้นเดียว และแจ้งมุมขวา', () => {
    const { unmount } = renderHook(() => useShortcuts());
    const s = useEditor.getState;
    const rect = createShape(PAGE, 'rect');

    s().addElements([rect]);

    const pastBefore = s().past.length;

    press('ArrowRight');
    press('ArrowRight', { repeat: true });
    press('ArrowDown', { shiftKey: true });
    release('ArrowDown');

    const moved = s().doc.pages[0].elements[0];

    expect([moved.x, moved.y]).toEqual([rect.x + 2, rect.y + 10]);
    expect(s().past.length).toBe(pastBefore + 1);
    expect(useActionToasts.getState().toasts[0].label).toBe('เลื่อน 10 px');

    press('z', { ctrlKey: true });
    expect([s().doc.pages[0].elements[0].x, s().doc.pages[0].elements[0].y]).toEqual([rect.x, rect.y]);
    unmount();
  });

  it('Ctrl+X แล้ว Ctrl+Shift+V วางกลับที่เดิม', () => {
    const { unmount } = renderHook(() => useShortcuts());
    const s = useEditor.getState;
    const rect = createShape(PAGE, 'rect');

    s().addElements([rect]);
    press('x', { ctrlKey: true });
    expect(s().doc.pages[0].elements).toHaveLength(0);

    press('V', { ctrlKey: true, shiftKey: true });
    expect(s().doc.pages[0].elements[0].x).toBe(rect.x);
    unmount();
  });

  it('Ctrl+Shift+E จัดกึ่งกลาง · Ctrl+Shift+> ขยายตัวอักษร · Ctrl+Shift+K ตัวพิมพ์ใหญ่', () => {
    const { unmount } = renderHook(() => useShortcuts());
    const s = useEditor.getState;
    const text = { ...createText(PAGE, 'body'), align: 'left' as const };

    s().addElements([text]);
    press('E', { ctrlKey: true, shiftKey: true });
    press('>', { ctrlKey: true, shiftKey: true });
    press('K', { ctrlKey: true, shiftKey: true });

    const after = s().doc.pages[0].elements[0] as TextElement;

    expect(after.align).toBe('center');
    expect(after.fontSize).toBeGreaterThan(text.fontSize);
    expect(after.uppercase).toBe(true);
    unmount();
  });

  it('ไม่มีอะไรให้เลิกทำ = ป๊อปอัปโทนจาง · Ctrl+/ เปิดหน้ารวมคีย์ลัด · T เพิ่มข้อความ', () => {
    const { unmount } = renderHook(() => useShortcuts());

    press('z', { ctrlKey: true });
    expect(useActionToasts.getState().toasts[0]).toMatchObject({ label: 'ไม่มีอะไรให้เลิกทำ', muted: true });

    press('/', { ctrlKey: true });
    expect(useEditorUi.getState().overlay).toBe('shortcuts');

    press('t');
    expect(useEditor.getState().doc.pages[0].elements[0].type).toBe('text');
    unmount();
  });

  it('ลิงก์แบบดูอย่างเดียวแก้งานด้วยคีย์ลัดไม่ได้', () => {
    useEditor.getState().load(
      { designId: 'd1', title: 'งานทดสอบ', designType: 'presentation', width: PAGE.width, height: PAGE.height, access: 'VIEW', linkAccess: 'NONE' },
      blankDocument(),
    );

    const { unmount } = renderHook(() => useShortcuts());

    press('t');
    expect(useEditor.getState().doc.pages[0].elements).toHaveLength(0);
    unmount();
  });
});
