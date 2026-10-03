import { create } from 'zustand';
import { boundingBox, unionBox, type Rect } from './geometry';
import { measureTextHeight } from './render';
import type { Guide } from './snapping';
import {
  blankPage,
  newId,
  type CanvasElement,
  type DesignDocument,
  type Page,
} from './types';

const HISTORY_LIMIT = 100;

export interface EditorMeta {
  designId: string;
  title: string;
  designType: string;
  width: number;
  height: number;
}

export interface EditorState extends EditorMeta {
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

  load(meta: EditorMeta, doc: DesignDocument): void;
  setTitle(title: string): void;
  resize(width: number, height: number): void;
  setPageIndex(index: number): void;
  select(ids: string[]): void;
  setEditingText(id: string | null): void;
  setGuides(guides: Guide[]): void;
  setViewport(zoom: number, pan: { x: number; y: number }): void;

  /// เริ่มการลาก/ย่อขยาย — การแก้ระหว่างนี้รวมเป็นหนึ่งขั้นของ undo
  beginGesture(): void;
  endGesture(): void;

  updateElements(ids: string[], patch: (el: CanvasElement) => Partial<CanvasElement>): void;
  addElements(elements: CanvasElement[]): void;
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

  undo(): void;
  redo(): void;
}

let gestureSnapshot: DesignDocument | null = null;

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
  function commit(next: DesignDocument, extra: Partial<EditorState> = {}) {
    const state = get();

    if (gestureSnapshot) {
      set({ doc: next, revision: state.revision + 1, ...extra });
      return;
    }

    set({
      doc: next,
      past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: [],
      revision: state.revision + 1,
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
    width: 1080,
    height: 1080,
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

    load(meta, doc) {
      gestureSnapshot = null;
      set({
        ...meta,
        doc,
        pageIndex: 0,
        selection: [],
        editingTextId: null,
        guides: [],
        past: [],
        future: [],
        revision: 0,
      });
    },

    setTitle(title) {
      set({ title });
    },

    resize(width, height) {
      // ขนาดอยู่นอก doc จึงไม่อยู่ในประวัติ undo — แค่ทำให้ตัวบันทึกอัตโนมัติรู้ว่าต้องบันทึก
      set({ width, height, revision: get().revision + 1 });
    },

    setPageIndex(index) {
      set({ pageIndex: index, selection: [], editingTextId: null });
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

    addElements(elements) {
      const fitted = elements.map(fitText);

      mutatePage((page) => ({ ...page, elements: [...page.elements, ...fitted] }), {
        selection: fitted.map((el) => el.id),
      });
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

    undo() {
      const state = get();
      const previous = state.past.at(-1);

      if (!previous) return;

      set({
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
        pageIndex: Math.min(state.pageIndex, previous.pages.length - 1),
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
        selection: [],
        editingTextId: null,
        revision: state.revision + 1,
      });
    },
  };
});

/// สำเนาที่มี id ใหม่ · กลุ่มเดิมได้ groupId ใหม่ (ไม่ผูกกับต้นฉบับ)
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
