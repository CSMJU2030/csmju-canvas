import { create } from 'zustand';

/// สถานะหน้าจอของหน้าแก้ไขที่ไม่ใช่เนื้องาน (แผงที่เปิด เมนูคลิกขวา ตัวอย่างแอนิเมชัน)
///
/// แยกจาก store ของงานเพื่อไม่ให้การเปิด/ปิดแผงไปอยู่ในประวัติ undo หรือทำให้บันทึกอัตโนมัติ

export type RailPanel = 'templates' | 'elements' | 'text' | 'uploads' | 'projects' | 'starred' | 'background';
export type ContextPanel = 'position' | 'color' | 'effects' | 'animate' | 'font' | 'image-edit' | 'crop' | 'replace' | 'chart-data' | 'bg-remove';
export type UtilityPanel = 'signature' | 'layers' | 'pages' | 'notes';
export type PanelKey = RailPanel | ContextPanel | UtilityPanel;

/// สีที่แผง "สี" จะเปลี่ยน
export type ColorTarget = 'text' | 'fill' | 'stroke' | 'icon' | 'path' | 'background' | 'border' | 'effect' | 'shadow';

export interface ContextMenuState {
  x: number;
  y: number;
  /// เปิดจากปุ่ม … ของภาพย่อหน้า
  pageIndex?: number;
}

interface EditorUi {
  panel: PanelKey | null;
  toolsOpen: boolean;
  colorTarget: ColorTarget;
  contextMenu: ContextMenuState | null;
  /// ตัวอย่างแอนิเมชันในผืนผ้าใบ: id ที่กำลังเล่นและเวลาเริ่ม
  preview: { ids: string[]; start: number } | null;
  /// โหมดคัดลอกสไตล์ (คลิกชิ้นงานถัดไปเพื่อวางสไตล์)
  painting: boolean;
  /// มุมมองหน้า: แบบภาพย่อด้านล่าง หรือแบบตารางเต็มจอ
  pagesView: 'strip' | 'grid';
  rulers: boolean;
  /// เส้นไกด์ที่ลากออกจากไม้บรรทัด (พิกัดหน้า) — ไม่บันทึกลงงาน
  guideLines: { axis: 'x' | 'y'; at: number }[];
  margins: boolean;
  bleed: boolean;
  commentsOpen: boolean;
  commentPins: boolean;
  /// แถบภาพย่อหน้าด้านล่าง
  stripOpen: boolean;
  /// หน้าต่าง/มุมมองเต็มจอที่เปิดอยู่
  overlay: 'versions' | 'find' | 'accessibility' | 'analytics' | 'resize' | 'move' | null;
  /// โหมดยางลบพิกเซลของรูป · size = เส้นผ่านศูนย์กลางแปรงเป็นพิกเซลของหน้า
  imageErase: { id: string; size: number } | null;
  /// ช่องของกรอบ/กริดที่เลือกอยู่ (กรอบมีช่องเดียว = 0) — ปุ่มแทนที่/ลบรูป และการเลือกรูปจากแผงอัปโหลดทำกับช่องนี้
  frameCell: { id: string; cell: number } | null;
  /// โหมดจัดตำแหน่งรูปในกรอบ/ช่อง (ดับเบิลคลิก): ลากเพื่อเลื่อน ล้อเมาส์/สไลเดอร์เพื่อซูม · Enter/Esc = เสร็จ
  frameEdit: { id: string; cell: number } | null;

  setPanel(panel: PanelKey | null): void;
  togglePanel(panel: PanelKey): void;
  openColor(target: ColorTarget): void;
  setToolsOpen(open: boolean): void;
  openContextMenu(menu: ContextMenuState | null): void;
  playPreview(ids: string[]): void;
  setPainting(painting: boolean): void;
  setPagesView(view: 'strip' | 'grid'): void;
  toggleRulers(): void;
  addGuide(guide: { axis: 'x' | 'y'; at: number }): void;
  moveGuide(index: number, at: number | null): void;
  set(patch: Partial<Pick<EditorUi, 'margins' | 'bleed' | 'commentsOpen' | 'commentPins' | 'overlay' | 'stripOpen' | 'imageErase' | 'frameCell' | 'frameEdit'>>): void;
}

export const useEditorUi = create<EditorUi>((set, get) => ({
  panel: null,
  toolsOpen: false,
  colorTarget: 'fill',
  contextMenu: null,
  preview: null,
  painting: false,
  pagesView: 'strip',
  rulers: false,
  guideLines: [],
  margins: false,
  bleed: false,
  commentsOpen: false,
  commentPins: true,
  stripOpen: true,
  overlay: null,
  imageErase: null,
  frameCell: null,
  frameEdit: null,

  setPanel(panel) {
    set({ panel, toolsOpen: false });
  },
  togglePanel(panel) {
    set({ panel: get().panel === panel ? null : panel, toolsOpen: false });
  },
  openColor(target) {
    set({ panel: 'color', colorTarget: target, toolsOpen: false });
  },
  setToolsOpen(open) {
    set(open ? { toolsOpen: true, panel: null } : { toolsOpen: false });
  },
  openContextMenu(menu) {
    set({ contextMenu: menu });
  },
  playPreview(ids) {
    set({ preview: { ids, start: performance.now() } });
  },
  setPainting(painting) {
    set({ painting });
  },
  setPagesView(view) {
    set({ pagesView: view });
  },
  toggleRulers() {
    set({ rulers: !get().rulers });
  },
  addGuide(guide) {
    set({ guideLines: [...get().guideLines, guide] });
  },
  moveGuide(index, at) {
    set({ guideLines: at === null ? get().guideLines.filter((_, i) => i !== index) : get().guideLines.map((g, i) => (i === index ? { ...g, at } : g)) });
  },
  set(patch) {
    set(patch);
  },
}));

/// ระยะเวลาตัวอย่างแอนิเมชัน (มิลลิวินาที)
export const PREVIEW_MS = 900;
