'use client';

import { useEffect, useRef } from 'react';
import { cssFamily } from '@/lib/editor/fonts';
import { center } from '@/lib/editor/geometry';
import { currentPage, useEditor } from '@/lib/editor/store';
import { TABLE_LINE_HEIGHT, cellColor, cellPadding, cellWeight, insertRow, nextCell, setCell, tableSize } from '@/lib/editor/table';
import { tableCellBox } from '@/lib/editor/table-render';
import { activeCell, useTableUi } from '@/lib/editor/table-ui';
import type { TableElement } from '@/lib/editor/types';

/// ช่องพิมพ์ที่วางทับช่องของตาราง (ดับเบิลคลิกช่อง หรือกด Enter เมื่อเลือกตาราง)
///
/// Tab / Shift+Tab ไปช่องถัดไป/ก่อนหน้า · Tab ที่ช่องสุดท้ายเพิ่มแถวใหม่ (แบบ Canva) · Esc ปิด
/// การพิมพ์ทั้งหมดตั้งแต่เปิดจนปิดรวมเป็น undo ขั้นเดียว
export function TableCellEditor() {
  const ref = useTableUi((s) => s.cell);
  const element = useEditor((s) => currentPage(s).elements.find((el) => el.id === ref?.id));
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const table = element?.type === 'table' ? element : undefined;
  const cell = activeCell(table, ref);
  const tableId = table?.id ?? null;
  const row = cell?.row ?? -1;
  const col = cell?.col ?? -1;

  useEffect(() => {
    if (!tableId) return;

    useEditor.getState().beginGesture();

    return () => useEditor.getState().endGesture();
  }, [tableId]);

  useEffect(() => {
    textarea.current?.focus();
    textarea.current?.select();
  }, [tableId, row, col]);

  if (!table || !cell) return null;

  const box = tableCellBox(table, cell);

  if (!box) return null;

  const { rect, textHeight } = box;
  const pad = cellPadding(table);
  const origin = center(table);
  const update = (patch: (el: TableElement) => Partial<TableElement>) =>
    useEditor.getState().updateElements([table.id], (el) => (el.type === 'table' ? patch(el) : {}));

  const move = (step: 1 | -1) => {
    const target = nextCell(table, cell, step);

    if (target) {
      useTableUi.getState().startEditing({ id: table.id, ...target });
      return;
    }

    // Tab ที่ช่องสุดท้าย = เพิ่มแถวใหม่ท้ายตารางแล้วไปช่องแรกของแถวนั้น
    if (step === 1) {
      const { rows } = tableSize(table);

      update((el) => insertRow(el, rows));
      useTableUi.getState().startEditing({ id: table.id, row: rows, col: 0 });
    }
  };

  return (
    <textarea
      ref={textarea}
      aria-label={`แก้ข้อความในตาราง แถว ${cell.row + 1} คอลัมน์ ${cell.col + 1}`}
      value={table.cells[cell.row][cell.col].text}
      onChange={(event) => update((el) => setCell(el, cell, { text: event.target.value }))}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          useTableUi.getState().stopEditing();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          move(event.shiftKey ? -1 : 1);
        }

        event.stopPropagation();
      }}
      onBlur={() => useTableUi.getState().stopEditing()}
      spellCheck={false}
      className="absolute resize-none overflow-hidden border-0 bg-transparent outline-2 outline-primary"
      style={{
        left: pan.x + rect.x * zoom,
        top: pan.y + rect.y * zoom,
        width: rect.width * zoom,
        height: rect.height * zoom,
        paddingLeft: pad * zoom,
        paddingRight: pad * zoom,
        paddingTop: Math.max(0, (rect.height - textHeight) / 2) * zoom,
        paddingBottom: 0,
        transform: `rotate(${table.rotation}deg)`,
        transformOrigin: `${(origin.x - rect.x) * zoom}px ${(origin.y - rect.y) * zoom}px`,
        fontFamily: cssFamily(table.fontFamily),
        fontSize: table.fontSize * zoom,
        fontWeight: cellWeight(table, cell.row),
        lineHeight: TABLE_LINE_HEIGHT,
        textAlign: table.align,
        color: cellColor(table, cell.row, cell.col),
        opacity: table.opacity,
      }}
    />
  );
}
