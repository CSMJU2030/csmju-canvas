'use client';

import { useEffect } from 'react';
import { canEditDoc, currentPage, useEditor } from '@/lib/editor/store';
import { useEditorUi } from '@/lib/editor/ui-store';
import { promptLink } from './context-menu';
import { printDesign } from './top-bar';
import { isTyping } from './stage';

/// คีย์ลัดของหน้าแก้ไข (ดูรายการเต็มใน /help/shortcuts)
export function useShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      const state = useEditor.getState();

      // ลิงก์แบบดูได้ — ไม่มีคีย์ลัดที่แก้งาน
      if (!canEditDoc(state)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }

      if (mod && key === 'y') {
        event.preventDefault();
        state.redo();
        return;
      }

      if (mod && key === 'a') {
        event.preventDefault();
        state.select(currentPage(state).elements.filter((el) => !el.hidden).map((el) => el.id));
        return;
      }

      if (event.shiftKey && !mod && key === 'r') {
        event.preventDefault();
        useEditorUi.getState().toggleRulers();
        return;
      }

      if (mod && key === 'f') {
        event.preventDefault();
        useEditorUi.getState().set({ overlay: 'find' });
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
        return;
      }

      if (event.altKey && event.key === '1') {
        event.preventDefault();
        useEditorUi.getState().setPanel('position');
        return;
      }

      if (event.key === 'Escape' && useEditorUi.getState().imageErase) {
        useEditorUi.getState().set({ imageErase: null });
        return;
      }

      // จัดตำแหน่งรูปในกรอบเสร็จ (กรอบยังถูกเลือกอยู่)
      if ((event.key === 'Escape' || event.key === 'Enter') && useEditorUi.getState().frameEdit) {
        event.preventDefault();
        useEditorUi.getState().set({ frameEdit: null });
        return;
      }

      if (event.key === 'Escape' && useEditorUi.getState().painting) {
        useEditorUi.getState().setPainting(false);
        return;
      }

      if (mod && key === 'v' && state.clipboard.length > 0 && state.selection.length === 0) {
        event.preventDefault();
        state.paste();
        return;
      }

      if (state.selection.length === 0) return;

      if (event.key === 'Escape') {
        state.select([]);
        return;
      }

      // Ctrl+Alt+C = คัดลอกสไตล์ แล้วคลิกชิ้นงานถัดไปเพื่อวาง
      if (mod && event.altKey && key === 'c') {
        event.preventDefault();
        state.copyStyle();
        useEditorUi.getState().setPainting(true);
        return;
      }

      if (mod && key === 'k') {
        event.preventDefault();

        const el = currentPage(state).elements.find((e) => e.id === state.selection[0]);

        promptLink(el?.link ?? '', () => undefined);
        return;
      }

      if (event.altKey && event.shiftKey && key === 'l') {
        event.preventDefault();

        const page = currentPage(state);
        const locked = state.selection.every((id) => page.elements.find((el) => el.id === id)?.locked);

        state.updateElements(state.selection, () => ({ locked: !locked }));
        return;
      }

      // ตัวหนา/เอียง/ขีดเส้นใต้ ของข้อความที่เลือก
      if (mod && (key === 'b' || key === 'i' || key === 'u')) {
        const texts = currentPage(state).elements.filter((el) => state.selection.includes(el.id) && el.type === 'text' && !el.locked);

        if (texts.length > 0) {
          event.preventDefault();

          const first = texts[0] as Extract<typeof texts[number], { type: 'text' }>;

          state.updateElements(
            texts.map((el) => el.id),
            () => (key === 'b' ? { fontWeight: first.fontWeight === 700 ? 400 : 700 } : key === 'i' ? { italic: !first.italic } : { underline: !first.underline }),
          );
        }

        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        state.removeSelected();
        return;
      }

      if (mod && key === 'c') {
        state.copySelected();
        return;
      }

      if (mod && key === 'v') {
        event.preventDefault();
        state.paste();
        return;
      }

      if (mod && key === 'd') {
        event.preventDefault();
        state.duplicateSelected();
        return;
      }

      if (mod && key === 'g') {
        event.preventDefault();
        if (event.shiftKey) state.ungroupSelected();
        else state.groupSelected();
        return;
      }

      if (mod && (event.key === ']' || event.code === 'BracketRight')) {
        event.preventDefault();
        state.reorderSelected(event.shiftKey || event.altKey ? 'front' : 'forward');
        return;
      }

      if (mod && (event.key === '[' || event.code === 'BracketLeft')) {
        event.preventDefault();
        state.reorderSelected(event.shiftKey || event.altKey ? 'back' : 'backward');
        return;
      }

      if (event.key === 'Enter') {
        const only = currentPage(state).elements.find((el) => el.id === state.selection[0]);

        if (state.selection.length === 1 && only?.type === 'text' && !only.locked) {
          event.preventDefault();
          state.setEditingText(only.id);
        }

        // Enter บนกรอบ/กริดที่มีรูป = เข้าโหมดจัดตำแหน่งรูปของช่องที่เลือก
        if (state.selection.length === 1 && (only?.type === 'frame' || only?.type === 'grid') && !only.locked) {
          const picked = useEditorUi.getState().frameCell;
          const cell = picked?.id === only.id ? picked.cell : 0;
          const image = only.type === 'frame' ? only.image : only.cells[cell];

          if (image) {
            event.preventDefault();
            useEditorUi.getState().set({ frameCell: { id: only.id, cell }, frameEdit: { id: only.id, cell } });
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

      if (move) {
        event.preventDefault();

        const page = currentPage(state);
        const movable = state.selection.filter((id) => !page.elements.find((el) => el.id === id)?.locked);

        state.updateElements(movable, (el) => ({ x: el.x + move[0], y: el.y + move[1] }));
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
