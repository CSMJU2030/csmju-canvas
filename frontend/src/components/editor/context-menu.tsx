'use client';

import {
  AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical, AlignCenterHorizontal,
  Accessibility, ChevronRight, ChevronsDown, ChevronsUp, ChevronDown, ChevronUp, ClipboardPaste, Copy, CopyPlus, Download,
  EyeOff, FilePlus, Info, Layers, Link, Lock, LockOpen, PaintRoller, Palette, Trash2, Wallpaper,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/components/csmju/primitives';
import { exportSelection } from '@/lib/editor/export';
import { dominantColors } from '@/lib/editor/image-filters';
import { getImage } from '@/lib/editor/render';
import { canEditDoc, currentPage, useEditor } from '@/lib/editor/store';
import { useEditorUi } from '@/lib/editor/ui-store';

/// เมนูคลิกขวา / ปุ่ม … ของชิ้นงาน (ภาพบรีฟ "เมื่อคลิกขวา") — คีย์ลัดที่แสดงทำงานจริงทุกตัว
export function ContextMenu() {
  const menu = useEditorUi((s) => s.contextMenu);

  if (!menu || typeof document === 'undefined') return null;

  return createPortal(<MenuBody x={menu.x} y={menu.y} />, document.body);
}

function closeMenu() {
  useEditorUi.getState().openContextMenu(null);
}

interface Item {
  label: string;
  icon: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  submenu?: Item[];
}

function MenuBody({ x, y }: { x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<number | null>(null);
  const toast = useToast();
  const state = useEditor.getState();
  const page = currentPage(state);
  const selected = page.elements.filter((el) => state.selection.includes(el.id));
  const single = selected.length === 1 ? selected[0] : null;
  const locked = selected.length > 0 && selected.every((el) => el.locked);
  const editable = canEditDoc(state);

  useLayoutEffect(() => {
    const el = ref.current;

    if (!el) return;

    el.style.left = `${Math.min(x, window.innerWidth - el.offsetWidth - 8)}px`;
    el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - el.offsetHeight - 8))}px`;
    el.style.visibility = 'visible';
  }, [x, y]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) closeMenu();
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && closeMenu();

    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', closeMenu);

    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', closeMenu);
    };
  }, []);

  const items: (Item | 'divider')[] =
    selected.length === 0
      ? [
          { label: 'วาง', icon: <ClipboardPaste aria-hidden className="size-4" />, shortcut: 'Ctrl+V', disabled: !editable || state.clipboard.length === 0, onSelect: () => state.paste() },
          {
            label: 'เลือกทั้งหมด',
            icon: <CopyPlus aria-hidden className="size-4" />,
            shortcut: 'Ctrl+A',
            onSelect: () => state.select(page.elements.filter((el) => !el.hidden).map((el) => el.id)),
          },
          'divider',
          { label: 'สีพื้นหลัง', icon: <Palette aria-hidden className="size-4" />, disabled: !editable, onSelect: () => useEditorUi.getState().openColor('background') },
          { label: 'เพิ่มหน้า', icon: <FilePlus aria-hidden className="size-4" />, shortcut: 'Ctrl+Enter', disabled: !editable, onSelect: () => state.addPage() },
          { label: 'ทำซ้ำหน้า', icon: <Copy aria-hidden className="size-4" />, disabled: !editable, onSelect: () => state.duplicatePage(state.pageIndex) },
          {
            label: page.hidden ? 'แสดงหน้านี้' : 'ซ่อนหน้านี้',
            icon: <EyeOff aria-hidden className="size-4" />,
            disabled: !editable,
            onSelect: () => state.updatePage(state.pageIndex, { hidden: !page.hidden }),
          },
          {
            label: 'ลบหน้า',
            icon: <Trash2 aria-hidden className="size-4" />,
            danger: true,
            disabled: !editable || state.doc.pages.length <= 1,
            onSelect: () => window.confirm(`ลบหน้า ${state.pageIndex + 1}? (ย้อนกลับได้ด้วย Ctrl+Z)`) && state.deletePage(state.pageIndex),
          },
        ]
      : [
          { label: 'คัดลอก', icon: <Copy aria-hidden className="size-4" />, shortcut: 'Ctrl+C', onSelect: () => state.copySelected() },
          {
            label: 'คัดลอกสไตล์',
            icon: <PaintRoller aria-hidden className="size-4" />,
            shortcut: 'Ctrl+Alt+C',
            disabled: !editable,
            onSelect: () => {
              state.copyStyle();
              useEditorUi.getState().setPainting(true);
              toast('คัดลอกสไตล์แล้ว — คลิกชิ้นงานที่จะวางสไตล์');
            },
          },
          { label: 'วาง', icon: <ClipboardPaste aria-hidden className="size-4" />, shortcut: 'Ctrl+V', disabled: !editable || state.clipboard.length === 0, onSelect: () => state.paste() },
          { label: 'ทำสำเนา', icon: <CopyPlus aria-hidden className="size-4" />, shortcut: 'Ctrl+D', disabled: !editable, onSelect: () => state.duplicateSelected() },
          { label: 'ลบ', icon: <Trash2 aria-hidden className="size-4" />, shortcut: 'Delete', danger: true, disabled: !editable || locked, onSelect: () => state.removeSelected() },
          'divider',
          {
            label: 'เลเยอร์',
            icon: <Layers aria-hidden className="size-4" />,
            disabled: !editable,
            submenu: [
              { label: 'ย้ายขึ้นไปบนสุด', icon: <ChevronsUp aria-hidden className="size-4" />, shortcut: 'Ctrl+Alt+]', onSelect: () => state.reorderSelected('front') },
              { label: 'ย้ายขึ้นไปหนึ่งชั้น', icon: <ChevronUp aria-hidden className="size-4" />, shortcut: 'Ctrl+]', onSelect: () => state.reorderSelected('forward') },
              { label: 'ย้ายลงไปหนึ่งชั้น', icon: <ChevronDown aria-hidden className="size-4" />, shortcut: 'Ctrl+[', onSelect: () => state.reorderSelected('backward') },
              { label: 'ย้ายลงไปล่างสุด', icon: <ChevronsDown aria-hidden className="size-4" />, shortcut: 'Ctrl+Alt+[', onSelect: () => state.reorderSelected('back') },
              { label: 'แสดงเลเยอร์', icon: <Layers aria-hidden className="size-4" />, shortcut: 'Alt+1', onSelect: () => useEditorUi.getState().setPanel('position') },
            ],
          },
          {
            label: 'จัดตำแหน่ง',
            icon: <AlignStartVertical aria-hidden className="size-4" />,
            disabled: !editable || locked,
            submenu: [
              { label: 'ซ้าย', icon: <AlignStartVertical aria-hidden className="size-4" />, onSelect: () => state.alignSelected('left') },
              { label: 'ตรงกลาง', icon: <AlignCenterVertical aria-hidden className="size-4" />, onSelect: () => state.alignSelected('center') },
              { label: 'ขวา', icon: <AlignEndVertical aria-hidden className="size-4" />, onSelect: () => state.alignSelected('right') },
              { label: 'บน', icon: <AlignStartHorizontal aria-hidden className="size-4" />, onSelect: () => state.alignSelected('top') },
              { label: 'กลาง', icon: <AlignCenterHorizontal aria-hidden className="size-4" />, onSelect: () => state.alignSelected('middle') },
              { label: 'ล่าง', icon: <AlignEndHorizontal aria-hidden className="size-4" />, onSelect: () => state.alignSelected('bottom') },
            ],
          },
          ...(single?.type === 'image'
            ? ([
                'divider',
                {
                  label: 'กำหนดรูปภาพเป็นแบ็กกราวด์',
                  icon: <Wallpaper aria-hidden className="size-4" />,
                  disabled: !editable,
                  onSelect: () => {
                    // รูปขยายเต็มหน้าแล้วย้ายไปล่างสุดและล็อก (แบบ Canva)
                    const img = getImage(single.src);
                    const aspect = img ? img.naturalWidth / Math.max(1, img.naturalHeight) : single.width / single.height;
                    const pageAspect = state.width / state.height;
                    const width = aspect > pageAspect ? state.height * aspect : state.width;
                    const height = width / aspect;

                    state.updateElements([single.id], () => ({
                      x: (state.width - width) / 2,
                      y: (state.height - height) / 2,
                      width,
                      height,
                      rotation: 0,
                      crop: null,
                      locked: true,
                      name: 'แบ็กกราวด์',
                    }));
                    state.reorderSelected('back');
                    toast('ตั้งเป็นแบ็กกราวด์และล็อกไว้แล้ว');
                  },
                },
                {
                  label: 'ใช้สีกับเพจ',
                  icon: <Palette aria-hidden className="size-4" />,
                  disabled: !editable,
                  onSelect: () => {
                    const img = getImage(single.src);
                    const [color] = img ? dominantColors(img, 1) : [];

                    if (color) {
                      state.setBackground(color);
                      toast('ใช้สีเด่นของรูปเป็นพื้นหลังหน้าแล้ว');
                    } else {
                      toast('อ่านสีของรูปนี้ไม่ได้', 'error');
                    }
                  },
                },
              ] as (Item | 'divider')[])
            : []),
          'divider',
          {
            label: locked ? 'ปลดล็อก' : 'ล็อก',
            icon: locked ? <LockOpen aria-hidden className="size-4" /> : <Lock aria-hidden className="size-4" />,
            shortcut: 'Alt+Shift+L',
            disabled: !editable,
            onSelect: () => state.updateElements(state.selection, () => ({ locked: !locked })),
          },
          {
            label: 'ลิงก์',
            icon: <Link aria-hidden className="size-4" />,
            shortcut: 'Ctrl+K',
            disabled: !editable || !single,
            onSelect: () => promptLink(single?.link ?? '', (m) => toast(m, 'error')),
          },
          {
            label: 'ข้อความช่วยอธิบาย',
            icon: <Accessibility aria-hidden className="size-4" />,
            disabled: !editable || !single,
            onSelect: () => {
              const next = window.prompt('อธิบายชิ้นงานนี้สำหรับโปรแกรมอ่านหน้าจอ (ข้อความทดแทน)', single?.name ?? '');

              if (next !== null && single) state.updateElements([single.id], () => ({ name: next.trim().slice(0, 200) }));
            },
          },
          'divider',
          {
            label: 'ดาวน์โหลดรายการที่เลือก',
            icon: <Download aria-hidden className="size-4" />,
            onSelect: () => void exportSelection(page, state.selection, state.title).catch(() => toast('ดาวน์โหลดไม่สำเร็จ', 'error')),
          },
          ...(single?.type === 'image'
            ? ([
                {
                  label: 'ข้อมูล',
                  icon: <Info aria-hidden className="size-4" />,
                  onSelect: () => {
                    const img = getImage(single.src);

                    toast(`${single.name || 'รูปภาพ'} · ${img ? `${img.naturalWidth} × ${img.naturalHeight} px` : 'ยังโหลดไม่เสร็จ'}${single.assetId ? ' · อยู่ในแท็บอัปโหลดของคุณ' : ''}`);
                  },
                },
              ] as Item[])
            : []),
        ];

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="เมนูชิ้นงาน"
      style={{ position: 'fixed', left: 0, top: 0, visibility: 'hidden' }}
      className="csmju-pop z-50 w-72 rounded-xl border border-line bg-surface py-1.5 shadow-csmju-lg"
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) =>
        item === 'divider' ? (
          <div key={`d${index}`} role="separator" className="my-1 h-px bg-line" />
        ) : (
          <div key={item.label} className="relative" onMouseEnter={() => setSubmenu(item.submenu ? index : null)}>
            <button
              type="button"
              role="menuitem"
              aria-haspopup={item.submenu ? 'menu' : undefined}
              aria-expanded={item.submenu ? submenu === index : undefined}
              disabled={item.disabled}
              onClick={() => {
                if (item.submenu) {
                  setSubmenu(submenu === index ? null : index);
                  return;
                }

                closeMenu();
                item.onSelect?.();
              }}
              className={`flex min-h-10 w-full items-center gap-3 px-3 text-left text-csmju-caption hover:bg-surface-muted disabled:opacity-40 ${item.danger ? 'text-danger' : 'text-ink'}`}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && <span className="text-muted">{item.shortcut}</span>}
              {item.submenu && <ChevronRight aria-hidden className="size-4" />}
            </button>
            {item.submenu && submenu === index && !item.disabled && (
              <div role="menu" aria-label={item.label} className="absolute top-0 left-full z-10 ml-1 w-64 rounded-xl border border-line bg-surface py-1.5 shadow-csmju-lg">
                {item.submenu.map((sub) => (
                  <button
                    key={sub.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMenu();
                      sub.onSelect?.();
                    }}
                    className="flex min-h-10 w-full items-center gap-3 px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted"
                  >
                    {sub.icon}
                    <span className="flex-1">{sub.label}</span>
                    {sub.shortcut && <span className="text-muted">{sub.shortcut}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}

/// ตั้งลิงก์ให้ชิ้นงานที่เลือก (Ctrl+K) — รับเฉพาะ http(s) และ mailto
export function promptLink(current: string, onError: (message: string) => void) {
  const state = useEditor.getState();
  const id = state.selection[0];

  if (!id) return;

  const next = window.prompt('ใส่ลิงก์ (เว้นว่างเพื่อเอาลิงก์ออก)', current);

  if (next === null) return;

  const value = next.trim();

  if (value && !/^(https?:\/\/|mailto:)/i.test(value)) {
    onError('ลิงก์ต้องขึ้นต้นด้วย https:// หรือ mailto:');
    return;
  }

  state.updateElements([id], () => ({ link: value || null }));
}

