'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Check, ChevronDown, ChevronLeft, ClipboardPaste, Copy, CopyPlus, Download, Ellipsis, Eye, EyeOff, FilePlus, Files, Grid2x2,
  HelpCircle, LayoutDashboard, Link, Lock, LockOpen, Maximize, Minus, NotebookPen, Pencil, Plus, Rows3, Ruler, Scaling, Square, Timer, Trash2, Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { IconButton, cx, useToast } from '@/components/csmju/primitives';
import { DESIGN_GROUPS, DESIGN_TYPES } from '@/lib/design-types';
import { exportPages } from '@/lib/editor/export';
import { renderPageToCanvas } from '@/lib/editor/render';
import { canEditDoc, useEditor } from '@/lib/editor/store';
import type { PagesLayout } from '@/lib/editor/page-layout';
import { pageSizeOf, type Page } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import { zoomBy, zoomTo } from '@/lib/editor/viewport';
import { fitView } from './stage';
import { AudioTrackBar } from './media-panel';
import { useTimer } from './timer';

/// ภาพย่อหน้า (วาดใหม่เมื่อเนื้อหาของหน้านั้นเปลี่ยน)
export function PageThumb({ page, className }: { page: Page; className?: string }) {
  const baseWidth = useEditor((s) => s.baseWidth);
  const baseHeight = useEditor((s) => s.baseHeight);
  const size = pageSizeOf(page, { width: baseWidth, height: baseHeight });
  const { data } = useQuery({
    queryKey: ['page-thumb', page, size.width, size.height],
    queryFn: async () => {
      const canvas = await renderPageToCanvas(page, size, Math.min(1, 320 / Math.max(size.width, size.height)), {
        background: page.background ? undefined : 'rgb(255 255 255)',
      });

      return canvas.toDataURL('image/png');
    },
    staleTime: Infinity,
    gcTime: 15_000,
  });

  return (
    <span className={cx('flex items-center justify-center overflow-hidden', className)} style={{ aspectRatio: `${size.width} / ${size.height}` }}>
      {data ? (
        // eslint-disable-next-line @next/next/no-img-element -- ภาพย่อสร้างจาก canvas ในเครื่อง
        <img src={data} alt="" className="size-full object-contain" draggable={false} />
      ) : (
        <span className="size-full bg-surface" />
      )}
    </span>
  );
}

// ── แถบภาพย่อหน้า ──────────────────────────────────────────────────

/// แถบภาพย่อหน้าเหนือแถบล่าง (มุมมองภาพย่อแบบ Canva) — คลิกเพื่อไปหน้า · ลากเพื่อเรียงใหม่ · … = เมนูหน้า
export function PageStrip() {
  const pages = useEditor((s) => s.doc.pages);
  const pageIndex = useEditor((s) => s.pageIndex);
  const readOnly = useEditor((s) => !canEditDoc(s));
  /// ภาพย่อที่ชิ้นงานบนผืนผ้าใบกำลังถูกลากมาทับ (ปล่อย = ย้ายชิ้นงานไปหน้านั้น)
  const dropTarget = useEditorUi((s) => s.pageDropTarget);
  const [dragging, setDragging] = useState<number | null>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pageIndex]);

  return (
    <div className="shrink-0 bg-stage px-3 pt-2 pb-1">
      <ol aria-label="หน้าทั้งหมด" className="csmju-scroll-x flex items-end gap-2 overflow-x-auto pb-2">
        {pages.map((page, index) => (
          <li
            key={page.id}
            ref={index === pageIndex ? activeRef : undefined}
            draggable={!readOnly}
            onDragStart={() => setDragging(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragging !== null && dragging !== index) useEditor.getState().movePage(dragging, index);
              setDragging(null);
            }}
            className="group relative shrink-0"
          >
            <button
              type="button"
              onClick={() => useEditor.getState().setPageIndex(index)}
              aria-current={index === pageIndex ? 'page' : undefined}
              aria-label={`ไปที่หน้า ${index + 1}${page.name ? ` ${page.name}` : ''}${page.hidden ? ' (ซ่อนอยู่)' : ''}`}
              title="ไปที่เพจ · ลากชิ้นงานจากผืนผ้าใบมาวางที่นี่เพื่อย้ายไปหน้านี้"
              data-page-drop={index}
              className={cx(
                'relative block h-16 overflow-hidden rounded-lg border-2 bg-surface transition-colors',
                dropTarget === index
                  ? cx('ring-2 ring-offset-2', page.locked ? 'border-danger ring-danger' : 'border-primary ring-primary')
                  : index === pageIndex
                    ? 'border-primary'
                    : 'border-transparent hover:border-line-strong',
              )}
            >
              <PageThumb page={page} className={cx('h-full', page.hidden && 'opacity-40')} />
              <span className="absolute bottom-0.5 left-1 max-w-full truncate rounded bg-surface/85 px-1 text-csmju-caption leading-tight text-ink">
                {index + 1}
                {page.name ? ` - ${page.name}` : ''}
              </span>
              {page.hidden && <EyeOff aria-hidden className="absolute top-1 left-1 size-4 text-ink" />}
              {page.locked && <Lock aria-hidden className="absolute top-1 left-6 size-4 text-ink" />}
            </button>
            {!readOnly && (
              <span className="absolute top-1 right-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-aria-expanded:opacity-100">
                <PageMenu index={index} />
              </span>
            )}
          </li>
        ))}
        {!readOnly && (
          <li className="flex shrink-0 items-stretch">
            <button
              type="button"
              onClick={() => useEditor.getState().addPage()}
              aria-label="เพิ่มหน้า (Ctrl+Enter)"
              title="เพิ่มหน้า"
              className="inline-flex h-16 w-14 items-center justify-center rounded-l-lg bg-surface-muted text-ink hover:bg-line"
            >
              <Plus aria-hidden className="size-6" />
            </button>
            <AddPageMenu />
          </li>
        )}
      </ol>
    </div>
  );
}

function MenuRow({ icon, label, shortcut, onClick, danger, disabled }: { icon: ReactNode; label: string; shortcut?: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cx('flex min-h-10 w-full items-center gap-3 px-3 text-left text-csmju-caption hover:bg-surface-muted disabled:opacity-40', danger ? 'text-danger' : 'text-ink')}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-muted">{shortcut}</span>}
    </button>
  );
}

/// เมนู … ของภาพย่อหน้า (ภาพบรีฟ "เปลี่ยนชื่อ 1 หน้า")
export function PageMenu({ index, onRename }: { index: number; onRename?: () => void }) {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');
  const page = useEditor((s) => s.doc.pages[index]);
  const pageCount = useEditor((s) => s.doc.pages.length);
  const hasClipboard = useEditor((s) => Boolean(s.pageClipboard));
  const baseWidth = useEditor((s) => s.baseWidth);
  const baseHeight = useEditor((s) => s.baseHeight);
  const toast = useToast();
  const [resizing, setResizing] = useState(false);
  const state = useEditor.getState;
  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  if (!page) return null;

  const size = pageSizeOf(page, { width: baseWidth, height: baseHeight });

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={`ตัวเลือกของหน้า ${index + 1}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setResizing(false);
          setOpen((v) => !v);
        }}
        className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-on-inverse shadow-csmju-sm"
      >
        <Ellipsis aria-hidden className="size-4" />
      </button>
      <FloatingPanel open={open} menuRef={menuRef} label={`ตัวเลือกของหน้า ${index + 1}`} className="w-72 rounded-xl border border-line bg-surface py-1.5 shadow-csmju-lg">
        {resizing ? (
          <ResizeForm
            initial={size}
            onCancel={() => setResizing(false)}
            onApply={(next) =>
              run(() => {
                state().resizePage(index, next.width === baseWidth && next.height === baseHeight ? null : next);
                toast(`ปรับขนาดหน้า ${index + 1} แล้ว`);
              })
            }
          />
        ) : (
          <>
            <div className="px-3 pt-1 pb-2">
              <button
                type="button"
                onClick={() =>
                  run(() => {
                    if (onRename) return onRename();

                    const name = window.prompt(`ชื่อหน้า ${index + 1}`, page.name ?? '');

                    if (name !== null) state().updatePage(index, { name: name.trim().slice(0, 80) || undefined });
                  })
                }
                className="flex items-center gap-2 text-csmju-body font-bold text-ink hover:underline"
              >
                {page.name || `เปลี่ยนชื่อ ${index + 1} หน้า`} <Pencil aria-hidden className="size-4" />
              </button>
              <p className="text-csmju-caption text-muted tabular-nums">
                {size.width} × {size.height} px
              </p>
            </div>
            <div role="separator" className="my-1 h-px bg-line" />
            <MenuRow icon={<Copy aria-hidden className="size-4" />} label="คัดลอกหน้า" onClick={() => run(() => { state().copyPage(index); toast('คัดลอกหน้าแล้ว'); })} />
            <MenuRow icon={<ClipboardPaste aria-hidden className="size-4" />} label="วางหน้าต่อจากนี้" disabled={!hasClipboard} onClick={() => run(() => state().pastePage(index))} />
            <MenuRow icon={<CopyPlus aria-hidden className="size-4" />} label="ทำซ้ำหน้า" onClick={() => run(() => state().duplicatePage(index))} />
            <MenuRow
              icon={<Trash2 aria-hidden className="size-4" />}
              label="ลบ 1 หน้า"
              shortcut="Delete"
              danger
              disabled={pageCount <= 1}
              onClick={() => run(() => window.confirm(`ลบหน้า ${index + 1}? (ย้อนกลับได้ด้วย Ctrl+Z)`) && state().deletePage(index))}
            />
            <div role="separator" className="my-1 h-px bg-line" />
            <MenuRow icon={<FilePlus aria-hidden className="size-4" />} label="เพิ่มหน้า" shortcut="Ctrl+Enter" onClick={() => run(() => { state().setPageIndex(index); state().addPage(); })} />
            <MenuRow
              icon={page.hidden ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
              label={page.hidden ? 'แสดง 1 หน้า' : 'ซ่อน 1 หน้า'}
              onClick={() => run(() => state().updatePage(index, { hidden: !page.hidden }))}
            />
            <MenuRow
              icon={page.locked ? <LockOpen aria-hidden className="size-4" /> : <Lock aria-hidden className="size-4" />}
              label={page.locked ? 'ปลดล็อกหน้า' : 'ล็อกหน้า'}
              onClick={() => run(() => state().updatePage(index, { locked: !page.locked }))}
            />
            <div role="separator" className="my-1 h-px bg-line" />
            <MenuRow
              icon={<Download aria-hidden className="size-4" />}
              label="ดาวน์โหลด 1 หน้า"
              onClick={() =>
                run(() => {
                  const s = state();

                  void exportPages(s.doc, { width: s.baseWidth, height: s.baseHeight }, `${s.title}-หน้า${index + 1}`, {
                    format: 'png',
                    scale: 1,
                    transparent: false,
                    quality: 1,
                    pageIndexes: [index],
                  }).catch(() => toast('ดาวน์โหลดไม่สำเร็จ', 'error'));
                })
              }
            />
            <MenuRow
              icon={<Link aria-hidden className="size-4" />}
              label="คัดลอกลิงก์ไปที่หน้านี้"
              onClick={() =>
                run(() => {
                  const url = new URL(window.location.href);

                  url.searchParams.set('page', String(index + 1));
                  void navigator.clipboard.writeText(url.toString()).then(
                    () => toast('คัดลอกลิงก์แล้ว — คนที่มีสิทธิ์เปิดงานนี้จะเปิดที่หน้านี้'),
                    () => toast('คัดลอกไม่สำเร็จ', 'error'),
                  );
                })
              }
            />
            <MenuRow icon={<NotebookPen aria-hidden className="size-4" />} label="สมุดโน้ต" onClick={() => run(() => { state().setPageIndex(index); useEditorUi.getState().setPanel('notes'); })} />
            <MenuRow icon={<Scaling aria-hidden className="size-4" />} label="ปรับขนาดหน้า" onClick={() => setResizing(true)} />
          </>
        )}
      </FloatingPanel>
    </>
  );
}

const UNITS = { px: 1, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 } as const;

/// ฟอร์มกำหนดขนาดเอง (กว้าง × ยาว + หน่วย + ล็อกสัดส่วน) ใช้ทั้ง "ปรับขนาดหน้า" และ "เพิ่มหน้า > กำหนดขนาดเอง"
function ResizeForm({ initial, onApply, onCancel, submitLabel = 'ปรับขนาด' }: { initial: { width: number; height: number }; onApply: (size: { width: number; height: number }) => void; onCancel: () => void; submitLabel?: string }) {
  const [unit, setUnit] = useState<keyof typeof UNITS>('px');
  const [w, setW] = useState(String(initial.width));
  const [h, setH] = useState(String(initial.height));
  const [lock, setLock] = useState(false);
  const ratio = initial.width / initial.height;
  const toPx = (v: string) => Math.round(Number(v) * UNITS[unit]);
  const fromPx = (px: number, u: keyof typeof UNITS) => String(Math.round((px / UNITS[u]) * 100) / 100);
  const valid = toPx(w) >= 16 && toPx(h) >= 16 && toPx(w) <= 8000 && toPx(h) <= 8000;

  return (
    <form
      className="flex flex-col gap-3 px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onApply({ width: toPx(w), height: toPx(h) });
      }}
    >
      <div className="flex items-center gap-1">
        <button type="button" onClick={onCancel} aria-label="ย้อนกลับ" className="inline-flex size-9 items-center justify-center rounded-lg text-ink hover:bg-surface-muted">
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <span className="text-csmju-body font-bold text-ink">กำหนดขนาดเอง</span>
      </div>
      <div className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-csmju-caption text-ink">
          ความกว้าง
          <input
            type="number"
            value={w}
            onChange={(e) => {
              setW(e.target.value);
              if (lock) setH(fromPx(toPx(e.target.value) / ratio, unit));
            }}
            className="min-h-10 rounded-lg border border-line-strong bg-surface px-2 text-csmju-caption text-ink focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-csmju-caption text-ink">
          ความยาว
          <input
            type="number"
            value={h}
            onChange={(e) => {
              setH(e.target.value);
              if (lock) setW(fromPx(toPx(e.target.value) * ratio, unit));
            }}
            className="min-h-10 rounded-lg border border-line-strong bg-surface px-2 text-csmju-caption text-ink focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-csmju-caption text-ink">
          หน่วย
          <select
            value={unit}
            onChange={(e) => {
              const next = e.target.value as keyof typeof UNITS;

              setW(fromPx(toPx(w), next));
              setH(fromPx(toPx(h), next));
              setUnit(next);
            }}
            className="min-h-10 rounded-lg border border-line-strong bg-surface px-1 text-csmju-caption text-ink"
          >
            {Object.keys(UNITS).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label={lock ? 'ปลดล็อกสัดส่วน' : 'ล็อกสัดส่วน'}
          aria-pressed={lock}
          onClick={() => setLock((v) => !v)}
          className={cx('inline-flex size-10 items-center justify-center rounded-lg', lock ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-surface-muted')}
        >
          {lock ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
        </button>
      </div>
      <button type="submit" disabled={!valid} className="min-h-11 rounded-xl bg-primary text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover disabled:opacity-40">
        {submitLabel}
      </button>
      {!valid && <p className="text-csmju-caption text-danger">ขนาดต้องอยู่ระหว่าง 16–8000 พิกเซล</p>}
    </form>
  );
}

/// ปุ่ม ⌄ ข้างปุ่มเพิ่มหน้า: เลือกชนิด/ขนาดของหน้าใหม่ (ภาพบรีฟ 80, 83, 84)
function AddPageMenu() {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('end');
  const [view, setView] = useState<'groups' | 'custom' | string>('groups');
  const baseWidth = useEditor((s) => s.baseWidth);
  const baseHeight = useEditor((s) => s.baseHeight);
  const groups = DESIGN_GROUPS.filter((g) => g.available && DESIGN_TYPES.some((t) => t.group === g.key));
  const add = (size: { width: number; height: number } | null) => {
    setOpen(false);
    useEditor.getState().addPageWithSize(size && (size.width !== baseWidth || size.height !== baseHeight) ? size : null);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="เพิ่มหน้าแบบเลือกขนาด"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setView('groups');
          setOpen((v) => !v);
        }}
        className="inline-flex h-16 w-8 items-center justify-center rounded-r-lg border-l border-line bg-surface-muted text-ink hover:bg-line"
      >
        <ChevronDown aria-hidden className={cx('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      <FloatingPanel open={open} menuRef={menuRef} label="เพิ่มหน้า" className="w-80 rounded-2xl border border-line bg-surface p-3 shadow-csmju-lg">
        {view === 'custom' ? (
          <ResizeForm initial={{ width: baseWidth, height: baseHeight }} onCancel={() => setView('groups')} onApply={add} submitLabel="สร้างหน้าใหม่" />
        ) : view !== 'groups' ? (
          <div className="flex flex-col">
            <button type="button" onClick={() => setView('groups')} className="mb-1 flex min-h-10 items-center gap-1 rounded-lg px-1 text-csmju-body font-bold text-ink hover:bg-surface-muted">
              <ChevronLeft aria-hidden className="size-5" /> {groups.find((g) => g.key === view)?.label}
            </button>
            {DESIGN_TYPES.filter((t) => t.group === view).map((type) => (
              <MenuRow key={type.key} icon={<FilePlus aria-hidden className="size-4" />} label={type.label} shortcut={`${type.width}×${type.height}`} onClick={() => add({ width: type.width, height: type.height })} />
            ))}
          </div>
        ) : (
          <>
            <p className="mb-2 px-1 text-csmju-caption text-muted">หน้าใหม่ขนาดเท่าหน้าอื่น กดปุ่ม + ได้เลย · หรือเลือกขนาดของหน้าใหม่</p>
            <div className="grid grid-cols-3 gap-2">
              {groups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => setView(group.key)}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-csmju-caption text-ink hover:bg-surface-muted"
                >
                  <span className={cx('inline-flex size-11 items-center justify-center rounded-full text-on-inverse', group.tone)}>
                    <group.icon aria-hidden className="size-5" />
                  </span>
                  {group.label}
                </button>
              ))}
              <button type="button" onClick={() => setView('custom')} className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-csmju-caption text-ink hover:bg-surface-muted">
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-surface-muted text-ink">
                  <Ruler aria-hidden className="size-5" />
                </span>
                กำหนดขนาดเอง
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  useEditor.getState().addPage();
                  useEditorUi.getState().setPanel('uploads');
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-csmju-caption text-ink hover:bg-surface-muted"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-surface-muted text-ink">
                  <Upload aria-hidden className="size-5" />
                </span>
                หน้าจากอัปโหลด
              </button>
            </div>
          </>
        )}
      </FloatingPanel>
    </>
  );
}

// ── มุมมองตาราง ────────────────────────────────────────────────────

/// มุมมองตาราง (ภาพบรีฟ "หน้า" แบบตาราง): เลือกหลายหน้า แล้วเพิ่ม ทำสำเนา ลบ ซ่อน · ตั้งชื่อหน้าใต้ภาพย่อ
export function PagesGrid() {
  const pages = useEditor((s) => s.doc.pages);
  const pageIndex = useEditor((s) => s.pageIndex);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [dragging, setDragging] = useState<number | null>(null);
  const state = useEditor.getState;
  const indexes = [...picked].filter((i) => i < pages.length);
  const all = indexes.length === pages.length;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-stage">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
        <label className="flex min-h-10 items-center gap-2 text-csmju-caption text-ink">
          <input type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(pages.map((_, i) => i)))} className="size-5 accent-primary" />
          เลือกทั้งหมด
        </label>
        <span className="text-csmju-caption text-muted">{indexes.length > 0 ? `เลือก ${indexes.length} หน้า` : 'เลือกหน้าเพื่อจัดการพร้อมกัน'}</span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="เพิ่มหน้า" onClick={() => state().addPage()}>
            <Plus aria-hidden className="size-5" />
          </IconButton>
          <IconButton label="ทำสำเนาหน้าที่เลือก" disabled={indexes.length === 0} onClick={() => { state().duplicatePages(indexes); setPicked(new Set()); }}>
            <CopyPlus aria-hidden className="size-5" />
          </IconButton>
          <IconButton
            label="ซ่อน/แสดงหน้าที่เลือก"
            disabled={indexes.length === 0}
            onClick={() => {
              const hide = !indexes.every((i) => pages[i].hidden);

              for (const i of indexes) state().updatePage(i, { hidden: hide });
            }}
          >
            <EyeOff aria-hidden className="size-5" />
          </IconButton>
          <IconButton
            label="ลบหน้าที่เลือก"
            disabled={indexes.length === 0 || all}
            onClick={() => {
              if (window.confirm(`ลบ ${indexes.length} หน้า? (ย้อนกลับได้ด้วย Ctrl+Z)`)) {
                state().deletePages(indexes);
                setPicked(new Set());
              }
            }}
            className="text-danger"
          >
            <Trash2 aria-hidden className="size-5" />
          </IconButton>
          <button type="button" onClick={() => useEditorUi.getState().setPagesView('strip')} className="ml-2 min-h-10 rounded-xl bg-primary px-4 text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover">
            กลับไปแก้ไข
          </button>
        </div>
      </div>
      <ol className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-5 overflow-y-auto p-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {pages.map((page, index) => (
          <li
            key={page.id}
            draggable
            onDragStart={() => setDragging(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragging !== null && dragging !== index) state().movePage(dragging, index);
              setDragging(null);
            }}
            className="group relative"
          >
            <button
              type="button"
              onClick={() => {
                state().setPageIndex(index);
                useEditorUi.getState().setPagesView('strip');
              }}
              aria-label={`เปิดหน้า ${index + 1}`}
              className={cx('block w-full overflow-hidden rounded-xl border-2 bg-surface shadow-csmju-sm', index === pageIndex ? 'border-primary' : picked.has(index) ? 'border-primary' : 'border-transparent hover:border-line-strong')}
            >
              <PageThumb page={page} className={cx('w-full', page.hidden && 'opacity-40')} />
            </button>
            <input
              type="checkbox"
              aria-label={`เลือกหน้า ${index + 1}`}
              checked={picked.has(index)}
              onChange={() => {
                const next = new Set(picked);

                if (next.has(index)) next.delete(index);
                else next.add(index);
                setPicked(next);
              }}
              className={cx('absolute top-2 left-2 size-5 accent-primary', !picked.has(index) && 'opacity-0 group-hover:opacity-100 focus:opacity-100')}
            />
            <span className="absolute top-2 right-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-aria-expanded:opacity-100">
              <PageMenu index={index} />
            </span>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-csmju-caption font-semibold text-ink tabular-nums">{index + 1}</span>
              <label className="sr-only" htmlFor={`page-name-${page.id}`}>ชื่อหน้า {index + 1}</label>
              <input
                id={`page-name-${page.id}`}
                defaultValue={page.name ?? ''}
                placeholder="เพิ่มชื่อหน้า"
                maxLength={80}
                onBlur={(event) => {
                  const name = event.target.value.trim();

                  if (name !== (page.name ?? '')) state().updatePage(index, { name: name || undefined });
                }}
                onKeyDown={(event) => event.key === 'Enter' && (event.target as HTMLInputElement).blur()}
                className="min-h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 text-csmju-caption text-ink placeholder:text-muted hover:border-line focus:border-primary focus:outline-none"
              />
              {page.hidden && <EyeOff aria-label="ซ่อนอยู่" className="size-4 text-muted" />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── แถบล่าง ────────────────────────────────────────────────────────

/// แถบล่างของหน้าแก้ไข (แบบ Canva): สมุดโน้ต · ตัวจับเวลา | ซูม · หน้า · 1/6 · ตาราง · เต็มจอ · ช่วยเหลือ
export function BottomBar({ onPresent, readOnly = false }: { onPresent: () => void; readOnly?: boolean }) {
  const zoom = useEditor((s) => s.zoom);
  const pageIndex = useEditor((s) => s.pageIndex);
  const pageCount = useEditor((s) => s.doc.pages.length);
  const panel = useEditorUi((s) => s.panel);
  const pagesView = useEditorUi((s) => s.pagesView);
  const stripOpen = useEditorUi((s) => s.stripOpen);
  const setStripOpen = (open: boolean) => useEditorUi.getState().set({ stripOpen: open });
  const timer = useTimer();

  const fit = () => fitView();

  return (
    <>
      {stripOpen && pagesView === 'strip' && <PageStrip />}
      {/* เสียงประกอบของหน้าปัจจุบัน แสดงเป็นแถบใต้แถบภาพย่อหน้า (แบบ Canva) */}
      {pagesView === 'strip' && <AudioTrackBar />}
      <div className="mb-16 flex min-h-11 shrink-0 items-center justify-between gap-2 bg-stage px-2 md:mb-0">
        <div className="flex items-center gap-1">
          {!readOnly && (
            <BarToggle active={panel === 'notes'} onClick={() => useEditorUi.getState().togglePanel('notes')} icon={<NotebookPen aria-hidden className="size-4" />} label="สมุดโน้ต" />
          )}
          <BarToggle
            active={timer.visible}
            onClick={() => timer.toggle()}
            icon={<Timer aria-hidden className="size-4" />}
            label={timer.running ? timer.label : 'ตัวจับเวลา'}
            highlight={timer.running}
          />
        </div>
        <div className="flex items-center gap-1">
          <label htmlFor="zoom-slider" className="sr-only">ระดับการซูม</label>
          <input
            id="zoom-slider"
            type="range"
            min={10}
            max={400}
            step={1}
            value={Math.round(zoom * 100)}
            onChange={(event) => zoomTo(Number(event.target.value) / 100, undefined, { animate: false })}
            className="hidden w-28 accent-primary lg:block"
          />
          <IconButton label="ซูมออก" onClick={() => zoomBy(1 / 1.2)} className="lg:hidden">
            <Minus aria-hidden className="size-4" />
          </IconButton>
          <button type="button" onClick={fit} title="พอดีจอ" className="min-h-10 min-w-14 rounded-lg px-1 text-csmju-caption font-medium text-ink tabular-nums hover:bg-surface/70">
            {Math.round(zoom * 100)}%
          </button>
          <IconButton label="ซูมเข้า" onClick={() => zoomBy(1.2)} className="lg:hidden">
            <Plus aria-hidden className="size-4" />
          </IconButton>
          <BarToggle active={stripOpen && pagesView === 'strip'} onClick={() => { useEditorUi.getState().setPagesView('strip'); setStripOpen(!stripOpen); }} icon={<Files aria-hidden className="size-4" />} label="หน้า" />
          <PagesLayoutMenu />
          <span className="px-1 text-csmju-caption text-ink tabular-nums" aria-label={`หน้า ${pageIndex + 1} จาก ${pageCount}`}>
            {pageIndex + 1} / {pageCount}
          </span>
          <IconButton label="มุมมองตาราง" onClick={() => useEditorUi.getState().setPagesView(pagesView === 'grid' ? 'strip' : 'grid')} className={pagesView === 'grid' ? 'bg-primary-soft text-primary' : ''}>
            <Grid2x2 aria-hidden className="size-4" />
          </IconButton>
          <IconButton label="เต็มหน้าจอ (Ctrl+Alt+P)" onClick={onPresent}>
            <Maximize aria-hidden className="size-4" />
          </IconButton>
          <a href="/help/shortcuts" target="_blank" rel="noreferrer" aria-label="คีย์ลัดและความช่วยเหลือ" title="คีย์ลัดและความช่วยเหลือ" className="hidden size-10 items-center justify-center rounded-xl text-ink hover:bg-surface/70 sm:inline-flex">
            <HelpCircle aria-hidden className="size-4" />
          </a>
        </div>
      </div>
    </>
  );
}

const LAYOUTS: { key: PagesLayout; label: string; hint: string }[] = [
  { key: 'single', label: 'ทีละหน้า', hint: 'แสดงเฉพาะหน้าที่เลือก' },
  { key: 'scroll', label: 'เลื่อนดู', hint: 'ทุกหน้าเรียงต่อกัน เลื่อนดูและลากชิ้นงานข้ามหน้าได้' },
  { key: 'board', label: 'บอร์ด', hint: 'วางหน้าอิสระ ลากป้ายชื่อหน้าเพื่อย้าย ลำดับยังตามรายการหน้า' },
];

function layoutIcon(layout: PagesLayout) {
  if (layout === 'scroll') return <Rows3 aria-hidden className="size-4" />;
  if (layout === 'board') return <LayoutDashboard aria-hidden className="size-4" />;

  return <Square aria-hidden className="size-4" />;
}

/// ปุ่มเลือกการจัดวางหน้าบนผืนผ้าใบ (แถบล่าง): ทีละหน้า · เลื่อนดู · บอร์ด
function PagesLayoutMenu() {
  const layout = useEditorUi((s) => s.pagesLayout);
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('end');
  const current = LAYOUTS.find((item) => item.key === layout) ?? LAYOUTS[0];

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`การจัดวางหน้า: ${current.label}`}
        title="การจัดวางหน้า"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-csmju-caption font-medium text-ink hover:bg-surface/70"
      >
        {layoutIcon(layout)}
        <span className="hidden sm:inline">{current.label}</span>
      </button>
      <FloatingPanel open={open} menuRef={menuRef} label="การจัดวางหน้า" className="w-80 rounded-xl border border-line bg-surface py-1.5 shadow-csmju-lg">
        {LAYOUTS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitemradio"
            aria-checked={layout === item.key}
            onClick={() => {
              setOpen(false);
              useEditorUi.getState().setPagesLayout(item.key);
              if (item.key === 'board') fitView();
            }}
            className="flex min-h-12 w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-surface-muted"
          >
            <span className="text-ink">{layoutIcon(item.key)}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-csmju-caption font-medium text-ink">{item.label}</span>
              <span className="text-csmju-caption text-muted">{item.hint}</span>
            </span>
            {layout === item.key && <Check aria-hidden className="size-4 text-primary" />}
          </button>
        ))}
      </FloatingPanel>
    </>
  );
}

function BarToggle({ active, onClick, icon, label, highlight }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; highlight?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-csmju-caption font-medium tabular-nums',
        active ? 'bg-surface text-ink shadow-csmju-sm' : 'text-ink hover:bg-surface/70',
        highlight && 'text-primary',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
