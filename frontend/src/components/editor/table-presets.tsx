'use client';

import { createTable } from '@/lib/editor/factory';
import { useEditor } from '@/lib/editor/store';
import { TABLE_PRESETS, findTablePreset, type TablePreset, type TablePresetKey } from '@/lib/editor/table';

/// ตารางสำเร็จรูปสำหรับแผงองค์ประกอบ — ภาพตัวอย่างและคำสั่งเพิ่มตารางลงหน้า

export { TABLE_PRESETS, type TablePreset, type TablePresetKey };

/// เพิ่มตารางว่าง (ค่าเริ่มต้น 3 × 3) ลงกลางหน้าปัจจุบันแล้วเลือกไว้ · undo ได้ขั้นเดียว
export function insertTable(page: { width: number; height: number }, presetKey: TablePresetKey | string, rows = 3, cols = 3) {
  useEditor.getState().addElements([createTable(page, rows, cols, findTablePreset(presetKey).key)]);
}

const GLYPH_ROWS = 4;
const GLYPH_COLS = 3;
const CELL_W = 20;
const CELL_H = 10;

/// ภาพตัวอย่างของรูปแบบตาราง (สีพื้น หัวตาราง แถวสลับ เส้น) — ขีดในช่องแทนตำแหน่งข้อความ
export function TablePresetGlyph({ preset, className = 'h-10 w-16' }: { preset: TablePresetKey | TablePreset; className?: string }) {
  const p = typeof preset === 'string' ? findTablePreset(preset) : preset;
  const width = CELL_W * GLYPH_COLS;
  const height = CELL_H * GLYPH_ROWS;
  const stroke = Math.max(0.6, p.borderScale * 12);
  const cells: React.ReactNode[] = [];
  const lines: string[] = [];

  for (let r = 0; r < GLYPH_ROWS; r++) {
    const header = p.header && r === 0;
    const body = p.header ? r - 1 : r;
    const fill = header ? p.headerFill : (p.bodyFill ?? (p.stripeFill && body % 2 === 1 ? p.stripeFill : null));

    for (let c = 0; c < GLYPH_COLS; c++) {
      if (fill) cells.push(<rect key={`f${r}-${c}`} x={c * CELL_W} y={r * CELL_H} width={CELL_W + 0.3} height={CELL_H + 0.3} fill={fill} />);
      cells.push(
        <rect
          key={`t${r}-${c}`}
          x={c * CELL_W + 4}
          y={r * CELL_H + CELL_H / 2 - 1}
          width={header ? 10 : 8}
          height={2}
          rx={1}
          fill={header ? p.headerColor : p.color}
          opacity={header ? 0.9 : 0.45}
        />,
      );
    }
  }

  if (p.lines !== 'none') {
    for (let r = 0; r <= GLYPH_ROWS; r++) lines.push(`M0 ${r * CELL_H}H${width}`);
    if (p.lines === 'all') for (let c = 0; c <= GLYPH_COLS; c++) lines.push(`M${c * CELL_W} 0V${height}`);
  }

  return (
    <svg aria-hidden viewBox={`-1 -1 ${width + 2} ${height + 2}`} className={className}>
      <rect x={0} y={0} width={width} height={height} fill="rgb(255 255 255)" />
      {cells}
      {lines.length > 0 && <path d={lines.join('')} fill="none" stroke={p.borderColor} strokeWidth={stroke} strokeLinecap="square" />}
    </svg>
  );
}
