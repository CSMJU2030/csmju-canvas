import { create } from 'zustand';
import { fitTemplate } from './fit-template';
import { boundingBox, unionBox, type Rect } from './geometry';
import { measureTextHeight } from './render';
import type { Guide } from './snapping';
import {
  blankPage,
  newId,
  pageSizeOf,
  type BrushKind,
  type CanvasElement,
  type DesignDocument,
  type Page,
} from './types';

export type DrawBrush = BrushKind | 'eraser';

/// โหมดของผืนผ้าใบ: เลือก/ลากชิ้นงาน หรือวาดด้วยมือ (แผง "เครื่องมือ")
/// ค่าสีและน้ำหนักแยกตามหัวปากกา (ปากกา มาร์กเกอร์ ไฮไลท์ ไม่ใช้สีร่วมกัน)
export interface DrawTool {
  mode: 'select' | 'draw';
  brush: DrawBrush;
  colors: Record<BrushKind, string>;
  /// 1–100 ตามแถบ "น้ำหนัก" · แปลงเป็นพิกเซลด้วย brushWidth()
  weights: Record<DrawBrush, number>;
}

export const DEFAULT_DRAW_TOOL: DrawTool = {
  mode: 'select',
  brush: 'pen',
  colors: { pen: 'rgb(1 24 78)', marker: 'rgb(34 34 34)', highlighter: 'rgb(255 240 50)' },
  weights: { pen: 4, marker: 12, highlighter: 60, eraser: 30 },
};

/// ความหนาจริง (พิกเซลของหน้า) จากค่าน้ำหนัก — เทียบกับด้านยาวของหน้า ให้หน้าใหญ่/เล็กดูหนาเท่ากันบนจอ
export function brushWidth(weight: number, page: { width: number; height: number }): number {
  return Math.max(1, (weight * Math.max(page.width, page.height)) / 2500);
}

const HISTORY_LIMIT = 100;

export interface EditorMeta {
  designId: string;
  title: string;
  designType: string;
  /// สิทธิ์ของผู้เปิด: OWNER · EDIT (ลิงก์แก้ไขได้) · VIEW (ลิงก์ดูได้ = ห้ามแก้ทุกอย่าง)
  access: 'OWNER' | 'EDIT' | 'COMMENT' | 'VIEW';
  linkAccess: 'NONE' | 'VIEW' | 'COMMENT' | 'EDIT';
  width: number;
  height: number;
}

export interface EditorState extends EditorMeta {
  /// ขนาดของงาน (ที่บันทึกลงหลังบ้าน) · `width`/`height` คือขนาดของหน้าที่เปิดอยู่
  baseWidth: number;
  baseHeight: number;
  doc: DesignDocument;
  pageIndex: number;
  selection: string[];
  editingTextId: string | null;
  guides: Guide[];
  past: DesignDocument[];
  future: DesignDocument[];
  /// เพิ่มทุกครั้งที่ doc เปลี่ยน — ตัวบันทึกอัตโนมัติดูค่านี้
  revision: number;
  zoom: number;
  pan: { x: number; y: number };
  /// สำเนาที่คัดลอกไว้ (ภายในแท็บเดียว ไม่ใช้คลิปบอร์ดของระบบ)
  clipboard: CanvasElement[];
  /// เครื่องมือวาด (ไม่อยู่ในประวัติ undo และไม่บันทึกลงงาน)
  tool: DrawTool;
  /// สไตล์ที่คัดลอกไว้ (ปุ่มคัดลอกสไตล์ / Ctrl+Alt+C)
  styleClipboard: StyleSnapshot | null;
  /// โหมดที่ผู้ใช้เลือก (ปุ่ม "การแก้ไข ⌄"): แก้ไข · แสดงความคิดเห็น · ดู
  viewMode: 'edit' | 'comment' | 'view';
  setViewMode(mode: 'edit' | 'comment' | 'view'): void;
  /// หน้าที่คัดลอกไว้ (เมนู … ของภาพย่อหน้า)
  pageClipboard: Page | null;

  load(meta: EditorMeta, doc: DesignDocument): void;
  setTitle(title: string): void;
  /// เปลี่ยนขนาดทั้งงาน (หน้าที่มีขนาดของตัวเองไม่เปลี่ยน)
  resize(width: number, height: number): void;
  /// ปรับขนาดงาน (เมนู "ปรับขนาด") · scaleContent = ย่อ/ขยายชิ้นงานทุกหน้าให้พอดีขนาดใหม่ (ย้อนกลับได้)
  resizeDesign(width: number, height: number, scaleContent: boolean): void;
  /// ขนาดเฉพาะหน้า · null = กลับไปใช้ขนาดของงาน
  resizePage(index: number, size: { width: number; height: number } | null): void;
  /// เพิ่มหน้าว่างต่อจากหน้าปัจจุบัน (กำหนดขนาดเองได้)
  addPageWithSize(size: { width: number; height: number } | null): void;
  setPageIndex(index: number): void;
  select(ids: string[]): void;
  setEditingText(id: string | null): void;
  setGuides(guides: Guide[]): void;
  setViewport(zoom: number, pan: { x: number; y: number }): void;

  /// เริ่มการลาก/ย่อขยาย — การแก้ระหว่างนี้รวมเป็นหนึ่งขั้นของ undo
  beginGesture(): void;
  endGesture(): void;

  updateElements(ids: string[], patch: (el: CanvasElement) => Partial<CanvasElement>): void;
  addElements(elements: CanvasElement[], options?: { select?: boolean }): void;
  /// ลบตาม id (ยางลบ) — ข้ามชิ้นที่ล็อก
  removeElements(ids: string[]): void;
  setTool(patch: Partial<DrawTool>): void;
  copyStyle(): void;
  /// วางสไตล์ที่คัดลอกไว้ลงชิ้นงาน (ข้ามชิ้นที่ล็อก)
  pasteStyle(ids: string[]): void;
  /// กระจายระยะห่างให้เท่ากัน (ต้องเลือก 3 ชิ้นขึ้นไป)
  distributeSelected(axis: 'horizontal' | 'vertical'): void;
  /// แก้คุณสมบัติของหน้า (ชื่อ ซ่อน ล็อก โน้ต เวลา)
  updatePage(index: number, patch: Partial<Omit<Page, 'id' | 'elements'>>): void;
  /// วางชิ้นงานไว้หลังสุดของหน้าปัจจุบัน (ภาพแบ็กกราวด์) ในขั้น undo เดียว
  addBehind(element: CanvasElement): void;
  /// ค้นหาและแทนที่ข้อความทุกหน้า (ข้ามชิ้นที่ล็อก) · คืนจำนวนที่แทน
  replaceText(find: string, replacement: string, matchCase: boolean): number;
  /// แทนสีหนึ่งด้วยอีกสีในหน้าปัจจุบันหรือทั้งงาน · คืนจำนวนจุดที่เปลี่ยน
  replaceColor(from: string, to: string, scope: 'page' | 'all'): number;
  removeSelected(): void;
  duplicateSelected(): void;
  copySelected(): void;
  paste(): void;
  reorderSelected(direction: 'forward' | 'backward' | 'front' | 'back'): void;
  moveLayer(id: string, toIndex: number): void;
  groupSelected(): void;
  ungroupSelected(): void;
  alignSelected(edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void;

  setBackground(color: string | null): void;
  /// แทนทั้งงานด้วยเอกสารใหม่ (ใช้เทมเพลตจากแผง "ออกแบบ") — ย้อนกลับได้ด้วย undo
  replaceDocument(doc: DesignDocument): void;
  addPage(): void;
  duplicatePage(index: number): void;
  deletePage(index: number): void;
  movePage(from: number, to: number): void;
  /// ต่อหน้าจากงานอื่นท้ายงานนี้ (แผงโปรเจกต์)
  appendPages(pages: Page[]): void;
  copyPage(index: number): void;
  /// วางหน้าที่คัดลอกไว้ต่อจากหน้าที่ระบุ
  pastePage(afterIndex: number): void;
  /// ลบหลายหน้าพร้อมกัน (มุมมองตาราง) — เหลืออย่างน้อย 1 หน้าเสมอ
  deletePages(indexes: number[]): void;
  duplicatePages(indexes: number[]): void;

  undo(): void;
  redo(): void;
}

let gestureSnapshot: DesignDocument | null = null;

/// แก้เนื้องานได้หรือไม่: ต้องเป็นเจ้าของหรือลิงก์แก้ไขได้ และอยู่ในโหมด "การแก้ไข"
export function canEditDoc(state: Pick<EditorState, 'access' | 'viewMode'>): boolean {
  return (state.access === 'OWNER' || state.access === 'EDIT') && state.viewMode === 'edit';
}

/// เขียนความคิดเห็นได้หรือไม่ (เจ้าของ · ลิงก์แก้ไขได้ · ลิงก์แสดงความคิดเห็นได้)
export function canComment(state: Pick<EditorState, 'access'>): boolean {
  return state.access !== 'VIEW';
}

export function currentPage(state: Pick<EditorState, 'doc' | 'pageIndex'>): Page {
  return state.doc.pages[Math.min(state.pageIndex, state.doc.pages.length - 1)];
}

/// ขยายการเลือกให้ครอบทั้งกลุ่ม — คลิกชิ้นเดียวในกลุ่มต้องได้ทั้งกลุ่ม
export function expandGroups(page: Page, ids: string[]): string[] {
  const groups = new Set(
    page.elements.filter((el) => ids.includes(el.id) && el.groupId).map((el) => el.groupId),
  );

  return page.elements
    .filter((el) => ids.includes(el.id) || (el.groupId && groups.has(el.groupId)))
    .map((el) => el.id);
}

export function selectionBox(page: Page, ids: string[]): Rect | null {
  return unionBox(page.elements.filter((el) => ids.includes(el.id)).map(boundingBox));
}

function withPage(doc: DesignDocument, index: number, fn: (page: Page) => Page): DesignDocument {
  return { ...doc, pages: doc.pages.map((page, i) => (i === index ? fn(page) : page)) };
}

/// ข้อความต้องสูงพอดีกับบรรทัดเสมอ — คำนวณใหม่ทุกครั้งที่เนื้อหา/ขนาดเปลี่ยน
function fitText(el: CanvasElement): CanvasElement {
  if (el.type !== 'text') return el;

  return { ...el, height: measureTextHeight(el) };
}

export const useEditor = create<EditorState>((set, get) => {
  /// เปลี่ยน doc แล้วบันทึกประวัติ (ยกเว้นระหว่างลาก ซึ่งบันทึกตอนปล่อย)
  /// ขนาดของหน้าที่เปิด (หลังเปลี่ยนหน้า/เปลี่ยนงาน) ให้ผืนผ้าใบและเครื่องมือทุกตัวใช้ค่าเดียวกัน
  function sized(doc: DesignDocument, pageIndex: number) {
    const state = get();
    const page = doc.pages[Math.min(pageIndex, doc.pages.length - 1)];

    return pageSizeOf(page, { width: state.baseWidth, height: state.baseHeight });
  }

  function commit(next: DesignDocument, extra: Partial<EditorState> = {}) {
    const state = get();
    const size = sized(next, extra.pageIndex ?? state.pageIndex);

    if (gestureSnapshot) {
      set({ doc: next, revision: state.revision + 1, ...size, ...extra });
      return;
    }

    set({
      doc: next,
      past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: [],
      revision: state.revision + 1,
      ...size,
      ...extra,
    });
  }

  function mutatePage(fn: (page: Page) => Page, extra: Partial<EditorState> = {}) {
    const state = get();

    commit(withPage(state.doc, state.pageIndex, fn), extra);
  }

  return {
    designId: '',
    title: '',
    designType: '',
    access: 'OWNER',
    linkAccess: 'NONE',
    width: 1080,
    height: 1080,
    baseWidth: 1080,
    baseHeight: 1080,
    doc: { version: 1, pages: [blankPage()] },
    pageIndex: 0,
    selection: [],
    editingTextId: null,
    guides: [],
    past: [],
    future: [],
    revision: 0,
    zoom: 1,
    pan: { x: 0, y: 0 },
    clipboard: [],
    tool: DEFAULT_DRAW_TOOL,
    styleClipboard: null,
    pageClipboard: null,
    viewMode: 'edit',

    setViewMode(mode) {
      set({ viewMode: mode, selection: [], editingTextId: null });
    },

    load(meta, doc) {
      gestureSnapshot = null;
      set({
        ...meta,
        baseWidth: meta.width,
        baseHeight: meta.height,
        ...pageSizeOf(doc.pages[0], meta),
        doc,
        pageIndex: 0,
        selection: [],
        editingTextId: null,
        guides: [],
        past: [],
        future: [],
        revision: 0,
        tool: { ...get().tool, mode: 'select' },
      });
    },

    setTitle(title) {
      set({ title });
    },

    resize(width, height) {
      // ขนาดอยู่นอก doc จึงไม่อยู่ในประวัติ undo — แค่ทำให้ตัวบันทึกอัตโนมัติรู้ว่าต้องบันทึก
      const state = get();
      const page = state.doc.pages[state.pageIndex];

      set({ baseWidth: width, baseHeight: height, ...pageSizeOf(page, { width, height }), revision: state.revision + 1 });
    },

    resizeDesign(width, height, scaleContent) {
      const state = get();

      if (scaleContent) {
        const from = { width: state.baseWidth, height: state.baseHeight };
        const pages = state.doc.pages.map((page) =>
          page.width || page.height ? page : { ...fitTemplate({ version: 1, pages: [page] }, from, { width, height }).pages[0], id: page.id },
        );

        set({ baseWidth: width, baseHeight: height });
        commit({ ...state.doc, pages }, { selection: [] });
        return;
      }

      get().resize(width, height);
    },

    resizePage(index, size) {
      const state = get();

      commit(withPage(state.doc, index, (page) => ({ ...page, width: size?.width, height: size?.height })));
    },

    addPageWithSize(size) {
      const state = get();
      const pages = [...state.doc.pages];
      const page: Page = size ? { ...blankPage(), width: size.width, height: size.height } : blankPage();

      pages.splice(state.pageIndex + 1, 0, page);
      commit({ ...state.doc, pages }, { pageIndex: state.pageIndex + 1, selection: [] });
    },

    setPageIndex(index) {
      set({ pageIndex: index, selection: [], editingTextId: null, ...sized(get().doc, index) });
    },

    select(ids) {
      const page = currentPage(get());

      set({ selection: expandGroups(page, ids), editingTextId: null });
    },

    setEditingText(id) {
      set({ editingTextId: id });
    },

    setGuides(guides) {
      set({ guides });
    },

    setViewport(zoom, pan) {
      set({ zoom, pan });
    },

    beginGesture() {
      gestureSnapshot = get().doc;
    },

    endGesture() {
      const snapshot = gestureSnapshot;

      gestureSnapshot = null;

      const state = get();

      if (snapshot && snapshot !== state.doc) {
        set({ past: [...state.past, snapshot].slice(-HISTORY_LIMIT), future: [], guides: [] });
      } else {
        set({ guides: [] });
      }
    },

    updateElements(ids, patch) {
      mutatePage((page) => ({
        ...page,
        elements: page.elements.map((el) =>
          ids.includes(el.id) ? fitText({ ...el, ...patch(el) } as CanvasElement) : el,
        ),
      }));
    },

    addElements(elements, options = {}) {
      const fitted = elements.map(fitText);

      mutatePage((page) => ({ ...page, elements: [...page.elements, ...fitted] }), {
        selection: options.select === false ? get().selection : fitted.map((el) => el.id),
      });
    },

    removeElements(ids) {
      const page = currentPage(get());
      const removable = new Set(ids.filter((id) => !page.elements.find((el) => el.id === id)?.locked));

      if (removable.size === 0) return;

      mutatePage((p) => ({ ...p, elements: p.elements.filter((el) => !removable.has(el.id)) }), {
        selection: get().selection.filter((id) => !removable.has(id)),
      });
    },

    copyStyle() {
      const state = get();
      const first = currentPage(state).elements.find((el) => state.selection.includes(el.id));

      if (first) set({ styleClipboard: styleOf(first) });
    },

    pasteStyle(ids) {
      const style = get().styleClipboard;

      if (!style) return;

      const page = currentPage(get());
      const targets = ids.filter((id) => !page.elements.find((el) => el.id === id)?.locked);

      if (targets.length > 0) get().updateElements(targets, (el) => applyStyle(el, style));
    },

    distributeSelected(axis) {
      const state = get();
      const picked = currentPage(state)
        .elements.filter((el) => state.selection.includes(el.id) && !el.locked)
        .map((el) => ({ el, box: boundingBox(el) }));

      if (picked.length < 3) return;

      const horizontal = axis === 'horizontal';

      picked.sort((a, b) => (horizontal ? a.box.x - b.box.x : a.box.y - b.box.y));

      const first = picked[0].box;
      const last = picked[picked.length - 1].box;
      const span = horizontal ? last.x + last.width - first.x : last.y + last.height - first.y;
      const used = picked.reduce((sum, p) => sum + (horizontal ? p.box.width : p.box.height), 0);
      const gap = (span - used) / (picked.length - 1);
      const targets = new Map<string, number>();
      let cursor = horizontal ? first.x : first.y;

      for (const p of picked) {
        targets.set(p.el.id, cursor - (horizontal ? p.box.x : p.box.y));
        cursor += (horizontal ? p.box.width : p.box.height) + gap;
      }

      get().updateElements([...targets.keys()], (el) =>
        horizontal ? { x: el.x + targets.get(el.id)! } : { y: el.y + targets.get(el.id)! },
      );
    },

    updatePage(index, patch) {
      const state = get();

      commit(withPage(state.doc, index, (page) => ({ ...page, ...patch })));
    },

    addBehind(element) {
      const state = get();

      commit(withPage(state.doc, state.pageIndex, (page) => ({ ...page, elements: [element, ...page.elements] })));
    },

    replaceText(find, replacement, matchCase) {
      if (!find) return 0;

      const state = get();
      const pattern = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
      let count = 0;
      const pages = state.doc.pages.map((page) => ({
        ...page,
        elements: page.elements.map((el) => {
          if (el.type !== 'text' || el.locked) return el;

          const hits = el.text.match(pattern)?.length ?? 0;

          if (hits === 0) return el;
          count += hits;

          return fitText({ ...el, text: el.text.replace(pattern, () => replacement) });
        }),
      }));

      if (count > 0) commit({ ...state.doc, pages });

      return count;
    },

    replaceColor(from, to, scope) {
      const state = get();
      let count = 0;
      const swap = (value: string | null | undefined) => {
        if (!value || !value.includes(from)) return value;

        count++;

        return value.split(from).join(to);
      };
      const mapPage = (page: Page): Page => ({
        ...page,
        background: swap(page.background) ?? null,
        elements: page.elements.map((el) => {
          if (el.locked) return el;
          if (el.type === 'shape') return { ...el, fill: swap(el.fill) ?? null, stroke: swap(el.stroke) ?? null };
          if (el.type === 'text' || el.type === 'svg' || el.type === 'path') return { ...el, color: swap(el.color)! };

          return el;
        }),
      });
      const pages = state.doc.pages.map((page, i) => (scope === 'all' || i === state.pageIndex ? mapPage(page) : page));

      if (count > 0) commit({ ...state.doc, pages });

      return count;
    },

    setTool(patch) {
      const tool = { ...get().tool, ...patch };

      // เข้าโหมดวาดแล้วเลิกเลือกชิ้นงาน (กรอบเลือกจะบังเส้นที่กำลังวาด)
      set(tool.mode === 'draw' ? { tool, selection: [], editingTextId: null } : { tool });
    },

    removeSelected() {
      const { selection } = get();
      const page = currentPage(get());
      const removable = selection.filter((id) => !page.elements.find((el) => el.id === id)?.locked);

      if (removable.length === 0) return;

      mutatePage((p) => ({ ...p, elements: p.elements.filter((el) => !removable.includes(el.id)) }), {
        selection: [],
        editingTextId: null,
      });
    },

    duplicateSelected() {
      const { selection } = get();
      const page = currentPage(get());
      const picked = page.elements.filter((el) => selection.includes(el.id));

      if (picked.length === 0) return;

      get().addElements(cloneElements(picked, 20));
    },

    copySelected() {
      const { selection } = get();
      const page = currentPage(get());

      set({ clipboard: page.elements.filter((el) => selection.includes(el.id)) });
    },

    paste() {
      const { clipboard } = get();

      if (clipboard.length > 0) get().addElements(cloneElements(clipboard, 20));
    },

    reorderSelected(direction) {
      const { selection } = get();

      mutatePage((page) => {
        const picked = page.elements.filter((el) => selection.includes(el.id));
        const rest = page.elements.filter((el) => !selection.includes(el.id));

        if (picked.length === 0) return page;

        if (direction === 'front') return { ...page, elements: [...rest, ...picked] };
        if (direction === 'back') return { ...page, elements: [...picked, ...rest] };

        // ขยับทีละชั้นโดยข้าม element ที่ถูกเลือกด้วยกัน
        const elements = [...page.elements];
        const indices = elements
          .map((el, index) => (selection.includes(el.id) ? index : -1))
          .filter((index) => index >= 0);
        const ordered = direction === 'forward' ? [...indices].reverse() : indices;

        for (const index of ordered) {
          const target = direction === 'forward' ? index + 1 : index - 1;

          if (target < 0 || target >= elements.length || selection.includes(elements[target].id)) continue;
          [elements[index], elements[target]] = [elements[target], elements[index]];
        }

        return { ...page, elements };
      });
    },

    moveLayer(id, toIndex) {
      mutatePage((page) => {
        const from = page.elements.findIndex((el) => el.id === id);

        if (from < 0) return page;

        const elements = [...page.elements];
        const [moved] = elements.splice(from, 1);

        elements.splice(Math.max(0, Math.min(toIndex, elements.length)), 0, moved);

        return { ...page, elements };
      });
    },

    groupSelected() {
      const { selection } = get();

      if (selection.length < 2) return;

      const groupId = newId('group');

      get().updateElements(selection, () => ({ groupId }));
    },

    ungroupSelected() {
      get().updateElements(get().selection, () => ({ groupId: null }));
    },

    alignSelected(edge) {
      const state = get();
      const page = currentPage(state);
      const picked = page.elements.filter((el) => state.selection.includes(el.id) && !el.locked);

      if (picked.length === 0) return;

      // ชิ้นเดียว = จัดเทียบหน้า · หลายชิ้น = จัดเทียบกรอบรวมของที่เลือก
      const frame =
        picked.length === 1
          ? { x: 0, y: 0, width: state.width, height: state.height }
          : unionBox(picked.map(boundingBox))!;

      get().updateElements(
        picked.map((el) => el.id),
        (el) => {
          const box = boundingBox(el);
          const offsetX = el.x - box.x;
          const offsetY = el.y - box.y;

          switch (edge) {
            case 'left':
              return { x: frame.x + offsetX };
            case 'center':
              return { x: frame.x + (frame.width - box.width) / 2 + offsetX };
            case 'right':
              return { x: frame.x + frame.width - box.width + offsetX };
            case 'top':
              return { y: frame.y + offsetY };
            case 'middle':
              return { y: frame.y + (frame.height - box.height) / 2 + offsetY };
            case 'bottom':
              return { y: frame.y + frame.height - box.height + offsetY };
          }
        },
      );
    },

    setBackground(color) {
      mutatePage((page) => ({ ...page, background: color }));
    },

    replaceDocument(doc) {
      commit(doc, { pageIndex: 0, selection: [], editingTextId: null });
    },

    addPage() {
      const state = get();
      const pages = [...state.doc.pages];

      pages.splice(state.pageIndex + 1, 0, blankPage());
      commit({ ...state.doc, pages }, { pageIndex: state.pageIndex + 1, selection: [] });
    },

    duplicatePage(index) {
      const state = get();
      const source = state.doc.pages[index];
      const copy: Page = { ...source, id: newId('page'), elements: cloneElements(source.elements, 0) };
      const pages = [...state.doc.pages];

      pages.splice(index + 1, 0, copy);
      commit({ ...state.doc, pages }, { pageIndex: index + 1, selection: [] });
    },

    deletePage(index) {
      const state = get();

      if (state.doc.pages.length <= 1) return;

      const pages = state.doc.pages.filter((_, i) => i !== index);

      commit({ ...state.doc, pages }, { pageIndex: Math.min(state.pageIndex, pages.length - 1), selection: [] });
    },

    movePage(from, to) {
      const state = get();

      if (to < 0 || to >= state.doc.pages.length) return;

      const pages = [...state.doc.pages];
      const [moved] = pages.splice(from, 1);

      pages.splice(to, 0, moved);
      commit({ ...state.doc, pages }, { pageIndex: to, selection: [] });
    },

    copyPage(index) {
      const page = get().doc.pages[index];

      if (page) set({ pageClipboard: page });
    },

    pastePage(afterIndex) {
      const state = get();
      const source = state.pageClipboard;

      if (!source) return;

      const pages = [...state.doc.pages];

      pages.splice(afterIndex + 1, 0, { ...source, id: newId('page'), elements: cloneElements(source.elements, 0) });
      commit({ ...state.doc, pages }, { pageIndex: afterIndex + 1, selection: [] });
    },

    deletePages(indexes) {
      const state = get();
      const drop = new Set(indexes);
      const pages = state.doc.pages.filter((_, i) => !drop.has(i));

      if (pages.length === 0 || drop.size === 0) return;

      commit({ ...state.doc, pages }, { pageIndex: Math.min(state.pageIndex, pages.length - 1), selection: [] });
    },

    duplicatePages(indexes) {
      const state = get();
      const pick = new Set(indexes);
      const pages: Page[] = [];

      state.doc.pages.forEach((page, i) => {
        pages.push(page);
        if (pick.has(i)) pages.push({ ...page, id: newId('page'), elements: cloneElements(page.elements, 0) });
      });

      commit({ ...state.doc, pages }, { selection: [] });
    },

    appendPages(pages) {
      const state = get();

      if (pages.length === 0) return;

      commit({ ...state.doc, pages: [...state.doc.pages, ...pages] }, { pageIndex: state.doc.pages.length, selection: [] });
    },

    undo() {
      const state = get();
      const previous = state.past.at(-1);

      if (!previous) return;

      set({
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
        pageIndex: Math.min(state.pageIndex, previous.pages.length - 1),
        ...sized(previous, Math.min(state.pageIndex, previous.pages.length - 1)),
        selection: [],
        editingTextId: null,
        revision: state.revision + 1,
      });
    },

    redo() {
      const state = get();
      const next = state.future[0];

      if (!next) return;

      set({
        doc: next,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        pageIndex: Math.min(state.pageIndex, next.pages.length - 1),
        ...sized(next, Math.min(state.pageIndex, next.pages.length - 1)),
        selection: [],
        editingTextId: null,
        revision: state.revision + 1,
      });
    },
  };
});

/// สำเนาที่มี id ใหม่ · กลุ่มเดิมได้ groupId ใหม่ (ไม่ผูกกับต้นฉบับ)
/// ค่าที่ "คัดลอกสไตล์" เก็บ — แยกตามชนิดชิ้นงาน
export interface StyleSnapshot {
  type: CanvasElement['type'];
  /// สีหลัก (ข้อความ ไอคอน เส้นวาด หรือสีพื้นรูปทรง) — ใช้เมื่อวางข้ามชนิด
  color: string | null;
  common: Partial<CanvasElement>;
  specific: Partial<CanvasElement>;
}

const STYLE_KEYS: Record<CanvasElement['type'], string[]> = {
  text: ['fontFamily', 'fontSize', 'fontWeight', 'italic', 'underline', 'strike', 'uppercase', 'align', 'lineHeight', 'letterSpacing', 'color', 'effect', 'list', 'curve'],
  shape: ['fill', 'stroke', 'strokeWidth', 'strokeStyle', 'cornerRadius'],
  image: ['cornerRadius', 'adjust', 'filter', 'filterIntensity', 'border'],
  svg: ['color'],
  path: ['color', 'strokeWidth'],
  chart: ['colors', 'fontFamily', 'fontSize', 'color', 'showLegend', 'showLabels', 'showGrid'],
};

function pick(el: CanvasElement, keys: string[]): Partial<CanvasElement> {
  const source = el as unknown as Record<string, unknown>;

  return Object.fromEntries(keys.filter((k) => source[k] !== undefined).map((k) => [k, source[k]])) as Partial<CanvasElement>;
}

export function styleOf(el: CanvasElement): StyleSnapshot {
  const color = el.type === 'shape' ? el.fill : el.type === 'image' ? null : el.color;

  return {
    type: el.type,
    color: color && !color.includes('gradient') ? color : null,
    common: pick(el, ['opacity', 'shadow', 'animation']),
    specific: pick(el, STYLE_KEYS[el.type]),
  };
}

export function applyStyle(el: CanvasElement, style: StyleSnapshot): Partial<CanvasElement> {
  if (style.type === el.type) return { ...style.common, ...style.specific } as Partial<CanvasElement>;

  const out: Record<string, unknown> = { ...style.common };

  if (style.color) {
    if (el.type === 'shape') out.fill = style.color;
    else if (el.type !== 'image') out.color = style.color;
  }

  return out as Partial<CanvasElement>;
}

export function cloneElements(elements: CanvasElement[], offset: number): CanvasElement[] {
  const groupMap = new Map<string, string>();

  return elements.map((el) => {
    let groupId: string | null = null;

    if (el.groupId) {
      groupId = groupMap.get(el.groupId) ?? newId('group');
      groupMap.set(el.groupId, groupId);
    }

    return { ...el, id: newId(), x: el.x + offset, y: el.y + offset, groupId, locked: false };
  });
}
