'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accessibility, BarChart3, BookOpen, Check, ChevronLeft, ChevronRight, CloudAlert, CloudCheck, Copy, Download, Eye,
  FilePlus, FolderInput, Grid3x3, HelpCircle, History, Keyboard, LayoutTemplate, Lightbulb, Link as LinkIcon, LoaderCircle,
  Lock, MessageCircle, MessageSquareText, Pencil, Play, Printer, Redo2, Replace, Ruler, Save, Scaling, Settings, Star,
  Trash2, Undo2, Upload, Globe, Flag,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { Avatar } from '@/components/shell/avatar';
import { ReportDialog } from '@/components/reports/report-dialog';
import { FeedbackDialog } from '@/components/shell/account-popover';
import { useOpenCreate } from '@/components/shell/create-dialog';
import { api } from '@/lib/csmju/api';
import { useMe } from '@/lib/csmju/session';
import { useCreateDesign } from '@/lib/create-design';
import { designTypeLabel } from '@/lib/design-types';
import { downloadDesign, parsePageRange, type DownloadFormat } from '@/lib/editor/export';
import { pageSeconds, videoMimeType } from '@/lib/editor/motion-export';
import { renderPageToCanvas } from '@/lib/editor/render';
import { canEditDoc, useEditor } from '@/lib/editor/store';
import { pageSizeOf } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import type { Design } from '@/lib/types';
import { PageThumb } from './page-strip';
import { PresentButton, presentFromCurrent } from './presenter';
import type { SaveStatus } from './use-autosave';

/// แถบบนของหน้าแก้ไขแบบ Canva: ไฟล์ · ปรับขนาด · โหมด | ย้อนกลับ ทำซ้ำ บันทึก ··· ชื่องาน · การวิเคราะห์ · ความคิดเห็น · พรีเซนต์ · แชร์
export function TopBar({ status, onRetry, onPublish }: { status: SaveStatus; onRetry: () => void; onPublish: () => void }) {
  const me = useMe();
  const access = useEditor((s) => s.access);
  const title = useEditor((s) => s.title);
  const editable = useEditor((s) => canEditDoc(s));
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const commentsOpen = useEditorUi((s) => s.commentsOpen);
  const ui = useEditorUi.getState;

  return (
    <header className="csmju-brandbar flex min-h-14 items-center gap-1 px-2 text-on-inverse">
      <Link href="/" aria-label="กลับหน้าแรก" title="กลับหน้าแรก" className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-surface/15">
        <ChevronLeft aria-hidden className="size-5" />
      </Link>
      <FileMenu onPublish={onPublish} />
      {(access === 'OWNER' || access === 'EDIT') && (
        <BarText label="ปรับขนาดดีไซน์" onClick={() => ui().set({ overlay: 'resize' })} icon={<Scaling aria-hidden className="size-4" />}>
          ปรับขนาด
        </BarText>
      )}
      <ModeMenu />
      <span aria-hidden className="mx-1 hidden h-6 w-px bg-surface/30 md:block" />
      {editable && (
        <>
          <BarIcon label="ย้อนกลับ (Ctrl+Z)" disabled={!canUndo} onClick={() => useEditor.getState().undo()}>
            <Undo2 aria-hidden className="size-5" />
          </BarIcon>
          <BarIcon label="ทำซ้ำ (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useEditor.getState().redo()}>
            <Redo2 aria-hidden className="size-5" />
          </BarIcon>
          <SaveIndicator status={status} onRetry={onRetry} />
        </>
      )}
      {!editable && (
        <span className="hidden min-h-9 items-center gap-1 rounded-full bg-surface/20 px-3 text-csmju-caption font-semibold sm:inline-flex">
          <Eye aria-hidden className="size-4" /> {access === 'COMMENT' ? 'แสดงความคิดเห็นได้' : access === 'VIEW' ? 'ดูอย่างเดียว' : 'โหมดดู'}
        </span>
      )}
      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        {access === 'OWNER' ? <TitleField /> : <span className="hidden max-w-56 truncate px-2 text-csmju-caption font-semibold md:inline">{title}</span>}
        <span className="hidden lg:inline-flex" title={`${me.email.split('@')[0]} (คุณ)`}>
          <Avatar email={me.email} size="sm" />
        </span>
        {access === 'OWNER' && (
          <BarIcon label="การวิเคราะห์" onClick={() => ui().set({ overlay: 'analytics' })}>
            <BarChart3 aria-hidden className="size-5" />
          </BarIcon>
        )}
        <BarIcon label="ความคิดเห็น" active={commentsOpen} onClick={() => ui().set({ commentsOpen: !commentsOpen })}>
          <MessageCircle aria-hidden className="size-5" />
        </BarIcon>
        <PresentButton />
        <ShareMenu />
      </div>
    </header>
  );
}

export function BarIcon({ label, disabled, onClick, children, active }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx('inline-flex size-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-40', active ? 'bg-surface/30' : 'hover:bg-surface/15')}
    >
      {children}
    </button>
  );
}

function BarText({ label, onClick, icon, children, buttonRef, expanded }: { label: string; onClick: () => void; icon?: ReactNode; children: ReactNode; buttonRef?: React.Ref<HTMLButtonElement>; expanded?: boolean }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      title={label}
      aria-expanded={expanded}
      onClick={onClick}
      className={cx('inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-csmju-caption font-semibold', expanded ? 'bg-surface/25' : 'hover:bg-surface/15')}
    >
      {icon}
      <span className="hidden md:inline">{children}</span>
    </button>
  );
}

function TitleField() {
  const title = useEditor((s) => s.title);
  const designId = useEditor((s) => s.designId);
  const [value, setValue] = useState(title);
  const [syncedTitle, setSyncedTitle] = useState(title);
  const toast = useToast();
  const queryClient = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);

  // ชื่อเปลี่ยนจากที่อื่น (โหลดงาน · บันทึกสำเร็จ) — ปรับช่องให้ตรงระหว่าง render ไม่ใช้ effect
  if (syncedTitle !== title) {
    setSyncedTitle(title);
    setValue(title);
  }

  const rename = useMutation({
    mutationFn: (next: string) => api.patch(`/designs/${designId}`, { title: next }),
    onSuccess: (_data, next) => {
      useEditor.getState().setTitle(next);
      void queryClient.invalidateQueries({ queryKey: ['designs'] });
    },
    onError: (error) => {
      setValue(title);
      toast(errorMessage(error), 'error');
    },
  });

  const commit = () => {
    const next = value.trim();

    if (!next) setValue(title);
    else if (next !== title) rename.mutate(next.slice(0, 120));
  };

  return (
    <>
      <label htmlFor="design-title" className="sr-only">ชื่องาน</label>
      <input
        id="design-title"
        ref={ref}
        value={value}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') ref.current?.blur();
          if (e.key === 'Escape') {
            setValue(title);
            ref.current?.blur();
          }
        }}
        className="hidden min-h-11 w-40 min-w-0 rounded-xl border border-transparent bg-transparent px-2 text-right text-csmju-caption font-semibold text-on-inverse hover:border-surface/40 focus:border-surface focus:bg-surface/10 focus:text-left focus:outline-none md:block lg:w-64"
      />
    </>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'error') {
    return (
      <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-danger px-3 text-csmju-caption text-on-inverse hover:opacity-90">
        <CloudAlert aria-hidden className="size-5" /> บันทึกไม่สำเร็จ · ลองอีกครั้ง
      </button>
    );
  }

  return (
    <span role="status" title={status === 'saved' ? 'บันทึกการเปลี่ยนแปลงทั้งหมดแล้ว' : 'กำลังบันทึก'} className="inline-flex size-11 items-center justify-center">
      {status === 'saved' ? <CloudCheck aria-hidden className="size-5" /> : <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      <span className="sr-only">{status === 'saved' ? 'บันทึกแล้ว' : 'กำลังบันทึก…'}</span>
    </span>
  );
}

// ── เมนูไฟล์ ────────────────────────────────────────────────────────

interface FileItem {
  label: string;
  icon: ReactNode;
  hint?: string;
  shortcut?: string;
  checked?: boolean;
  danger?: boolean;
  onSelect?: () => void;
  submenu?: FileItem[];
}

function FileMenu({ onPublish }: { onPublish: () => void }) {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');
  const [flyout, setFlyout] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'SUGGESTION' | 'REPORT' | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const me = useMe();
  const toast = useToast();
  const router = useRouter();
  const openCreate = useOpenCreate();
  const create = useCreateDesign();
  const queryClient = useQueryClient();
  const designId = useEditor((s) => s.designId);
  const title = useEditor((s) => s.title);
  const designType = useEditor((s) => s.designType);
  const access = useEditor((s) => s.access);
  const baseWidth = useEditor((s) => s.baseWidth);
  const baseHeight = useEditor((s) => s.baseHeight);
  const ui = useEditorUi();
  const owner = access === 'OWNER';
  const canEdit = access === 'OWNER' || access === 'EDIT';
  const design = useQuery({
    queryKey: ['design-meta', designId],
    queryFn: () => api.get<Design>(`/designs/${designId}`),
    enabled: open && owner,
  });
  const close = () => {
    setOpen(false);
    setFlyout(null);
  };
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const patchDesign = async (body: Record<string, unknown>, done: string) => {
    try {
      await api.patch(`/designs/${designId}`, body);
      void queryClient.invalidateQueries({ queryKey: ['designs'] });
      void queryClient.invalidateQueries({ queryKey: ['design-meta', designId] });
      toast(done);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  const items: (FileItem | 'divider')[] = [
    { label: 'สร้างดีไซน์ใหม่', icon: <FilePlus aria-hidden className="size-4" />, onSelect: () => openCreate() },
    ...(canEdit ? [{ label: 'อัปโหลดไฟล์', icon: <Upload aria-hidden className="size-4" />, onSelect: () => ui.setPanel('uploads') }] : []),
    {
      label: 'ทำสำเนา',
      icon: <Copy aria-hidden className="size-4" />,
      onSelect: () => create.mutate({ title: `สำเนาของ ${title}`.slice(0, 120), copyFromDesignId: designId }, { onError: (error) => toast(errorMessage(error), 'error') }),
    },
    'divider',
    {
      label: 'การดูเพจ',
      icon: <Grid3x3 aria-hidden className="size-4" />,
      hint: ui.pagesView === 'grid' ? 'ตาราง' : ui.stripOpen ? 'ภาพย่อ' : 'หน้าเดียว',
      submenu: [
        { label: 'หน้าเดียว', icon: <span />, checked: ui.pagesView === 'strip' && !ui.stripOpen, onSelect: () => { ui.setPagesView('strip'); ui.set({ stripOpen: false }); } },
        { label: 'ภาพย่อ', icon: <span />, checked: ui.pagesView === 'strip' && ui.stripOpen, onSelect: () => { ui.setPagesView('strip'); ui.set({ stripOpen: true }); } },
        { label: 'ตาราง', icon: <span />, checked: ui.pagesView === 'grid', onSelect: () => ui.setPagesView('grid') },
      ],
    },
    {
      label: 'ไม้บรรทัดและเส้นแนวทาง',
      icon: <Ruler aria-hidden className="size-4" />,
      submenu: [
        { label: 'แสดงไม้บรรทัดและเส้นไกด์', icon: <span />, shortcut: 'Shift+R', checked: ui.rulers, onSelect: () => ui.toggleRulers() },
        { label: 'ลบเส้นไกด์ทั้งหมด', icon: <span />, onSelect: () => useEditorUi.setState({ guideLines: [] }) },
        { label: 'แสดงขอบหน้ากระดาษ', icon: <span />, checked: ui.margins, onSelect: () => ui.set({ margins: !ui.margins }) },
        { label: 'แสดงระยะตัดตกสำหรับงานพิมพ์', icon: <span />, checked: ui.bleed, onSelect: () => ui.set({ bleed: !ui.bleed }) },
      ],
    },
    'divider',
    ...(canEdit
      ? [
          {
            label: 'บันทึก',
            icon: <Save aria-hidden className="size-4" />,
            hint: 'เก็บเป็นเวอร์ชันใหม่ทันที',
            onSelect: () => void api.post(`/designs/${designId}/versions`).then(() => toast('บันทึกเวอร์ชันนี้แล้ว ดูได้ในประวัติเวอร์ชัน'), (error: unknown) => toast(errorMessage(error), 'error')),
          },
        ]
      : []),
    ...(owner
      ? [
          {
            label: design.data?.starred ? 'เลิกติดดาว' : 'ติดดาว',
            icon: <Star aria-hidden className={cx('size-4', design.data?.starred && 'fill-current')} />,
            onSelect: () => void patchDesign({ starred: !design.data?.starred }, design.data?.starred ? 'เลิกติดดาวแล้ว' : 'ติดดาวแล้ว — ดูได้ที่โปรเจกต์ → ติดดาวแล้ว'),
          },
          { label: 'ย้ายโฟลเดอร์', icon: <FolderInput aria-hidden className="size-4" />, onSelect: () => ui.set({ overlay: 'move' }) },
        ]
      : []),
    { label: 'ดาวน์โหลด', icon: <Download aria-hidden className="size-4" />, onSelect: () => window.dispatchEvent(new CustomEvent('csc-open-download')) },
    {
      label: 'พิมพ์',
      icon: <Printer aria-hidden className="size-4" />,
      submenu: [{ label: 'ใช้เครื่องพิมพ์ของฉัน', icon: <Printer aria-hidden className="size-4" />, shortcut: 'Ctrl+P', onSelect: () => void printDesign().catch(() => toast('เตรียมหน้าพิมพ์ไม่สำเร็จ', 'error')) }],
    },
    ...(canEdit ? [{ label: 'ประวัติเวอร์ชัน', icon: <History aria-hidden className="size-4" />, onSelect: () => ui.set({ overlay: 'versions' }) }] : []),
    ...(me.subsystemRole === 'EDITOR' || me.subsystemRole === 'ADMIN' ? [{ label: 'เผยแพร่เป็นเทมเพลต', icon: <LayoutTemplate aria-hidden className="size-4" />, onSelect: onPublish }] : []),
    ...(owner
      ? [
          {
            label: 'ย้ายไปที่ถังขยะ',
            icon: <Trash2 aria-hidden className="size-4" />,
            danger: true,
            onSelect: () => {
              if (!window.confirm(`ย้าย "${title}" ไปถังขยะ? กู้คืนได้ภายใน 30 วัน`)) return;
              void api.patch(`/designs/${designId}`, { trashed: true }).then(
                () => router.push('/trash'),
                (error: unknown) => toast(errorMessage(error), 'error'),
              );
            },
          },
        ]
      : []),
    'divider',
    {
      label: 'การตั้งค่า',
      icon: <Settings aria-hidden className="size-4" />,
      submenu: [{ label: 'แสดงแนวคอมเมนต์', icon: <span />, checked: ui.commentPins, onSelect: () => ui.set({ commentPins: !ui.commentPins }) }],
    },
    {
      label: 'การเข้าถึง',
      icon: <Accessibility aria-hidden className="size-4" />,
      submenu: [
        { label: 'ตรวจสอบการเข้าถึงดีไซน์', icon: <span />, onSelect: () => ui.set({ overlay: 'accessibility' }) },
        {
          label: 'ลดการเคลื่อนไหว',
          icon: <span />,
          checked: reduceMotion,
          onSelect: () => {
            const next = !reduceMotion;

            setReduceMotion(next);
            if (next) document.documentElement.setAttribute('data-motion', 'reduce');
            else document.documentElement.removeAttribute('data-motion');
          },
        },
      ],
    },
    ...(canEdit ? [{ label: 'ค้นหาและแทนที่ข้อความ', icon: <Replace aria-hidden className="size-4" />, shortcut: 'Ctrl+F', onSelect: () => ui.set({ overlay: 'find' }) }] : []),
    'divider',
    {
      label: 'ความช่วยเหลือ',
      icon: <HelpCircle aria-hidden className="size-4" />,
      submenu: [
        { label: 'คู่มือการใช้งาน', icon: <BookOpen aria-hidden className="size-4" />, onSelect: () => window.open('/help', '_blank') },
        { label: 'คีย์ลัด', icon: <Keyboard aria-hidden className="size-4" />, shortcut: 'Ctrl+/', onSelect: () => useEditorUi.getState().set({ overlay: 'shortcuts' }) },
        { label: 'แนะนำการปรับปรุง', icon: <Lightbulb aria-hidden className="size-4" />, onSelect: () => setFeedback('SUGGESTION') },
        // รายงานได้เฉพาะงานที่คนอื่นแชร์มา (งานของตัวเองไม่ต้องรายงาน)
        ...(!owner && designId ? [{ label: 'รายงานดีไซน์', icon: <Flag aria-hidden className="size-4" />, onSelect: () => setFeedback('REPORT') }] : []),
      ],
    },
  ];

  return (
    <>
      <BarText label="ไฟล์" buttonRef={anchorRef} expanded={open} onClick={() => setOpen((v) => !v)}>
        ไฟล์
      </BarText>
      <FloatingPanel open={open} menuRef={menuRef} label="เมนูไฟล์" className="w-80 rounded-2xl border border-line bg-surface py-2 text-ink shadow-csmju-lg">
        <div className="px-4 pt-1 pb-3">
          <p className="flex items-center gap-2 truncate text-csmju-body font-bold">
            {title} {owner && <Pencil aria-hidden className="size-4 shrink-0 text-muted" />}
          </p>
          <p className="text-csmju-caption text-muted">
            {designTypeLabel(designType).replace(/\s*\(.*\)$/, '')} • {access === 'OWNER' ? `โดย ${me.email.split('@')[0]}` : 'งานที่แชร์กับคุณ'}
          </p>
          <p className="text-csmju-caption text-muted tabular-nums">
            {baseWidth} px × {baseHeight} px
          </p>
        </div>
        <div className="max-h-popover overflow-y-auto">
          {items.map((item, index) =>
            item === 'divider' ? (
              <div key={`d${index}`} role="separator" className="my-1 h-px bg-line" />
            ) : (
              <div key={item.label} className="relative" onMouseEnter={() => setFlyout(item.submenu ? index : null)}>
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup={item.submenu ? 'menu' : undefined}
                  aria-expanded={item.submenu ? flyout === index : undefined}
                  onClick={item.submenu ? () => setFlyout(flyout === index ? null : index) : run(item.onSelect ?? (() => undefined))}
                  className={cx('flex min-h-10 w-full items-center gap-3 px-4 text-left text-csmju-caption hover:bg-surface-muted', item.danger && 'text-danger')}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.hint && <span className="max-w-32 truncate text-muted">{item.hint}</span>}
                  {item.shortcut && <span className="text-muted">{item.shortcut}</span>}
                  {item.submenu && <ChevronRight aria-hidden className="size-4" />}
                </button>
                {item.submenu && flyout === index && (
                  <div role="menu" aria-label={item.label} className="mt-0.5 mb-1 ml-8 rounded-xl border border-line bg-surface py-1 shadow-csmju-md">
                    {item.submenu.map((sub) => (
                      <button
                        key={sub.label}
                        type="button"
                        role={sub.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                        aria-checked={sub.checked}
                        onClick={run(sub.onSelect ?? (() => undefined))}
                        className="flex min-h-10 w-full items-center gap-3 px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted"
                      >
                        <span className="flex-1">{sub.label}</span>
                        {sub.shortcut && <span className="text-muted">{sub.shortcut}</span>}
                        {sub.checked && <Check aria-hidden className="size-4" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      </FloatingPanel>
      {feedback === 'SUGGESTION' && <FeedbackDialog kind="SUGGESTION" onClose={() => setFeedback(null)} />}
      {feedback === 'REPORT' && designId && <ReportDialog target={{ kind: 'DESIGN', id: designId, label: title }} onClose={() => setFeedback(null)} />}
    </>
  );
}

/// พิมพ์ทุกหน้าที่ไม่ได้ซ่อน: วาดเป็นภาพความละเอียดสูง แล้วสั่งพิมพ์จาก iframe (ขนาดกระดาษตามหน้า)
export async function printDesign() {
  const state = useEditor.getState();
  const base = { width: state.baseWidth, height: state.baseHeight };
  const pages = state.doc.pages.filter((p) => !p.hidden);
  const images: { src: string; w: number; h: number }[] = [];

  for (const page of pages) {
    const size = pageSizeOf(page, base);
    const canvas = await renderPageToCanvas(page, size, Math.min(2, 4000 / Math.max(size.width, size.height)), { background: page.background ? undefined : 'rgb(255 255 255)' });

    images.push({ src: canvas.toDataURL('image/jpeg', 0.92), w: size.width, h: size.height });
  }

  const frame = document.createElement('iframe');

  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  const first = images[0];

  doc.open();
  doc.write(
    `<!doctype html><html><head><title>${state.title.replace(/</g, '')}</title><style>@page{size:${first.w * 0.75}pt ${first.h * 0.75}pt;margin:0}body{margin:0}img{display:block;width:100vw;height:100vh;object-fit:contain;page-break-after:always}</style></head><body>${images
      .map((img) => `<img src="${img.src}">`)
      .join('')}</body></html>`,
  );
  doc.close();
  await new Promise((resolve) => setTimeout(resolve, 300));
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  setTimeout(() => frame.remove(), 60_000);
}

// ── โหมด ───────────────────────────────────────────────────────────

const MODES = [
  { key: 'edit', label: 'การแก้ไข', hint: 'ทำการเปลี่ยนแปลง', icon: Pencil },
  { key: 'comment', label: 'แสดงความคิดเห็น', hint: 'เพิ่มฟีดแบ็ก', icon: MessageSquareText },
  { key: 'view', label: 'ดู', hint: 'อ่านอย่างเดียว', icon: Eye },
] as const;

function ModeMenu() {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');
  const viewMode = useEditor((s) => s.viewMode);
  const access = useEditor((s) => s.access);
  const canEdit = access === 'OWNER' || access === 'EDIT';
  const current = MODES.find((m) => m.key === (canEdit ? viewMode : access === 'COMMENT' ? (viewMode === 'view' ? 'view' : 'comment') : 'view'))!;
  const options = MODES.filter((m) => (m.key === 'edit' ? canEdit : m.key === 'comment' ? access !== 'VIEW' : true));

  return (
    <>
      <BarText label="โหมด" buttonRef={anchorRef} expanded={open} onClick={() => setOpen((v) => !v)} icon={<current.icon aria-hidden className="size-4" />}>
        {current.label}
      </BarText>
      <FloatingPanel open={open} menuRef={menuRef} label="เลือกโหมด" className="w-64 rounded-xl border border-line bg-surface py-1 shadow-csmju-lg">
        {options.map((m) => (
          <button
            key={m.key}
            type="button"
            role="menuitemradio"
            aria-checked={current.key === m.key}
            onClick={() => {
              useEditor.getState().setViewMode(m.key);
              if (m.key === 'comment') useEditorUi.getState().set({ commentsOpen: true });
              setOpen(false);
            }}
            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-muted"
          >
            <m.icon aria-hidden className="size-5 text-ink" />
            <span className="flex-1">
              <span className="block text-csmju-caption font-semibold text-ink">{m.label}</span>
              <span className="block text-csmju-caption text-muted">{m.hint}</span>
            </span>
            {current.key === m.key && <Check aria-hidden className="size-5 text-ink" />}
          </button>
        ))}
      </FloatingPanel>
    </>
  );
}

// ── แชร์ + ดาวน์โหลด ───────────────────────────────────────────────

function ShareMenu() {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('end');
  const [view, setView] = useState<'main' | 'download'>('main');
  const access = useEditor((s) => s.access);

  // เปิดแผงดาวน์โหลดจากที่อื่น (เมนูไฟล์ → ดาวน์โหลด)
  useWindowEvent('csc-open-download', () => {
    setView('download');
    setOpen(true);
  });

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        onClick={() => {
          setView('main');
          setOpen((v) => !v);
        }}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-surface px-4 text-csmju-caption font-semibold text-ink hover:bg-surface-muted"
      >
        {access === 'OWNER' ? 'แชร์' : <><Download aria-hidden className="size-4" /> <span className="hidden sm:inline">ดาวน์โหลด</span></>}
      </button>
      <FloatingPanel open={open} menuRef={menuRef} role="dialog" label={view === 'download' ? 'ดาวน์โหลด' : 'แชร์ดีไซน์'} className="w-96 max-w-full rounded-2xl border border-line bg-surface shadow-csmju-lg">
        {view === 'download' || access !== 'OWNER' ? (
          <DownloadPanel onBack={access === 'OWNER' ? () => setView('main') : undefined} onDone={() => setOpen(false)} />
        ) : (
          <ShareMain onDownload={() => setView('download')} onClose={() => setOpen(false)} />
        )}
      </FloatingPanel>
    </>
  );
}

function useWindowEvent(name: string, handler: () => void) {
  const ref = useRef(handler);

  useEffect(() => {
    ref.current = handler;
  });

  useEffect(() => {
    const listener = () => ref.current();

    window.addEventListener(name, listener);

    return () => window.removeEventListener(name, listener);
  }, [name]);
}

const LINK_ROLES = [
  { key: 'EDIT', label: 'แก้ไขได้' },
  { key: 'COMMENT', label: 'แสดงความคิดเห็นได้' },
  { key: 'VIEW', label: 'ดูได้' },
] as const;

function ShareMain({ onDownload, onClose }: { onDownload: () => void; onClose: () => void }) {
  const me = useMe();
  const [settings, setSettings] = useState(false);
  const toast = useToast();
  const designId = useEditor((s) => s.designId);
  const linkAccess = useEditor((s) => s.linkAccess);
  const queryClient = useQueryClient();
  const stats = useQuery({ queryKey: ['design-stats', designId], queryFn: () => api.get<{ uniqueViewers: number }>(`/designs/${designId}/stats`) });
  const save = useMutation({
    mutationFn: (value: typeof linkAccess) => api.patch(`/designs/${designId}`, { linkAccess: value }),
    onMutate: (value) => {
      const previous = useEditor.getState().linkAccess;

      useEditor.setState({ linkAccess: value });

      return previous;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['designs'] }),
    onError: (error, _value, previous) => {
      if (previous) useEditor.setState({ linkAccess: previous });
      toast(errorMessage(error), 'error');
    },
  });
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/design/${designId}`;
  const copy = () =>
    void navigator.clipboard.writeText(link).then(
      () => toast(linkAccess === 'NONE' ? 'คัดลอกลิงก์แล้ว — ตอนนี้เปิดได้เฉพาะคุณ เปลี่ยนเป็น "ทุกคนที่มีลิงก์" เพื่อแชร์' : 'คัดลอกลิงก์แล้ว'),
      () => toast('คัดลอกไม่สำเร็จ', 'error'),
    );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-csmju-body font-bold text-ink">แชร์ดีไซน์</h2>
        <div className="flex items-center">
          <button type="button" onClick={() => useEditorUi.getState().set({ overlay: 'analytics' })} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-csmju-caption text-ink hover:bg-surface-muted">
            <BarChart3 aria-hidden className="size-4" /> ผู้เข้าชม {stats.data?.uniqueViewers ?? 0} คน
          </button>
          <button
            type="button"
            aria-expanded={settings}
            aria-label="การตั้งค่าการแชร์"
            title="การตั้งค่าการแชร์"
            onClick={() => setSettings((v) => !v)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-ink hover:bg-surface-muted"
          >
            <Settings aria-hidden className="size-4" />
          </button>
        </div>
      </div>
      {settings && (
        <div className="rounded-xl border border-line p-3">
          <p className="text-csmju-caption font-bold text-ink">ลบสิทธิ์เข้าถึงสำหรับทุกคน</p>
          <p className="mt-1 text-csmju-caption text-muted">ทุกคนที่เคยเปิดผ่านลิงก์จะเข้าไม่ได้อีก และดีไซน์กลับเป็นของคุณคนเดียว</p>
          <button
            type="button"
            disabled={linkAccess === 'NONE' || save.isPending}
            onClick={() =>
              save.mutate('NONE', {
                onSuccess: () => {
                  toast('ลบสิทธิ์เข้าถึงของทุกคนแล้ว');
                  setSettings(false);
                },
              })
            }
            className="mt-2 min-h-10 rounded-lg border border-line-strong px-3 text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
          >
            {linkAccess === 'NONE' ? 'ตอนนี้มีแค่คุณที่เข้าถึงได้' : 'ลบสิทธิ์เข้าถึง'}
          </button>
        </div>
      )}
      <div>
        <p className="mb-2 text-csmju-caption font-semibold text-ink">คนที่มีสิทธิ์เข้าถึง</p>
        <div className="flex items-center gap-2">
          <Avatar email={me.email} size="sm" />
          <span className="text-csmju-caption text-ink">{me.email.split('@')[0]} (คุณ) · เจ้าของ</span>
        </div>
        <p className="mt-2 text-csmju-caption text-muted">เพิ่มคนทีละคนยังทำไม่ได้ เพราะระบบกลางยังไม่เปิดให้ค้นรายชื่อ — แชร์ด้วยลิงก์แทน ผู้รับต้องเข้าสู่ระบบ CSMJU2030</p>
      </div>
      <div>
        <p className="mb-2 text-csmju-caption font-semibold text-ink">ระดับการเข้าถึง</p>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="share-scope">ใครเปิดได้</label>
          <div className="relative min-w-0 flex-1">
            {linkAccess === 'NONE' ? (
              <Lock aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink" />
            ) : (
              <Globe aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink" />
            )}
            <select
              id="share-scope"
              value={linkAccess === 'NONE' ? 'private' : 'link'}
              onChange={(e) => save.mutate(e.target.value === 'private' ? 'NONE' : 'VIEW')}
              className="min-h-11 w-full appearance-none rounded-xl border border-line-strong bg-surface pr-3 pl-9 text-csmju-caption text-ink"
            >
              <option value="private">คุณเท่านั้นที่เข้าถึงได้</option>
              <option value="link">ทุกคนที่มีลิงก์</option>
            </select>
          </div>
          {linkAccess !== 'NONE' && (
            <>
              <label className="sr-only" htmlFor="share-role">สิทธิ์ของผู้มีลิงก์</label>
              <select
                id="share-role"
                value={linkAccess}
                onChange={(e) => save.mutate(e.target.value as typeof linkAccess)}
                className="min-h-11 rounded-xl border border-line-strong bg-surface px-2 text-csmju-caption text-ink"
              >
                {LINK_ROLES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
      <button type="button" onClick={copy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover">
        <LinkIcon aria-hidden className="size-5" /> คัดลอกลิงก์
      </button>
      <div className="grid grid-cols-3 gap-2 border-t border-line pt-4">
        <QuickAction icon={<Download aria-hidden className="size-5" />} label="ดาวน์โหลด" tone="bg-surface-muted text-ink" onClick={onDownload} />
        <QuickAction icon={<Play aria-hidden className="size-5" />} label="พรีเซนต์" tone="bg-type-orange text-on-inverse" onClick={() => { onClose(); presentFromCurrent(); }} />
        <QuickAction icon={<History aria-hidden className="size-5" />} label="ประวัติเวอร์ชัน" tone="bg-type-blue text-on-inverse" onClick={() => { onClose(); useEditorUi.getState().set({ overlay: 'versions' }); }} />
      </div>
    </div>
  );
}

function QuickAction({ icon, label, tone, onClick }: { icon: ReactNode; label: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-csmju-caption text-ink hover:bg-surface-muted">
      <span className={cx('inline-flex size-11 items-center justify-center rounded-full', tone)}>{icon}</span>
      {label}
    </button>
  );
}

const FORMATS: { key: DownloadFormat; label: string; hint: string }[] = [
  { key: 'png', label: 'PNG', hint: 'ภาพคุณภาพสูง (แนะนำ)' },
  { key: 'jpeg', label: 'JPG', hint: 'ไฟล์ภาพเล็ก เหมาะส่งต่อ' },
  { key: 'pdf', label: 'PDF มาตรฐาน', hint: 'ไฟล์เอกสาร หลายหน้า' },
  { key: 'svg', label: 'SVG', hint: 'เวกเตอร์ แก้ต่อได้ในโปรแกรมอื่น' },
  { key: 'video', label: 'วิดีโอ', hint: 'วิดีโอคุณภาพสูง เล่นแอนิเมชัน' },
  { key: 'gif', label: 'GIF', hint: 'คลิปสั้น ไม่มีเสียง' },
  { key: 'pptx', label: 'PPTX', hint: 'เอกสาร Microsoft PowerPoint' },
];

const VIDEO_HEIGHTS = [480, 720, 1080] as const;

export function DownloadPanel({ onBack, onDone }: { onBack?: () => void; onDone: () => void }) {
  const pages = useEditor((s) => s.doc.pages);
  const pageIndex = useEditor((s) => s.pageIndex);
  const baseWidth = useEditor((s) => s.baseWidth);
  const baseHeight = useEditor((s) => s.baseHeight);
  const toast = useToast();
  const [format, setFormat] = useState<DownloadFormat>('png');
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(false);
  const [quality, setQuality] = useState(80);
  const [print, setPrint] = useState(false);
  const [separate, setSeparate] = useState(false);
  const [withNotes, setWithNotes] = useState(false);
  const [which, setWhich] = useState<'all' | 'current' | 'custom'>('all');
  const [range, setRange] = useState(`1-${pages.length}`);
  const [busy, setBusy] = useState(false);
  const [gifScale, setGifScale] = useState(0.5);
  const [videoHeight, setVideoHeight] = useState<(typeof VIDEO_HEIGHTS)[number]>(720);
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const videoType = format === 'video' ? videoMimeType() : null;
  const visible = pages.map((p, i) => (p.hidden ? -1 : i)).filter((i) => i >= 0);
  const chosen = which === 'all' ? visible : which === 'current' ? [pageIndex] : parsePageRange(range, pages.length);
  const toggle = (index: number) => {
    const set = new Set(chosen);

    if (set.has(index)) set.delete(index);
    else set.add(index);
    setWhich('custom');
    setRange(compactRange([...set].sort((a, b) => a - b)));
  };

  const seconds = chosen.reduce((sum, i) => sum + (pages[i] ? pageSeconds(pages[i]) : 0), 0);

  const run = async () => {
    setBusy(true);
    abortRef.current = new AbortController();
    if (format === 'gif' || format === 'video') setProgress(0);

    try {
      const state = useEditor.getState();
      const file = await downloadDesign(state.doc, { width: baseWidth, height: baseHeight }, state.title, {
        format,
        scale: format === 'pdf' ? (print ? 2 : 1) : format === 'gif' ? gifScale : format === 'pptx' ? 1 : scale,
        transparent,
        quality: quality / 100,
        pageIndexes: chosen,
        separate,
        withNotes,
        videoHeight,
        onProgress: setProgress,
        signal: abortRef.current.signal,
      });

      toast(`ดาวน์โหลด ${file} แล้ว`);
      onDone();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') toast('ยกเลิกการสร้างวิดีโอแล้ว');
      else toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex max-h-popover flex-col">
      <div className="flex items-center gap-1 px-3 pt-3">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="กลับไปที่แชร์" className="inline-flex size-9 items-center justify-center rounded-lg text-ink hover:bg-surface-muted">
            <ChevronLeft aria-hidden className="size-5" />
          </button>
        )}
        <h2 className="pl-1 text-csmju-body font-bold text-ink">ดาวน์โหลด</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        <label className="flex flex-col gap-1 text-csmju-caption font-semibold text-ink">
          ประเภทไฟล์
          <select value={format} onChange={(e) => setFormat(e.target.value as DownloadFormat)} className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 font-normal text-ink">
            {FORMATS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label} — {f.hint}
              </option>
            ))}
          </select>
        </label>
        {(format === 'png' || format === 'jpeg') && (
          <label className="flex flex-col gap-1 text-csmju-caption font-semibold text-ink">
            ขนาด × {scale}
            <input type="range" min={0.5} max={3} step={0.25} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="accent-primary" />
            <span className="font-normal text-muted tabular-nums">
              {Math.round(baseWidth * scale)} × {Math.round(baseHeight * scale)} px
            </span>
          </label>
        )}
        {format === 'jpeg' && (
          <label className="flex flex-col gap-1 text-csmju-caption font-semibold text-ink">
            คุณภาพ {quality}
            <input type="range" min={30} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="accent-primary" />
          </label>
        )}
        {format === 'png' && <ToggleRow label="พื้นหลังโปร่งใส" checked={transparent} onChange={setTransparent} />}
        {format === 'gif' && (
          <label className="flex flex-col gap-1 text-csmju-caption font-semibold text-ink">
            ขนาด × {gifScale}
            <input type="range" min={0.25} max={1} step={0.05} value={gifScale} onChange={(e) => setGifScale(Number(e.target.value))} className="accent-primary" />
            <span className="font-normal text-muted tabular-nums">
              {Math.round(baseWidth * gifScale)} × {Math.round(baseHeight * gifScale)} px · ยาว {seconds.toFixed(1)} วินาที · ไฟล์ใหญ่ขึ้นตามขนาด
            </span>
          </label>
        )}
        {format === 'video' && (
          <>
            <div>
              <p className="mb-2 text-csmju-caption font-semibold text-ink">คุณภาพ</p>
              <div role="radiogroup" aria-label="คุณภาพวิดีโอ" className="grid grid-cols-3 rounded-xl bg-surface-muted p-1">
                {VIDEO_HEIGHTS.map((h) => (
                  <button key={h} type="button" role="radio" aria-checked={videoHeight === h} onClick={() => setVideoHeight(h)} className={cx('min-h-10 rounded-lg text-csmju-caption', videoHeight === h ? 'bg-surface font-semibold text-ink shadow-csmju-sm' : 'text-body')}>
                    {h}p
                  </button>
                ))}
              </div>
            </div>
            <p className="text-csmju-caption text-muted">
              {videoType
                ? `ไฟล์ ${videoType.ext.toUpperCase()} ยาว ${seconds.toFixed(1)} วินาที (ตั้งเวลาแต่ละหน้าที่ปุ่ม ⏱) · ระบบเล่นงานจริงแล้วอัด จึงใช้เวลาเท่าความยาววิดีโอ`
                : 'เบราว์เซอร์นี้อัดวิดีโอไม่ได้ ลองใช้ Chrome หรือ Edge รุ่นล่าสุด'}
            </p>
          </>
        )}
        {format === 'pptx' && (
          <>
            <ToggleRow label="ใส่สมุดโน้ตเป็นโน้ตผู้บรรยาย" checked={withNotes} onChange={setWithNotes} />
            <p className="text-csmju-caption text-muted">แต่ละหน้าเป็นภาพเต็มสไลด์ เปิดได้ใน PowerPoint, Keynote และ Google Slides แต่แก้ข้อความทีละตัวไม่ได้</p>
          </>
        )}
        {format === 'pdf' && (
          <>
            <div role="radiogroup" aria-label="ค่าที่ตั้งไว้ล่วงหน้า" className="grid grid-cols-2 rounded-xl bg-surface-muted p-1">
              {(
                [
                  [false, 'ดิจิทัล'],
                  [true, 'งานพิมพ์'],
                ] as const
              ).map(([value, label]) => (
                <button key={label} type="button" role="radio" aria-checked={print === value} onClick={() => setPrint(value)} className={cx('min-h-10 rounded-lg text-csmju-caption', print === value ? 'bg-surface font-semibold text-ink shadow-csmju-sm' : 'text-body')}>
                  {label}
                </button>
              ))}
            </div>
            <ToggleRow label="ดาวน์โหลดหน้าเป็นไฟล์แยก" checked={separate} onChange={setSeparate} />
            <ToggleRow label="รวมสมุดโน้ต (ต่อท้ายแต่ละหน้า)" checked={withNotes} onChange={setWithNotes} />
            <p className="text-csmju-caption text-muted">ข้อความใน PDF เป็นภาพความละเอียดสูง ต้องการไฟล์เวกเตอร์ให้เลือก SVG</p>
          </>
        )}
        <div>
          <p className="mb-2 text-csmju-caption font-semibold text-ink">เลือกหน้า</p>
          <div role="radiogroup" aria-label="เลือกหน้า" className="grid grid-cols-3 rounded-xl bg-surface-muted p-1">
            {(
              [
                ['all', `ทั้งหมด (${visible.length})`],
                ['current', `หน้านี้ (${pageIndex + 1})`],
                ['custom', 'กำหนดเอง'],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={which === key} onClick={() => setWhich(key)} className={cx('min-h-10 rounded-lg px-1 text-csmju-caption', which === key ? 'bg-surface font-semibold text-ink shadow-csmju-sm' : 'text-body')}>
                {label}
              </button>
            ))}
          </div>
          {which === 'custom' && (
            <>
              <label className="mt-2 flex items-center gap-2 text-csmju-caption text-ink">
                <span className="sr-only">ช่วงหน้า</span>
                <input value={range} onChange={(e) => setRange(e.target.value)} placeholder="เช่น 1-3, 5" className="min-h-10 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-csmju-caption text-ink focus:border-primary focus:outline-none" />
                <button type="button" onClick={() => setRange('')} className="min-h-10 px-2 text-csmju-caption font-semibold text-primary">
                  ล้างทั้งหมด
                </button>
              </label>
              <ul className="mt-2 grid grid-cols-3 gap-2">
                {pages.map((page, index) => (
                  <li key={page.id}>
                    <button
                      type="button"
                      aria-pressed={chosen.includes(index)}
                      aria-label={`หน้า ${index + 1}`}
                      onClick={() => toggle(index)}
                      className={cx('relative block w-full overflow-hidden rounded-lg border-2 bg-surface-muted', chosen.includes(index) ? 'border-primary' : 'border-transparent')}
                    >
                      <PageThumb page={page} className="w-full" />
                      <span className="absolute bottom-0.5 left-1 rounded bg-surface/85 px-1 text-csmju-caption text-ink">{index + 1}</span>
                      {chosen.includes(index) && (
                        <Check aria-hidden className="absolute top-1 right-1 size-5 rounded-full bg-primary p-0.5 text-on-inverse" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {pages.some((p) => p.hidden) && which === 'all' && <p className="mt-2 text-csmju-caption text-muted">หน้าที่ซ่อนไว้ไม่รวมในไฟล์</p>}
        </div>
      </div>
      <div className="border-t border-line p-3">
        {progress !== null && (
          <div className="mb-3">
            <div role="progressbar" aria-label="ความคืบหน้า" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            {format === 'video' && (
              <button type="button" onClick={() => abortRef.current?.abort()} className="mt-2 min-h-10 w-full rounded-lg text-csmju-caption font-semibold text-ink hover:bg-surface-muted">
                ยกเลิก
              </button>
            )}
          </div>
        )}
        <button type="button" disabled={busy || chosen.length === 0 || (format === 'video' && !videoType)} onClick={() => void run()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover disabled:opacity-50">
          {busy ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : <Download aria-hidden className="size-5" />}
          {busy ? (progress !== null ? `กำลังสร้างไฟล์… ${Math.round(progress * 100)}%` : 'กำลังเตรียมไฟล์…') : 'ดาวน์โหลด'}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 text-csmju-caption text-ink">
      {label}
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-primary" />
    </label>
  );
}

function compactRange(list: number[]): string {
  const parts: string[] = [];
  let start = -1;
  let prev = -2;

  for (const i of [...list, -10]) {
    if (i === prev + 1) {
      prev = i;
      continue;
    }

    if (start >= 0) parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
    start = i;
    prev = i;
  }

  return parts.join(', ');
}

