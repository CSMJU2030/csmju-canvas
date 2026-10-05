import type { ReactNode } from 'react';

/// ชุดสำเร็จรูปของหมวด ตาราง · ชาร์ต · กรอบ · กริด ในแผงองค์ประกอบ
///
/// แต่ละหมวดเป็น "ช่องเสียบ": แผงแสดงไทล์ของหมวดก็ต่อเมื่อรายการของหมวดนั้นไม่ว่าง
/// (ไม่มีปุ่มที่กดแล้วไม่ทำอะไร) · เมื่อกดชิ้นในหมวด แผงเรียก `insert()` ของชิ้นนั้น
/// ผู้เพิ่มชุดใหม่แค่ใส่รายการลงอาร์เรย์ข้างล่าง ไม่ต้องแก้ elements-panel.tsx

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

// lead: wire TABLE_PRESETS / insertTable here (เช่น { key: '3x3', label: 'ตาราง 3×3', glyph: <TableGlyph />, insert: () => insertTable(3, 3) })
export const TABLE_PRESETS: ElementPreset[] = [];

// lead: wire CHART_PRESETS / insertChart here
export const CHART_PRESETS: ElementPreset[] = [];

// lead: wire FRAME_PRESETS / insertFrame here
export const FRAME_PRESETS: ElementPreset[] = [];

// lead: wire GRID_PRESETS / insertGrid here
export const GRID_PRESETS: ElementPreset[] = [];
