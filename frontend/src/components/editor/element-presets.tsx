import type { ReactNode } from 'react';
import { insertFrame, insertGrid } from '@/lib/editor/frame-actions';
import { FRAME_SHAPES, GRID_LAYOUTS } from '@/lib/editor/frames';
import { useEditor } from '@/lib/editor/store';
import { CHART_KINDS, ChartKindGlyph, insertChart } from './chart-panel';
import { FrameShapeGlyph, GridLayoutGlyph } from './frame-glyphs';
import { TABLE_PRESETS as TABLE_STYLES, TablePresetGlyph, insertTable } from './table-presets';

/// ชุดสำเร็จรูปของหมวด ตาราง · ชาร์ต · กรอบ · กริด ในแผงองค์ประกอบ
///
/// แต่ละหมวดเป็น "ช่องเสียบ": แผงแสดงไทล์ของหมวดก็ต่อเมื่อรายการของหมวดนั้นไม่ว่าง
/// (ไม่มีปุ่มที่กดแล้วไม่ทำอะไร) · เมื่อกดชิ้นในหมวด แผงเรียก `insert()` ของชิ้นนั้น
/// ผู้เพิ่มชุดใหม่แค่ใส่รายการลงอาร์เรย์ข้างล่าง ไม่ต้องแก้ elements-panel.tsx · insert ทุกตัวเป็น undo หนึ่งขั้นและเลือกชิ้นที่เพิ่ม

export interface ElementPreset {
  /// ไม่ซ้ำในหมวด
  key: string;
  /// ชื่อภาษาไทยที่แสดงใต้ภาพและอ่านโดยโปรแกรมอ่านหน้าจอ
  label: string;
  /// ภาพตัวอย่างในไทล์ (SVG หรือ element เล็ก ๆ ที่ใช้สีจาก token)
  glyph: ReactNode;
  /// ใส่ลงหน้าปัจจุบัน — อ่านขนาดหน้าและเพิ่ม element เองผ่าน useEditor.getState()
  insert: () => void;
}

/// ขนาดหน้าปัจจุบัน (หน้าที่ตั้งขนาดเองใช้ขนาดของหน้านั้น)
function pageSize() {
  const { width, height } = useEditor.getState();

  return { width, height };
}

export const TABLE_PRESETS: ElementPreset[] = TABLE_STYLES.map((preset) => ({
  key: preset.key,
  label: preset.label,
  glyph: <TablePresetGlyph preset={preset.key} />,
  insert: () => insertTable(pageSize(), preset.key),
}));

export const CHART_PRESETS: ElementPreset[] = CHART_KINDS.map((kind) => ({
  key: kind.key,
  label: kind.label,
  glyph: <ChartKindGlyph kind={kind.key} />,
  insert: () => void insertChart(pageSize(), kind.key),
}));

export const FRAME_PRESETS: ElementPreset[] = FRAME_SHAPES.map((shape) => ({
  key: shape.key,
  label: shape.label,
  glyph: <FrameShapeGlyph shape={shape.key} className="size-10" />,
  insert: () => void insertFrame(pageSize(), shape.key),
}));

export const GRID_PRESETS: ElementPreset[] = GRID_LAYOUTS.map((layout) => ({
  key: layout.key,
  label: layout.label,
  glyph: <GridLayoutGlyph layout={layout.key} className="size-10" />,
  insert: () => void insertGrid(pageSize(), layout.key),
}));
