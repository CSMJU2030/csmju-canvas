import { create } from 'zustand';
import { tableSize, type CellRef } from './table';
import type { TableElement } from './types';

/// ช่องของตารางที่เลือกอยู่ และกำลังพิมพ์ในช่องนั้นหรือไม่
///
/// แยกจาก store ของงานเหมือน ui-store — การเลือกช่องไม่ใช่การแก้งาน จึงไม่เข้าประวัติ undo

export interface TableCellRef extends CellRef {
  id: string;
}

interface TableUi {
  cell: TableCellRef | null;
  editing: boolean;
  selectCell(cell: TableCellRef | null): void;
  startEditing(cell: TableCellRef): void;
  stopEditing(): void;
}

export const useTableUi = create<TableUi>((set) => ({
  cell: null,
  editing: false,
  selectCell(cell) {
    set({ cell, editing: false });
  },
  startEditing(cell) {
    set({ cell, editing: true });
  },
  stopEditing() {
    set({ editing: false });
  },
}));

/// ช่องที่เลือกของตารางนี้ — ใช้ได้เฉพาะเมื่อเป็นของตารางนี้และยังอยู่ในขนาดตาราง (หลังลบแถว/คอลัมน์)
export function activeCell(el: TableElement | undefined, cell: TableCellRef | null): CellRef | null {
  if (!el || !cell || cell.id !== el.id) return null;

  const { rows, cols } = tableSize(el);

  return cell.row < rows && cell.col < cols ? { row: cell.row, col: cell.col } : null;
}
