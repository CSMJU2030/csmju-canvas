'use client';

import { useEffect } from 'react';
import { currentPage, useEditor } from '@/lib/editor/store';
import { isTyping } from './stage';

/// คีย์ลัดของหน้าแก้ไข (ดูรายการเต็มใน /help/shortcuts)
export function useShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      const state = useEditor.getState();

      // ลิงก์แบบดูได้ — ไม่มีคีย์ลัดที่แก้งาน
      if (state.access === 'VIEW') return;
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

      if (state.selection.length === 0) return;

      if (event.key === 'Escape') {
        state.select([]);
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

      if (mod && event.key === ']') {
        event.preventDefault();
        state.reorderSelected(event.shiftKey ? 'front' : 'forward');
        return;
      }

      if (mod && event.key === '[') {
        event.preventDefault();
        state.reorderSelected(event.shiftKey ? 'back' : 'backward');
        return;
      }

      if (event.key === 'Enter') {
        const only = currentPage(state).elements.find((el) => el.id === state.selection[0]);

        if (state.selection.length === 1 && only?.type === 'text' && !only.locked) {
          event.preventDefault();
          state.setEditingText(only.id);
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
