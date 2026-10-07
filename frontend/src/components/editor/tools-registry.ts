/// ศูนย์รวมเครื่องมือ (กด / ในหน้าแก้ไข) — ทุกรายการทำงานจริงกับงานที่เปิดอยู่ ไม่มีปุ่มเปล่า
///
/// รายการที่ทำตอนนี้ไม่ได้ (เช่น ต้องเลือกรูปก่อน) แสดงเหตุผลแทนการซ่อน ให้ผู้ใช้รู้ว่าระบบมีเครื่องมือนั้น

import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal,
  AlignStartVertical, AlignVerticalDistributeCenter, ArrowDown, ArrowDownToLine, ArrowRight, ArrowUp, ArrowUpToLine, BarChart3, Blend, Bold,
  CalendarDays, ChevronLeft, ChevronRight, Circle, ClipboardCopy, ClipboardPaste, Contrast, Copy, Crop, Download, Droplet, Eraser, Eye,
  EyeOff, FileSearch, FlipHorizontal2, FlipVertical2, Frame, Grid2x2, Group, Hash, Heading, History, Image as ImageIcon, Italic, Keyboard,
  LayoutGrid, Layers, List, ListOrdered, Lock, Maximize, Minus, Move, Palette, PenLine, Play, Plus, Printer, QrCode, Redo2, Replace, Ruler,
  Save, Scaling, Scissors, Shapes, Shuffle, Sparkles, Square, Star, StickyNote, Strikethrough, Table2, Text, Timer, Trash2, Triangle, Type,
  Underline, Undo2, Ungroup, WandSparkles, ZoomIn, ZoomOut, type LucideIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify, CaseUpper,
  RotateCw, RotateCcw, Ratio, Spline, Wallpaper, FileText, Accessibility, Gauge, Signature, ScanEye, Paintbrush, Film,
} from 'lucide-react';
import { notifyAction } from '@/lib/editor/action-toast';
import { centerOffset, cleanSpaces, textStats, tidyUp } from '@/lib/editor/arrange';
import { DESIGN_STYLES, applyStyleFonts, paletteMapping, recolorDocument } from '@/lib/editor/design-styles';
import { createChart, createFrame, createGrid, createShape, createSticky, createTable, createText } from '@/lib/editor/factory';
import { calendarGrid, harmonyGradient, thaiMonthTitle } from '@/lib/editor/generators';
import { dominantColors } from '@/lib/editor/image-filters';
import { getImage, renderPageToCanvas } from '@/lib/editor/render';
import { canEditDoc, currentPage, useEditor, type EditorState } from '@/lib/editor/store';
import { newId, type CanvasElement, type ImageElement, type TextElement } from '@/lib/editor/types';
import { useEditorUi, type AnimateTab, type PanelKey, type VisionSim } from '@/lib/editor/ui-store';
import { zoomBy, zoomTo } from '@/lib/editor/viewport';
import { presentFromCurrent } from './presenter';
import { fitView } from './stage';
import { useTimerStore } from './timer';
import { printDesign } from './top-bar';

export type ToolGroup = 'แก้ไข' | 'จัดวาง' | 'ข้อความ' | 'รูปภาพ' | 'หน้า' | 'สร้าง' | 'สีและสไตล์' | 'แอนิเมชัน' | 'มุมมอง' | 'ตรวจงาน' | 'ส่งออก';

export const TOOL_GROUPS: ToolGroup[] = ['แก้ไข', 'จัดวาง', 'ข้อความ', 'รูปภาพ', 'หน้า', 'สร้าง', 'สีและสไตล์', 'แอนิเมชัน', 'มุมมอง', 'ตรวจงาน', 'ส่งออก'];

export interface ToolContext {
  state: EditorState;
  selected: CanvasElement[];
  /// ชิ้นที่เลือกและไม่ล็อก
  editable: CanvasElement[];
  texts: TextElement[];
  images: ImageElement[];
  canEdit: boolean;
}

export interface ToolDef {
  id: string;
  label: string;
  group: ToolGroup;
  icon: LucideIcon;
  keywords?: string;
  /// คีย์ลัด (รูปแบบเดียวกับตารางคีย์ลัด)
  keys?: string;
  /// แก้เนื้องาน (ลิงก์ดูอย่างเดียวใช้ไม่ได้)
  edits?: boolean;
  /// เหตุผลที่ยังใช้ไม่ได้ · null = ใช้ได้
  blocked?: (c: ToolContext) => string | null;
  run: (c: ToolContext) => void | Promise<void>;
}

export function toolContext(): ToolContext {
  const state = useEditor.getState();
  const selected = currentPage(state).elements.filter((el) => state.selection.includes(el.id));
  const editable = selected.filter((el) => !el.locked);

  return {
    state,
    selected,
    editable,
    texts: editable.filter((el): el is TextElement => el.type === 'text'),
    images: editable.filter((el): el is ImageElement => el.type === 'image'),
    canEdit: canEditDoc(state),
  };
}

const ed = () => useEditor.getState();
const ui = () => useEditorUi.getState();
const page = () => ({ width: ed().width, height: ed().height });
const ids = (els: CanvasElement[]) => els.map((el) => el.id);

const needSelection = (c: ToolContext) => (c.editable.length === 0 ? 'เลือกชิ้นงาน (ที่ไม่ล็อก) ก่อน' : null);
const needTwo = (c: ToolContext) => (c.editable.length < 2 ? 'เลือกอย่างน้อย 2 ชิ้น' : null);
const needThree = (c: ToolContext) => (c.editable.length < 3 ? 'เลือกอย่างน้อย 3 ชิ้น' : null);
const needText = (c: ToolContext) => (c.texts.length === 0 ? 'เลือกข้อความก่อน' : null);
const needImage = (c: ToolContext) => (c.images.length === 0 ? 'เลือกรูปก่อน' : null);
const needOneImage = (c: ToolContext) => (c.images.length !== 1 ? 'เลือกรูป 1 รูป' : null);

function panel(key: PanelKey) {
  return () => ui().setPanel(key);
}

function patchTexts(c: ToolContext, patch: (t: TextElement) => Partial<TextElement>, label: string) {
  ed().updateElements(ids(c.texts), (el) => patch(el as TextElement));
  notifyAction(label);
}

function addAndSelect(els: CanvasElement[], label: string) {
  ed().addElements(els);
  notifyAction(label);
}

function vision(sim: VisionSim | null, label: string): ToolDef {
  return {
    id: `vision-${sim ?? 'off'}`,
    label,
    group: 'ตรวจงาน',
    icon: sim ? ScanEye : Eye,
    keywords: 'ตาบอดสี color blind การเข้าถึง',
    run: () => {
      ui().set({ visionSim: sim });
      notifyAction(sim ? `${label} (เฉพาะบนจอ ไม่เปลี่ยนงาน)` : 'กลับเป็นสีปกติ');
    },
  };
}

function animateTab(tab: AnimateTab, label: string, icon: LucideIcon, keywords: string): ToolDef {
  return {
    id: `animate-${tab}`,
    label,
    group: 'แอนิเมชัน',
    icon,
    keywords,
    edits: true,
    run: () => {
      ui().set({ animateTab: tab });
      ui().setPanel('animate');
    },
  };
}

async function copyPageImage() {
  const s = ed();
  const canvas = await renderPageToCanvas(currentPage(s), { width: s.baseWidth, height: s.baseHeight }, 1);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

  if (!blob || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    notifyAction('เบราว์เซอร์นี้คัดลอกรูปไม่ได้ — ใช้ดาวน์โหลดแทน', null, true);
    return;
  }

  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  notifyAction('คัดลอกหน้านี้เป็นรูปแล้ว วางในแอปอื่นได้ทันที');
}

export const TOOLS: ToolDef[] = [
  // ── แก้ไข ──
  { id: 'undo', label: 'เลิกทำ', group: 'แก้ไข', icon: Undo2, keys: 'Mod+Z', edits: true, blocked: (c) => (c.state.past.length ? null : 'ยังไม่มีอะไรให้เลิกทำ'), run: () => ed().undo() },
  { id: 'redo', label: 'ทำซ้ำ', group: 'แก้ไข', icon: Redo2, keys: 'Mod+Shift+Z', edits: true, blocked: (c) => (c.state.future.length ? null : 'ยังไม่มีอะไรให้ทำซ้ำ'), run: () => ed().redo() },
  { id: 'copy', label: 'คัดลอก', group: 'แก้ไข', icon: Copy, keys: 'Mod+C', blocked: (c) => (c.selected.length ? null : 'เลือกชิ้นงานก่อน'), run: () => ed().copySelected() },
  { id: 'cut', label: 'ตัด', group: 'แก้ไข', icon: Scissors, keys: 'Mod+X', edits: true, blocked: needSelection, run: () => ed().cutSelected() },
  { id: 'paste', label: 'วาง', group: 'แก้ไข', icon: ClipboardPaste, keys: 'Mod+V', edits: true, blocked: (c) => (c.state.clipboard.length ? null : 'ยังไม่ได้คัดลอกชิ้นงาน'), run: () => ed().paste() },
  { id: 'paste-in-place', label: 'วางที่ตำแหน่งเดิม', group: 'แก้ไข', icon: ClipboardPaste, keys: 'Mod+Shift+V', edits: true, blocked: (c) => (c.state.clipboard.length ? null : 'ยังไม่ได้คัดลอกชิ้นงาน'), run: () => ed().pasteInPlace() },
  { id: 'duplicate', label: 'ทำสำเนา', group: 'แก้ไข', icon: Copy, keys: 'Mod+D', edits: true, blocked: (c) => (c.selected.length ? null : 'เลือกชิ้นงานก่อน'), run: () => ed().duplicateSelected() },
  { id: 'delete', label: 'ลบชิ้นที่เลือก', group: 'แก้ไข', icon: Trash2, keys: 'Delete', edits: true, blocked: needSelection, run: () => ed().removeSelected() },
  { id: 'select-all', label: 'เลือกทั้งหมดในหน้า', group: 'แก้ไข', icon: Square, keys: 'Mod+A', run: () => ed().select(currentPage(ed()).elements.filter((el) => !el.hidden).map((el) => el.id)) },
  { id: 'deselect', label: 'ยกเลิกการเลือก', group: 'แก้ไข', icon: Square, keys: 'Esc', blocked: (c) => (c.selected.length ? null : 'ยังไม่ได้เลือกอะไร'), run: () => ed().select([]) },
  { id: 'copy-style', label: 'คัดลอกสไตล์', group: 'แก้ไข', icon: Paintbrush, keys: 'Mod+Alt+C', edits: true, blocked: (c) => (c.selected.length === 1 ? null : 'เลือก 1 ชิ้นเป็นต้นแบบ'), run: () => { ed().copyStyle(); ui().setPainting(true); notifyAction('คลิกชิ้นที่จะวางสไตล์'); } },
  { id: 'paste-style', label: 'วางสไตล์', group: 'แก้ไข', icon: Paintbrush, keys: 'Mod+Alt+V', edits: true, blocked: (c) => (!c.state.styleClipboard ? 'ยังไม่ได้คัดลอกสไตล์' : needSelection(c)), run: (c) => ed().pasteStyle(ids(c.editable)) },
  { id: 'find', label: 'ค้นหาและแทนที่ข้อความ', group: 'แก้ไข', icon: FileSearch, keys: 'Mod+F', keywords: 'replace', edits: true, run: () => ui().set({ overlay: 'find' }) },
  { id: 'lock', label: 'ล็อก / ปลดล็อก', group: 'แก้ไข', icon: Lock, keys: 'Alt+Shift+L', edits: true, blocked: (c) => (c.selected.length ? null : 'เลือกชิ้นงานก่อน'), run: (c) => { const locked = c.selected.every((el) => el.locked); ed().updateElements(ids(c.selected), () => ({ locked: !locked })); notifyAction(locked ? 'ปลดล็อกแล้ว' : 'ล็อกแล้ว'); } },
  { id: 'hide', label: 'ซ่อนชิ้นที่เลือก', group: 'แก้ไข', icon: EyeOff, keywords: 'hidden มองไม่เห็น', edits: true, blocked: needSelection, run: (c) => { ed().updateElements(ids(c.editable), () => ({ hidden: true })); ed().select([]); notifyAction('ซ่อนแล้ว — แสดงกลับได้ที่แผงเลเยอร์'); } },
  { id: 'show-all', label: 'แสดงชิ้นที่ซ่อนทั้งหมดในหน้า', group: 'แก้ไข', icon: Eye, edits: true, blocked: (c) => (currentPage(c.state).elements.some((el) => el.hidden) ? null : 'หน้านี้ไม่มีชิ้นที่ซ่อน'), run: (c) => { const hidden = currentPage(c.state).elements.filter((el) => el.hidden); ed().updateElements(ids(hidden), () => ({ hidden: false })); notifyAction(`แสดง ${hidden.length} ชิ้น`); } },
  { id: 'group', label: 'จัดกลุ่ม', group: 'แก้ไข', icon: Group, keys: 'Mod+G', edits: true, blocked: needTwo, run: () => ed().groupSelected() },
  { id: 'ungroup', label: 'แยกกลุ่ม', group: 'แก้ไข', icon: Ungroup, keys: 'Mod+Shift+G', edits: true, blocked: (c) => (c.selected.some((el) => el.groupId) ? null : 'เลือกกลุ่มก่อน'), run: () => ed().ungroupSelected() },
  { id: 'save', label: 'บันทึกทันที', group: 'แก้ไข', icon: Save, keys: 'Mod+S', edits: true, run: () => void window.dispatchEvent(new Event('csc-save-now')) },
  { id: 'versions', label: 'ประวัติเวอร์ชัน', group: 'แก้ไข', icon: History, keywords: 'ย้อนเวอร์ชัน history', run: () => ui().set({ overlay: 'versions' }) },

  // ── จัดวาง ──
  { id: 'forward', label: 'ยกขึ้นหนึ่งชั้น', group: 'จัดวาง', icon: ArrowUp, keys: 'Mod+]', edits: true, blocked: needSelection, run: () => ed().reorderSelected('forward') },
  { id: 'backward', label: 'ส่งลงหนึ่งชั้น', group: 'จัดวาง', icon: ArrowDown, keys: 'Mod+[', edits: true, blocked: needSelection, run: () => ed().reorderSelected('backward') },
  { id: 'front', label: 'ยกขึ้นบนสุด', group: 'จัดวาง', icon: ArrowUpToLine, keys: 'Mod+Alt+]', edits: true, blocked: needSelection, run: () => ed().reorderSelected('front') },
  { id: 'back', label: 'ส่งลงล่างสุด', group: 'จัดวาง', icon: ArrowDownToLine, keys: 'Mod+Alt+[', edits: true, blocked: needSelection, run: () => ed().reorderSelected('back') },
  { id: 'align-left', label: 'จัดชิดซ้าย', group: 'จัดวาง', icon: AlignStartVertical, edits: true, blocked: needSelection, run: () => ed().alignSelected('left') },
  { id: 'align-center', label: 'จัดกึ่งกลางแนวนอน', group: 'จัดวาง', icon: AlignCenterVertical, edits: true, blocked: needSelection, run: () => ed().alignSelected('center') },
  { id: 'align-right', label: 'จัดชิดขวา', group: 'จัดวาง', icon: AlignEndVertical, edits: true, blocked: needSelection, run: () => ed().alignSelected('right') },
  { id: 'align-top', label: 'จัดชิดบน', group: 'จัดวาง', icon: AlignStartHorizontal, edits: true, blocked: needSelection, run: () => ed().alignSelected('top') },
  { id: 'align-middle', label: 'จัดกึ่งกลางแนวตั้ง', group: 'จัดวาง', icon: AlignCenterHorizontal, edits: true, blocked: needSelection, run: () => ed().alignSelected('middle') },
  { id: 'align-bottom', label: 'จัดชิดล่าง', group: 'จัดวาง', icon: AlignEndHorizontal, edits: true, blocked: needSelection, run: () => ed().alignSelected('bottom') },
  { id: 'distribute-h', label: 'กระจายระยะแนวนอน', group: 'จัดวาง', icon: AlignHorizontalDistributeCenter, edits: true, blocked: needThree, run: () => ed().distributeSelected('horizontal') },
  { id: 'distribute-v', label: 'กระจายระยะแนวตั้ง', group: 'จัดวาง', icon: AlignVerticalDistributeCenter, edits: true, blocked: needThree, run: () => ed().distributeSelected('vertical') },
  {
    id: 'tidy', label: 'จัดให้เป็นระเบียบ', group: 'จัดวาง', icon: LayoutGrid, keywords: 'tidy up ตาราง เรียง', edits: true, blocked: needTwo,
    run: (c) => { const pos = tidyUp(c.editable); ed().updateElements([...pos.keys()], (el) => pos.get(el.id)!); notifyAction(`จัด ${pos.size} ชิ้นเป็นระเบียบแล้ว`); },
  },
  {
    id: 'center-page', label: 'จัดไว้กลางหน้า', group: 'จัดวาง', icon: Move, edits: true, blocked: needSelection,
    run: (c) => { const { dx, dy } = centerOffset(c.editable, page()); ed().updateElements(ids(c.editable), (el) => ({ x: el.x + dx, y: el.y + dy })); notifyAction('จัดไว้กลางหน้าแล้ว'); },
  },
  { id: 'rotate-cw', label: 'หมุนขวา 90°', group: 'จัดวาง', icon: RotateCw, edits: true, blocked: needSelection, run: (c) => ed().updateElements(ids(c.editable), (el) => ({ rotation: (el.rotation + 90) % 360 })) },
  { id: 'rotate-ccw', label: 'หมุนซ้าย 90°', group: 'จัดวาง', icon: RotateCcw, edits: true, blocked: needSelection, run: (c) => ed().updateElements(ids(c.editable), (el) => ({ rotation: (el.rotation + 270) % 360 })) },
  { id: 'rotate-reset', label: 'ล้างการหมุน', group: 'จัดวาง', icon: RotateCcw, edits: true, blocked: needSelection, run: (c) => ed().updateElements(ids(c.editable), () => ({ rotation: 0 })) },
  { id: 'match-width', label: 'กว้างเท่าชิ้นแรก', group: 'จัดวาง', icon: Ratio, keywords: 'match size ขนาดเท่ากัน', edits: true, blocked: needTwo, run: (c) => { const w = c.editable[0].width; ed().updateElements(ids(c.editable.slice(1)), () => ({ width: w })); } },
  { id: 'match-height', label: 'สูงเท่าชิ้นแรก', group: 'จัดวาง', icon: Ratio, keywords: 'match size ขนาดเท่ากัน', edits: true, blocked: needTwo, run: (c) => { const h = c.editable[0].height; ed().updateElements(ids(c.editable.slice(1)), () => ({ height: h })); } },
  { id: 'fill-page', label: 'ขยายเต็มหน้า', group: 'จัดวาง', icon: Maximize, edits: true, blocked: needSelection, run: (c) => { const p = page(); ed().updateElements(ids(c.editable), () => ({ x: 0, y: 0, width: p.width, height: p.height, rotation: 0 })); } },
  { id: 'position-panel', label: 'แผงตำแหน่ง', group: 'จัดวาง', icon: Move, keys: 'Alt+1', edits: true, run: panel('position') },
  { id: 'layers', label: 'แผงเลเยอร์', group: 'จัดวาง', icon: Layers, keywords: 'layer ชั้น', run: panel('layers') },

  // ── ข้อความ ──
  { id: 'bold', label: 'ตัวหนา', group: 'ข้อความ', icon: Bold, keys: 'Mod+B', edits: true, blocked: needText, run: (c) => { const on = c.texts[0].fontWeight !== 700; patchTexts(c, () => ({ fontWeight: on ? 700 : 400 }), on ? 'ตัวหนา' : 'เลิกตัวหนา'); } },
  { id: 'italic', label: 'ตัวเอียง', group: 'ข้อความ', icon: Italic, keys: 'Mod+I', edits: true, blocked: needText, run: (c) => { const on = !c.texts[0].italic; patchTexts(c, () => ({ italic: on }), on ? 'ตัวเอียง' : 'เลิกตัวเอียง'); } },
  { id: 'underline', label: 'ขีดเส้นใต้', group: 'ข้อความ', icon: Underline, keys: 'Mod+U', edits: true, blocked: needText, run: (c) => { const on = !c.texts[0].underline; patchTexts(c, () => ({ underline: on }), on ? 'ขีดเส้นใต้' : 'เลิกขีดเส้นใต้'); } },
  { id: 'strike', label: 'ขีดฆ่า', group: 'ข้อความ', icon: Strikethrough, edits: true, blocked: needText, run: (c) => { const on = !c.texts[0].strike; patchTexts(c, () => ({ strike: on }), on ? 'ขีดฆ่า' : 'เลิกขีดฆ่า'); } },
  { id: 'uppercase', label: 'ตัวพิมพ์ใหญ่ทั้งหมด', group: 'ข้อความ', icon: CaseUpper, keys: 'Mod+Shift+K', edits: true, blocked: needText, run: (c) => { const on = !c.texts[0].uppercase; patchTexts(c, () => ({ uppercase: on }), on ? 'ตัวพิมพ์ใหญ่' : 'เลิกตัวพิมพ์ใหญ่'); } },
  { id: 'text-left', label: 'ข้อความชิดซ้าย', group: 'ข้อความ', icon: AlignLeft, keys: 'Mod+Shift+L', edits: true, blocked: needText, run: (c) => patchTexts(c, () => ({ align: 'left' }), 'จัดชิดซ้าย') },
  { id: 'text-center', label: 'ข้อความกึ่งกลาง', group: 'ข้อความ', icon: AlignCenter, keys: 'Mod+Shift+E', edits: true, blocked: needText, run: (c) => patchTexts(c, () => ({ align: 'center' }), 'จัดกึ่งกลาง') },
  { id: 'text-right', label: 'ข้อความชิดขวา', group: 'ข้อความ', icon: AlignRight, keys: 'Mod+Shift+R', edits: true, blocked: needText, run: (c) => patchTexts(c, () => ({ align: 'right' }), 'จัดชิดขวา') },
  { id: 'text-justify', label: 'ข้อความเต็มบรรทัด', group: 'ข้อความ', icon: AlignJustify, keys: 'Mod+Shift+J', edits: true, blocked: needText, run: (c) => patchTexts(c, () => ({ align: 'justify' }), 'จัดเต็มบรรทัด') },
  { id: 'text-bigger', label: 'ขยายตัวอักษร', group: 'ข้อความ', icon: Plus, keys: 'Mod+Shift+.', edits: true, blocked: needText, run: (c) => patchTexts(c, (t) => ({ fontSize: Math.round(t.fontSize * 1.1 + 1) }), 'ขยายตัวอักษร') },
  { id: 'text-smaller', label: 'ลดขนาดตัวอักษร', group: 'ข้อความ', icon: Minus, keys: 'Mod+Shift+,', edits: true, blocked: needText, run: (c) => patchTexts(c, (t) => ({ fontSize: Math.max(6, Math.round(t.fontSize / 1.1 - 1)) }), 'ลดขนาดตัวอักษร') },
  { id: 'bullets', label: 'รายการหัวข้อย่อย', group: 'ข้อความ', icon: List, keywords: 'bullet', edits: true, blocked: needText, run: (c) => { const on = c.texts[0].list !== 'bullet'; patchTexts(c, () => ({ list: on ? 'bullet' : 'none' }), on ? 'ใส่หัวข้อย่อย' : 'เลิกหัวข้อย่อย'); } },
  { id: 'numbers', label: 'รายการตัวเลข', group: 'ข้อความ', icon: ListOrdered, edits: true, blocked: needText, run: (c) => { const on = c.texts[0].list !== 'number'; patchTexts(c, () => ({ list: on ? 'number' : 'none' }), on ? 'ใส่ตัวเลขลำดับ' : 'เลิกตัวเลขลำดับ'); } },
  { id: 'curve', label: 'ข้อความโค้ง', group: 'ข้อความ', icon: Spline, keywords: 'curve', edits: true, blocked: needText, run: (c) => { const on = !c.texts[0].curve; patchTexts(c, () => ({ curve: on ? 50 : 0 }), on ? 'ทำข้อความโค้ง (ปรับต่อได้ในแผงเอฟเฟกต์)' : 'เลิกข้อความโค้ง'); } },
  { id: 'clean-spaces', label: 'ลบช่องว่างซ้ำ', group: 'ข้อความ', icon: Eraser, keywords: 'whitespace', edits: true, blocked: needText, run: (c) => patchTexts(c, (t) => ({ text: cleanSpaces(t.text) }), 'ลบช่องว่างซ้ำแล้ว') },
  {
    id: 'word-count', label: 'นับคำและตัวอักษร', group: 'ข้อความ', icon: Hash, keywords: 'word count',
    run: (c) => {
      const source = c.selected.filter((el): el is TextElement => el.type === 'text');
      const texts = (source.length ? source : c.state.doc.pages.flatMap((p) => p.elements.filter((el): el is TextElement => el.type === 'text'))).map((t) => t.text);
      const s = textStats(texts);

      notifyAction(`${source.length ? 'ที่เลือก' : 'ทั้งงาน'}: ${s.words.toLocaleString('th-TH')} คำ · ${s.chars.toLocaleString('th-TH')} ตัวอักษร`);
    },
  },
  { id: 'add-heading', label: 'เพิ่มหัวข้อ', group: 'ข้อความ', icon: Heading, keys: 'T', edits: true, run: () => addAndSelect([createText(page(), 'heading')], 'เพิ่มหัวข้อ') },
  { id: 'add-subheading', label: 'เพิ่มหัวข้อย่อย', group: 'ข้อความ', icon: Type, edits: true, run: () => addAndSelect([createText(page(), 'subheading')], 'เพิ่มหัวข้อย่อย') },
  { id: 'add-body', label: 'เพิ่มเนื้อความ', group: 'ข้อความ', icon: Text, edits: true, run: () => addAndSelect([createText(page(), 'body')], 'เพิ่มเนื้อความ') },
  { id: 'font-panel', label: 'แผงฟอนต์', group: 'ข้อความ', icon: Type, edits: true, blocked: needText, run: panel('font') },
  { id: 'effects-panel', label: 'เอฟเฟกต์ข้อความและเงา', group: 'ข้อความ', icon: Sparkles, edits: true, blocked: needSelection, run: panel('effects') },

  // ── รูปภาพ ──
  { id: 'flip-h', label: 'พลิกแนวนอน', group: 'รูปภาพ', icon: FlipHorizontal2, edits: true, blocked: needImage, run: (c) => ed().updateElements(ids(c.images), (el) => ({ flipX: !(el as ImageElement).flipX })) },
  { id: 'flip-v', label: 'พลิกแนวตั้ง', group: 'รูปภาพ', icon: FlipVertical2, edits: true, blocked: needImage, run: (c) => ed().updateElements(ids(c.images), (el) => ({ flipY: !(el as ImageElement).flipY })) },
  { id: 'crop', label: 'ครอปภาพ', group: 'รูปภาพ', icon: Crop, edits: true, blocked: needOneImage, run: panel('crop') },
  { id: 'magic-layers', label: 'แยกเลเยอร์ (Magic Layers)', group: 'รูปภาพ', icon: WandSparkles, keywords: 'magic layers grab text แยกวัตถุ ข้อความในรูป ย้ายวัตถุ', edits: true, blocked: needOneImage, run: panel('magic-layers') },
  { id: 'bg-remove', label: 'ลบพื้นหลัง', group: 'รูปภาพ', icon: WandSparkles, keywords: 'background remove ตัดวัตถุ แยกวัตถุ อัจฉริยะ cutout', edits: true, blocked: needOneImage, run: panel('bg-remove') },
  { id: 'image-edit', label: 'แก้ไขรูป (ฟิลเตอร์ ปรับแสง)', group: 'รูปภาพ', icon: ImageIcon, keywords: 'filter adjust photoshop', edits: true, blocked: needOneImage, run: panel('image-edit') },
  { id: 'replace-image', label: 'แทนที่รูป', group: 'รูปภาพ', icon: Replace, edits: true, blocked: needOneImage, run: panel('replace') },
  {
    id: 'image-reset', label: 'ล้างการแก้ไขรูป', group: 'รูปภาพ', icon: RotateCcw, edits: true, blocked: needImage,
    run: (c) => { ed().updateElements(ids(c.images), () => ({ adjust: null, filter: null, crop: null, erase: [], layerStyle: null } as Partial<CanvasElement>)); notifyAction('ล้างการแก้ไขรูปแล้ว'); },
  },
  {
    id: 'image-background', label: 'ตั้งรูปเป็นพื้นหลังหน้า', group: 'รูปภาพ', icon: Wallpaper, edits: true, blocked: needOneImage,
    run: (c) => {
      const img = c.images[0];
      const p = page();
      const scale = Math.max(p.width / img.width, p.height / img.height);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const s = ed();

      s.beginGesture();
      s.updateElements([img.id], () => ({ x: Math.round((p.width - w) / 2), y: Math.round((p.height - h) / 2), width: w, height: h, rotation: 0, locked: true }));
      s.moveLayer(img.id, 0);
      s.select([]);
      s.endGesture();
      notifyAction('ตั้งเป็นพื้นหลังแล้ว (ล็อกไว้ ปลดล็อกได้ที่แผงเลเยอร์)');
    },
  },
  {
    id: 'image-palette', label: 'ดึงชุดสีจากรูป', group: 'รูปภาพ', icon: Droplet, keywords: 'palette สีเด่น', edits: true, blocked: needOneImage,
    run: (c) => {
      const img = c.images[0];
      const source = getImage(img.src);

      if (!source) return notifyAction('รูปยังโหลดไม่เสร็จ ลองอีกครั้ง', null, true);

      const colors = dominantColors(source, 5);
      const d = Math.round(Math.max(24, img.height * 0.14));
      const group = newId('group');

      addAndSelect(colors.map((fill, i) => ({ ...createShape(page(), 'ellipse'), name: `สี ${fill}`, x: Math.round(img.x + i * d * 1.2), y: Math.round(img.y + img.height + d * 0.4), width: d, height: d, fill, stroke: null, groupId: group })), `ดึง ${colors.length} สีจากรูปแล้ว`);
    },
  },

  // ── หน้า ──
  { id: 'add-page', label: 'เพิ่มหน้า', group: 'หน้า', icon: Plus, keys: 'Mod+Enter', edits: true, run: () => ed().addPage() },
  { id: 'duplicate-page', label: 'ทำสำเนาหน้านี้', group: 'หน้า', icon: Copy, edits: true, run: (c) => ed().duplicatePage(c.state.pageIndex) },
  { id: 'delete-page', label: 'ลบหน้านี้', group: 'หน้า', icon: Trash2, keys: 'Mod+Backspace', edits: true, blocked: (c) => (c.state.doc.pages.length > 1 ? null : 'ต้องมีอย่างน้อย 1 หน้า'), run: (c) => { if (window.confirm(`ลบหน้า ${c.state.pageIndex + 1}? (Ctrl+Z ย้อนได้)`)) ed().deletePage(c.state.pageIndex); } },
  { id: 'hide-page', label: 'ซ่อน / แสดงหน้านี้ตอนพรีเซนต์', group: 'หน้า', icon: EyeOff, edits: true, run: (c) => { const hidden = !currentPage(c.state).hidden; ed().updatePage(c.state.pageIndex, { hidden }); notifyAction(hidden ? 'ซ่อนหน้านี้แล้ว' : 'แสดงหน้านี้แล้ว'); } },
  { id: 'lock-page', label: 'ล็อก / ปลดล็อกหน้านี้', group: 'หน้า', icon: Lock, edits: true, run: (c) => { const locked = !currentPage(c.state).locked; ed().updatePage(c.state.pageIndex, { locked }); notifyAction(locked ? 'ล็อกหน้านี้แล้ว' : 'ปลดล็อกหน้านี้แล้ว'); } },
  { id: 'resize', label: 'ปรับขนาดงาน', group: 'หน้า', icon: Scaling, keywords: 'resize magic', edits: true, run: () => ui().set({ overlay: 'resize' }) },
  { id: 'notes', label: 'สมุดโน้ตผู้พรีเซนต์', group: 'หน้า', icon: StickyNote, run: panel('notes') },
  { id: 'pages-grid', label: 'มุมมองตารางหน้า', group: 'หน้า', icon: Grid2x2, run: () => ui().setPagesView(ui().pagesView === 'grid' ? 'strip' : 'grid') },
  { id: 'next-page', label: 'หน้าถัดไป', group: 'หน้า', icon: ChevronRight, keys: 'PageDown', blocked: (c) => (c.state.pageIndex < c.state.doc.pages.length - 1 ? null : 'อยู่หน้าสุดท้ายแล้ว'), run: (c) => ed().setPageIndex(c.state.pageIndex + 1) },
  { id: 'prev-page', label: 'หน้าก่อนหน้า', group: 'หน้า', icon: ChevronLeft, keys: 'PageUp', blocked: (c) => (c.state.pageIndex > 0 ? null : 'อยู่หน้าแรกแล้ว'), run: (c) => ed().setPageIndex(c.state.pageIndex - 1) },
  { id: 'page-background', label: 'สีพื้นหลังหน้า', group: 'หน้า', icon: Palette, edits: true, run: () => ui().openColor('background') },
  { id: 'background-panel', label: 'แผงแบ็กกราวด์', group: 'หน้า', icon: Wallpaper, edits: true, run: panel('background') },

  // ── สร้าง ──
  { id: 'add-rect', label: 'สี่เหลี่ยม', group: 'สร้าง', icon: Square, keys: 'R', edits: true, run: () => addAndSelect([createShape(page(), 'rect')], 'เพิ่มสี่เหลี่ยม') },
  { id: 'add-ellipse', label: 'วงกลม', group: 'สร้าง', icon: Circle, keys: 'O', edits: true, run: () => addAndSelect([createShape(page(), 'ellipse')], 'เพิ่มวงกลม') },
  { id: 'add-triangle', label: 'สามเหลี่ยม', group: 'สร้าง', icon: Triangle, edits: true, run: () => addAndSelect([createShape(page(), 'triangle')], 'เพิ่มสามเหลี่ยม') },
  { id: 'add-star', label: 'ดาว', group: 'สร้าง', icon: Star, edits: true, run: () => addAndSelect([createShape(page(), 'star')], 'เพิ่มดาว') },
  { id: 'add-line', label: 'เส้นตรง', group: 'สร้าง', icon: Minus, keys: 'L', edits: true, run: () => addAndSelect([createShape(page(), 'line')], 'เพิ่มเส้น') },
  { id: 'add-arrow', label: 'ลูกศร', group: 'สร้าง', icon: ArrowRight, edits: true, run: () => addAndSelect([createShape(page(), 'arrow')], 'เพิ่มลูกศร') },
  { id: 'add-sticky', label: 'โน้ตแปะ', group: 'สร้าง', icon: StickyNote, keywords: 'sticky', edits: true, run: () => addAndSelect(createSticky(page(), 'yellow'), 'เพิ่มโน้ตแปะ') },
  { id: 'add-table', label: 'ตาราง 3×3', group: 'สร้าง', icon: Table2, edits: true, run: () => addAndSelect([createTable(page(), 3, 3)], 'เพิ่มตาราง') },
  { id: 'add-chart', label: 'แผนภูมิแท่ง', group: 'สร้าง', icon: BarChart3, keywords: 'chart กราฟ', edits: true, run: () => addAndSelect([createChart(page(), 'column')], 'เพิ่มแผนภูมิ (แก้ข้อมูลได้ที่แผงข้อมูลชาร์ต)') },
  { id: 'add-frame', label: 'กรอบรูปวงกลม', group: 'สร้าง', icon: Frame, edits: true, run: () => addAndSelect([createFrame(page(), 'circle')], 'เพิ่มกรอบรูป (ลากรูปมาวางในกรอบ)') },
  { id: 'add-grid', label: 'กริดรูป 2×2', group: 'สร้าง', icon: Grid2x2, edits: true, run: () => addAndSelect([createGrid(page(), 'grid-2x2')], 'เพิ่มกริดรูป') },
  { id: 'qr', label: 'QR Code', group: 'สร้าง', icon: QrCode, keywords: 'คิวอาร์ ลิงก์ wifi', edits: true, run: panel('qr') },
  {
    id: 'calendar', label: 'ปฏิทินเดือนนี้', group: 'สร้าง', icon: CalendarDays, keywords: 'calendar', edits: true,
    run: () => {
      const now = new Date();
      const grid = calendarGrid(now.getFullYear(), now.getMonth(), false);
      const t = createTable(page(), grid.length, 7);

      addAndSelect([{ ...t, name: `ปฏิทิน ${thaiMonthTitle(now.getFullYear(), now.getMonth())}`, align: 'center', cells: t.cells.map((row, r) => row.map((cell, i) => ({ ...cell, text: grid[r]?.[i] ?? '' }))) }], `ใส่ปฏิทิน${thaiMonthTitle(now.getFullYear(), now.getMonth())} (เดือนอื่นที่แผงตัวสร้าง)`);
    },
  },
  { id: 'generators', label: 'ตัวสร้างลวดลาย ชุดสี ไล่สี ปฏิทิน', group: 'สร้าง', icon: Shapes, keywords: 'pattern palette gradient', edits: true, run: panel('generators') },
  { id: 'signature', label: 'ลายเซ็น', group: 'สร้าง', icon: Signature, edits: true, run: panel('signature') },
  { id: 'draw', label: 'ปากกาวาด', group: 'สร้าง', icon: PenLine, keys: 'D', edits: true, run: () => ed().setTool({ mode: 'draw', brush: 'pen' }) },
  { id: 'elements', label: 'คลังองค์ประกอบ (กราฟิก ไอคอน ภาพ)', group: 'สร้าง', icon: Shapes, run: panel('elements') },
  { id: 'uploads', label: 'อัปโหลดรูป วิดีโอ เสียง', group: 'สร้าง', icon: Film, run: panel('uploads') },
  { id: 'timer', label: 'นาฬิกาจับเวลา', group: 'สร้าง', icon: Timer, keywords: 'timer', run: () => useTimerStore.getState().show() },

  // ── สีและสไตล์ ──
  { id: 'styles', label: 'สไตล์ทั้งงาน (สี + ฟอนต์)', group: 'สีและสไตล์', icon: Palette, keywords: 'theme ธีม', edits: true, run: panel('styles') },
  { id: 'brand', label: 'ชุดแบรนด์', group: 'สีและสไตล์', icon: Blend, keywords: 'brand kit โลโก้', run: panel('brand') },
  {
    id: 'random-style', label: 'สุ่มสไตล์ทั้งงาน', group: 'สีและสไตล์', icon: Shuffle, edits: true,
    run: (c) => {
      const style = DESIGN_STYLES[Math.floor(Math.random() * DESIGN_STYLES.length)];
      const size = { width: c.state.baseWidth, height: c.state.baseHeight };

      ed().updateDocument(applyStyleFonts(recolorDocument(c.state.doc, paletteMapping(c.state.doc, style.colors, size), size), style.heading, style.body));
      notifyAction(`ใช้สไตล์ “${style.name}” (Ctrl+Z ย้อนได้)`);
    },
  },
  {
    id: 'gradient-bg', label: 'พื้นหลังไล่สีอัตโนมัติ', group: 'สีและสไตล์', icon: Contrast, edits: true,
    run: (c) => {
      const base = c.editable.find((el) => el.type === 'shape')?.fill ?? 'rgb(0 76 153)';

      ed().setBackground(harmonyGradient(base.startsWith('rgb') ? base : 'rgb(0 76 153)', 50, 135));
      notifyAction('ใส่พื้นหลังไล่สีแล้ว (ปรับต่อได้ที่ตัวสร้าง → ไล่สี)');
    },
  },
  { id: 'color-panel', label: 'แผงสี', group: 'สีและสไตล์', icon: Palette, edits: true, blocked: needSelection, run: () => ui().openColor('fill') },

  // ── แอนิเมชัน ──
  animateTab('entry', 'แอนิเมชันตอนเข้า', Sparkles, 'animate animation'),
  animateTab('emphasis', 'แอนิเมชันเน้น (วน)', Sparkles, 'emphasis loop'),
  animateTab('exit', 'แอนิเมชันตอนออก', Sparkles, 'exit'),
  animateTab('path', 'เส้นทางเคลื่อนที่', Spline, 'motion path'),
  animateTab('page', 'การเปลี่ยนหน้า', Film, 'transition'),
  { id: 'present', label: 'พรีเซนต์จากหน้านี้', group: 'แอนิเมชัน', icon: Play, keys: 'Mod+Alt+P', run: () => presentFromCurrent() },

  // ── มุมมอง ──
  { id: 'zoom-in', label: 'ซูมเข้า', group: 'มุมมอง', icon: ZoomIn, keys: 'Mod+=', run: () => zoomBy(1.2) },
  { id: 'zoom-out', label: 'ซูมออก', group: 'มุมมอง', icon: ZoomOut, keys: 'Mod+-', run: () => zoomBy(1 / 1.2) },
  { id: 'zoom-100', label: 'ขนาดจริง 100%', group: 'มุมมอง', icon: Gauge, keys: 'Mod+0', run: () => zoomTo(1) },
  { id: 'zoom-fit', label: 'พอดีจอ', group: 'มุมมอง', icon: Maximize, keys: 'Shift+1', run: () => fitView() },
  { id: 'rulers', label: 'ไม้บรรทัดและเส้นไกด์', group: 'มุมมอง', icon: Ruler, keys: 'Shift+R', run: () => ui().toggleRulers() },
  { id: 'clear-guides', label: 'ลบเส้นไกด์ทั้งหมด', group: 'มุมมอง', icon: Eraser, blocked: () => (ui().guideLines.length ? null : 'ยังไม่มีเส้นไกด์'), run: () => useEditorUi.setState({ guideLines: [] }) },
  { id: 'margins', label: 'แสดงขอบหน้ากระดาษ', group: 'มุมมอง', icon: Square, run: () => ui().set({ margins: !ui().margins }) },
  { id: 'bleed', label: 'แสดงระยะตัดตก (งานพิมพ์)', group: 'มุมมอง', icon: Square, run: () => ui().set({ bleed: !ui().bleed }) },
  { id: 'gif-play', label: 'เล่น / หยุด GIF ขณะแก้ไข', group: 'มุมมอง', icon: Film, run: () => { const on = !ui().gifPlaying; ui().set({ gifPlaying: on }); notifyAction(on ? 'เล่น GIF' : 'หยุด GIF (แสดงเฟรมแรก)'); } },
  { id: 'shortcuts', label: 'คีย์ลัดทั้งหมด', group: 'มุมมอง', icon: Keyboard, keys: 'Mod+/', run: () => ui().set({ overlay: 'shortcuts' }) },

  // ── ตรวจงาน ──
  { id: 'accessibility', label: 'ตรวจการเข้าถึง (สี ข้อความ)', group: 'ตรวจงาน', icon: Accessibility, keywords: 'contrast a11y', run: () => ui().set({ overlay: 'accessibility' }) },
  { id: 'analytics', label: 'สถิติการเปิดดู', group: 'ตรวจงาน', icon: BarChart3, run: () => ui().set({ overlay: 'analytics' }) },
  vision('protanopia', 'จำลองตาบอดสีแดง'),
  vision('deuteranopia', 'จำลองตาบอดสีเขียว'),
  vision('tritanopia', 'จำลองตาบอดสีน้ำเงิน'),
  vision('achromatopsia', 'จำลองมองเห็นแบบขาวดำ'),
  vision(null, 'เลิกจำลองการมองเห็นสี'),

  // ── ส่งออก ──
  { id: 'download', label: 'ดาวน์โหลด (PNG JPG PDF SVG GIF วิดีโอ)', group: 'ส่งออก', icon: Download, run: () => void window.dispatchEvent(new CustomEvent('csc-open-download')) },
  { id: 'print', label: 'พิมพ์', group: 'ส่งออก', icon: Printer, keys: 'Mod+P', run: () => void printDesign() },
  { id: 'copy-image', label: 'คัดลอกหน้านี้เป็นรูป', group: 'ส่งออก', icon: ClipboardCopy, keywords: 'clipboard png', run: () => copyPageImage() },
  { id: 'export-json', label: 'ดู JSON state ของงาน (สำหรับ CMS)', group: 'ส่งออก', icon: FileText, keywords: 'cms json api', run: (c) => { void navigator.clipboard?.writeText(JSON.stringify(c.state.doc)).then(() => notifyAction('คัดลอก JSON state แล้ว')).catch(() => notifyAction('คัดลอกไม่ได้', null, true)); } },
];

/// ค้นหาเครื่องมือจากชื่อ คำค้น หมวด และคีย์ลัด
export function searchTools(query: string, tools: ToolDef[] = TOOLS): ToolDef[] {
  const q = query.trim().toLowerCase();

  if (!q) return tools;

  const words = q.split(/\s+/);

  return tools.filter((t) => {
    const hay = `${t.label} ${t.group} ${t.keywords ?? ''} ${t.keys ?? ''} ${t.id}`.toLowerCase();

    return words.every((w) => hay.includes(w));
  });
}

/// เหตุผลที่ใช้ไม่ได้ (รวมสิทธิ์แก้ไข)
export function blockedReason(tool: ToolDef, c: ToolContext): string | null {
  if (tool.edits && !c.canEdit) return 'เปิดแบบดูอย่างเดียว';

  return tool.blocked?.(c) ?? null;
}
