'use client';

import { useEffect } from 'react';
import { notifyAction } from '@/lib/editor/action-toast';
import { createShape, createText } from '@/lib/editor/factory';
import { canEditDoc, currentPage, useEditor } from '@/lib/editor/store';
import { activeCell, useTableUi } from '@/lib/editor/table-ui';
import type { TextElement } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import { zoomBy, zoomTo } from '@/lib/editor/viewport';
import { promptLink } from './context-menu';
import { fitView, isTyping } from './stage';
import { printDesign } from './top-bar';

/// คีย์ลัดของหน้าแก้ไข — ตารางที่แสดงผู้ใช้อยู่ใน lib/editor/shortcuts.ts (หน้ารวมคีย์ลัด Ctrl+/ และ /help/shortcuts)
///
/// ทุกการกระทำแจ้งป๊อปอัปเล็กมุมขวา (lib/editor/action-toast.ts) · Ctrl+V จัดการที่เหตุการณ์ paste (file-import.tsx)
/// เพื่อวางได้ทั้งชิ้นงานที่คัดลอกในหน้าแก้ไขและไฟล์/ข้อความจากที่อื่น

const ZOOM_STEP = 1.2;

/// ลูกศรที่กดค้างหรือกดติดกันนับเป็น undo ขั้นเดียว — ปิด gesture เมื่อปล่อยปุ่มลูกศรทั้งหมด
let nudging = false;

function count(n: number) {
  return n > 1 ? ` ${n} ชิ้น` : '';
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      const state = useEditor.getState();
      const ui = useEditorUi.getState();
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      // หน้ารวมคีย์ลัดและมุมมองใช้ได้แม้เปิดแบบดูอย่างเดียว
      if ((mod && key === '/') || (!mod && event.key === '?')) {
        event.preventDefault();
        ui.set({ overlay: ui.overlay === 'shortcuts' ? null : 'shortcuts' });
        return;
      }

      if (mod && !event.altKey && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        zoomBy(ZOOM_STEP);
        notifyAction('ซูมเข้า', 'Mod+=');
        return;
      }

      if (mod && !event.altKey && (event.key === '-' || event.key === '_')) {
        event.preventDefault();
        zoomBy(1 / ZOOM_STEP);
        notifyAction('ซูมออก', 'Mod+-');
        return;
      }

      if (mod && !event.altKey && event.key === '0') {
        event.preventDefault();
        zoomTo(1);
        notifyAction('ขนาดจริง 100%', 'Mod+0');
        return;
      }

      if (event.shiftKey && !mod && (event.key === '!' || event.code === 'Digit1')) {
        event.preventDefault();
        fitView();
        notifyAction('พอดีจอ', 'Shift+1');
        return;
      }

      if (!mod && !event.altKey && (event.key === 'PageDown' || event.key === 'PageUp')) {
        const next = state.pageIndex + (event.key === 'PageDown' ? 1 : -1);

        event.preventDefault();
        if (next < 0 || next >= state.doc.pages.length) {
          notifyAction(next < 0 ? 'อยู่หน้าแรกแล้ว' : 'อยู่หน้าสุดท้ายแล้ว', event.key, true);
          return;
        }

        state.setPageIndex(next);
        notifyAction(`หน้า ${next + 1}`, event.key);
        return;
      }

      // ลิงก์แบบดูได้ — ไม่มีคีย์ลัดที่แก้งาน
      if (!canEditDoc(state)) return;

      if (mod && key === 'z') {
        event.preventDefault();

        if (event.shiftKey) {
          if (state.future.length === 0) return notifyAction('ไม่มีอะไรให้ทำซ้ำ', 'Mod+Shift+Z', true);
          state.redo();
          notifyAction('ทำซ้ำ', 'Mod+Shift+Z');
        } else {
          if (state.past.length === 0) return notifyAction('ไม่มีอะไรให้เลิกทำ', 'Mod+Z', true);
          state.undo();
          notifyAction('เลิกทำ', 'Mod+Z');
        }

        return;
      }

      if (mod && key === 'y') {
        event.preventDefault();
        if (state.future.length === 0) return notifyAction('ไม่มีอะไรให้ทำซ้ำ', 'Mod+Y', true);
        state.redo();
        notifyAction('ทำซ้ำ', 'Mod+Y');
        return;
      }

      if (mod && key === 's') {
        event.preventDefault();
        window.dispatchEvent(new Event('csc-save-now'));
        return;
      }

      if (mod && key === 'a') {
        event.preventDefault();

        const ids = currentPage(state).elements.filter((el) => !el.hidden).map((el) => el.id);

        state.select(ids);
        notifyAction(`เลือกทั้งหมด${count(ids.length)}`, 'Mod+A');
        return;
      }

      if (event.shiftKey && !mod && key === 'r') {
        event.preventDefault();
        ui.toggleRulers();
        notifyAction(useEditorUi.getState().rulers ? 'แสดงไม้บรรทัด' : 'ซ่อนไม้บรรทัด', 'Shift+R');
        return;
      }

      if (mod && key === 'f') {
        event.preventDefault();
        ui.set({ overlay: 'find' });
        return;
      }

      if (mod && key === 'p' && !event.altKey) {
        event.preventDefault();
        void printDesign();
        return;
      }

      if (mod && event.key === 'Enter') {
        event.preventDefault();
        state.addPage();
        notifyAction(`เพิ่มหน้า ${useEditor.getState().pageIndex + 1}`, 'Mod+Enter');
        return;
      }

      if (mod && event.key === 'Backspace' && state.selection.length === 0) {
        event.preventDefault();

        if (state.doc.pages.length <= 1) return notifyAction('ลบหน้าสุดท้ายไม่ได้', 'Mod+Backspace', true);
        if (currentPage(state).locked) return notifyAction('หน้านี้ล็อกอยู่', 'Mod+Backspace', true);
        if (!window.confirm(`ลบหน้า ${state.pageIndex + 1} ใช่ไหม? (กด Ctrl+Z เพื่อเลิกทำได้)`)) return;

        const removed = state.pageIndex + 1;

        state.deletePage(state.pageIndex);
        notifyAction(`ลบหน้า ${removed}`, 'Mod+Backspace');
        return;
      }

      if (event.altKey && !mod && event.key === '1') {
        event.preventDefault();
        ui.setPanel('position');
        return;
      }

      // ทางลัดเครื่องมือ (ตัวอักษรเดียว ไม่มี modifier) — ใส่ชิ้นงานกลางหน้า แล้วเลือกให้
      if (!mod && !event.altKey && !event.shiftKey && !event.repeat) {
        const page = { width: state.width, height: state.height };
        const tools: Record<string, () => string> = {
          t: () => {
            state.addElements([createText(page, 'body', { text: 'ข้อความในย่อหน้าของคุณ' })]);
            return 'เพิ่มข้อความ';
          },
          r: () => {
            state.addElements([createShape(page, 'rect')]);
            return 'เพิ่มสี่เหลี่ยม';
          },
          o: () => {
            state.addElements([createShape(page, 'ellipse')]);
            return 'เพิ่มวงกลม';
          },
          l: () => {
            state.addElements([createShape(page, 'line')]);
            return 'เพิ่มเส้น';
          },
          d: () => {
            state.setTool({ mode: 'draw', brush: 'pen' });
            return 'ปากกาวาด';
          },
          v: () => {
            state.setTool({ mode: 'select' });
            return 'เครื่องมือเลือก';
          },
        };
        const run = tools[key];

        if (run) {
          event.preventDefault();
          notifyAction(run(), key.toUpperCase());
          return;
        }
      }

      if (event.key === 'Escape' && ui.imageErase) {
        ui.set({ imageErase: null });
        return;
      }

      // จัดตำแหน่งรูปในกรอบเสร็จ (กรอบยังถูกเลือกอยู่)
      if ((event.key === 'Escape' || event.key === 'Enter') && ui.frameEdit) {
        event.preventDefault();
        ui.set({ frameEdit: null });
        return;
      }

      if (event.key === 'Escape' && ui.painting) {
        ui.setPainting(false);
        return;
      }

      if (event.key === 'Escape' && state.tool.mode === 'draw') {
        state.setTool({ mode: 'select' });
        notifyAction('เครื่องมือเลือก', 'Esc');
        return;
      }

      // วางที่ตำแหน่งเดิม (Ctrl+Shift+V) — กันเหตุการณ์ paste แล้ววางชิ้นงานที่คัดลอกโดยไม่เลื่อน
      if (mod && event.shiftKey && key === 'v') {
        event.preventDefault();
        if (state.clipboard.length === 0) return notifyAction('ยังไม่ได้คัดลอกชิ้นงาน', 'Mod+Shift+V', true);
        state.pasteInPlace();
        notifyAction(`วางที่ตำแหน่งเดิม${count(state.clipboard.length)}`, 'Mod+Shift+V');
        return;
      }

      if (state.selection.length === 0) {
        if (mod && (key === 'c' || key === 'x' || key === 'd' || key === 'g')) notifyAction('ยังไม่ได้เลือกชิ้นงาน', null, true);
        return;
      }

      const page = currentPage(state);
      const picked = page.elements.filter((el) => state.selection.includes(el.id));
      const n = picked.length;

      if (event.key === 'Escape') {
        state.select([]);
        return;
      }

      // Ctrl+Alt+C = คัดลอกสไตล์ แล้วคลิกชิ้นงานถัดไปเพื่อวาง
      if (mod && event.altKey && key === 'c') {
        event.preventDefault();
        state.copyStyle();
        ui.setPainting(true);
        notifyAction('คัดลอกสไตล์แล้ว — คลิกชิ้นที่จะวาง', 'Mod+Alt+C');
        return;
      }

      if (mod && event.altKey && key === 'v') {
        event.preventDefault();
        if (!state.styleClipboard) return notifyAction('ยังไม่ได้คัดลอกสไตล์', 'Mod+Alt+V', true);
        state.pasteStyle(state.selection);
        notifyAction(`วางสไตล์${count(n)}`, 'Mod+Alt+V');
        return;
      }

      if (mod && key === 'k' && !event.shiftKey) {
        event.preventDefault();
        promptLink(picked[0]?.link ?? '', () => undefined);
        return;
      }

      if (event.altKey && event.shiftKey && key === 'l') {
        event.preventDefault();

        const locked = picked.every((el) => el.locked);

        state.updateElements(state.selection, () => ({ locked: !locked }));
        notifyAction(locked ? `ปลดล็อก${count(n)}` : `ล็อก${count(n)}`, 'Alt+Shift+L');
        return;
      }

      const texts = picked.filter((el): el is TextElement => el.type === 'text' && !el.locked);
      const textIds = texts.map((el) => el.id);

      // ตัวหนา/เอียง/ขีดเส้นใต้
      if (mod && !event.shiftKey && (key === 'b' || key === 'i' || key === 'u')) {
        if (texts.length === 0) return;
        event.preventDefault();

        const first = texts[0];
        const on = key === 'b' ? first.fontWeight !== 700 : key === 'i' ? !first.italic : !first.underline;

        state.updateElements(textIds, () => (key === 'b' ? { fontWeight: on ? 700 : 400 } : key === 'i' ? { italic: on } : { underline: on }));
        notifyAction(`${key === 'b' ? 'ตัวหนา' : key === 'i' ? 'ตัวเอียง' : 'ขีดเส้นใต้'} ${on ? 'เปิด' : 'ปิด'}`, `Mod+${key.toUpperCase()}`);
        return;
      }

      // จัดข้อความ · ตัวพิมพ์ใหญ่ · ขนาดตัวอักษร (Ctrl+Shift+…)
      if (mod && event.shiftKey && texts.length > 0) {
        const aligns: Record<string, TextElement['align']> = { l: 'left', e: 'center', r: 'right', j: 'justify' };
        const alignNames: Record<string, string> = { l: 'จัดชิดซ้าย', e: 'จัดกึ่งกลาง', r: 'จัดชิดขวา', j: 'จัดเต็มบรรทัด' };

        if (aligns[key]) {
          event.preventDefault();
          state.updateElements(textIds, () => ({ align: aligns[key] }));
          notifyAction(alignNames[key], `Mod+Shift+${key.toUpperCase()}`);
          return;
        }

        if (key === 'k') {
          event.preventDefault();

          const on = !texts[0].uppercase;

          state.updateElements(textIds, () => ({ uppercase: on }));
          notifyAction(on ? 'ตัวพิมพ์ใหญ่ทั้งหมด' : 'เลิกตัวพิมพ์ใหญ่', 'Mod+Shift+K');
          return;
        }

        if (event.key === '>' || event.key === '<' || event.code === 'Period' || event.code === 'Comma') {
          event.preventDefault();

          const bigger = event.key === '>' || event.code === 'Period';

          state.updateElements(textIds, (el) => {
            const size = (el as TextElement).fontSize;

            return { fontSize: Math.max(6, Math.round(bigger ? size * 1.1 + 1 : size / 1.1 - 1)) };
          });
          notifyAction(bigger ? 'ขยายตัวอักษร' : 'ลดขนาดตัวอักษร', bigger ? 'Mod+Shift+.' : 'Mod+Shift+,');
          return;
        }
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        state.removeSelected();
        notifyAction(`ลบ${count(n)}`, event.key === 'Delete' ? 'Delete' : 'Backspace');
        return;
      }

      if (mod && key === 'c') {
        state.copySelected();
        notifyAction(`คัดลอก${count(n)}`, 'Mod+C');
        return;
      }

      if (mod && key === 'x') {
        event.preventDefault();
        if (picked.every((el) => el.locked)) return notifyAction('ชิ้นที่ล็อกอยู่ตัดไม่ได้', 'Mod+X', true);
        state.cutSelected();
        notifyAction(`ตัด${count(n)}`, 'Mod+X');
        return;
      }

      if (mod && key === 'd') {
        event.preventDefault();
        state.duplicateSelected();
        notifyAction(`ทำสำเนา${count(n)}`, 'Mod+D');
        return;
      }

      if (mod && key === 'g') {
        event.preventDefault();

        if (event.shiftKey) {
          state.ungroupSelected();
          notifyAction('แยกกลุ่มแล้ว', 'Mod+Shift+G');
        } else {
          if (n < 2) return notifyAction('เลือกอย่างน้อย 2 ชิ้นเพื่อจัดกลุ่ม', 'Mod+G', true);
          state.groupSelected();
          notifyAction(`จัดกลุ่ม${count(n)}`, 'Mod+G');
        }

        return;
      }

      if (mod && (event.key === ']' || event.code === 'BracketRight')) {
        event.preventDefault();

        const top = event.shiftKey || event.altKey;

        state.reorderSelected(top ? 'front' : 'forward');
        notifyAction(top ? 'ยกขึ้นบนสุด' : 'ยกขึ้นหนึ่งชั้น', top ? 'Mod+Alt+]' : 'Mod+]');
        return;
      }

      if (mod && (event.key === '[' || event.code === 'BracketLeft')) {
        event.preventDefault();

        const bottom = event.shiftKey || event.altKey;

        state.reorderSelected(bottom ? 'back' : 'backward');
        notifyAction(bottom ? 'ส่งลงล่างสุด' : 'ส่งลงหนึ่งชั้น', bottom ? 'Mod+Alt+[' : 'Mod+[');
        return;
      }

      if (event.key === 'Enter') {
        const only = picked[0];

        if (n === 1 && only?.type === 'text' && !only.locked) {
          event.preventDefault();
          state.setEditingText(only.id);
        }

        // ตาราง: Enter = พิมพ์ในช่องที่เลือก (ยังไม่เลือก = ช่องแรก)
        if (n === 1 && only?.type === 'table' && !only.locked) {
          const cell = activeCell(only, useTableUi.getState().cell) ?? { row: 0, col: 0 };

          event.preventDefault();
          useTableUi.getState().startEditing({ id: only.id, ...cell });
        }

        // Enter บนกรอบ/กริดที่มีรูป = เข้าโหมดจัดตำแหน่งรูปของช่องที่เลือก
        if (n === 1 && (only?.type === 'frame' || only?.type === 'grid') && !only.locked) {
          const chosen = ui.frameCell;
          const cell = chosen?.id === only.id ? chosen.cell : 0;
          const image = only.type === 'frame' ? only.image : only.cells[cell];

          if (image) {
            event.preventDefault();
            ui.set({ frameCell: { id: only.id, cell }, frameEdit: { id: only.id, cell } });
          }
        }

        return;
      }

      const step = event.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[event.key];

      if (move && !mod) {
        event.preventDefault();

        const movable = picked.filter((el) => !el.locked).map((el) => el.id);

        if (movable.length === 0) return notifyAction('ชิ้นที่ล็อกอยู่เลื่อนไม่ได้', null, true);

        if (!nudging) {
          nudging = true;
          state.beginGesture();
        }

        state.updateElements(movable, (el) => ({ x: el.x + move[0], y: el.y + move[1] }));
        notifyAction(`เลื่อน ${step} px`, event.shiftKey ? 'Shift+ลูกศร' : 'ลูกศร');
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (nudging && event.key.startsWith('Arrow')) {
        nudging = false;
        useEditor.getState().endGesture();
      }
    };

    // สลับหน้าต่างระหว่างกดลูกศรค้าง — ปิด gesture ไม่ให้ค้าง
    const onBlur = () => {
      if (!nudging) return;
      nudging = false;
      useEditor.getState().endGesture();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
