'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy, Eye, Files, Layers, UserPlus,
  ChevronLeft, CloudAlert, CloudCheck, Download, LayoutTemplate, LoaderCircle, Maximize, Redo2, Undo2,
  ZoomIn, ZoomOut,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ErrorState, IconButton, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { api, ApiError } from '@/lib/csmju/api';
import { useMe } from '@/lib/csmju/session';
import { designTypeLabel } from '@/lib/design-types';
import { useEditor } from '@/lib/editor/store';
import { normalizeDocument } from '@/lib/editor/types';
import type { Design } from '@/lib/types';
import { useCreateDesign } from '@/lib/create-design';
import { ShareDialog } from '@/components/designs/design-actions';
import { ExportDialog, PublishTemplateDialog } from './dialogs';
import { PANEL_LABELS, PanelContent, RAIL, StarredIcon, type PanelKey, type RailKey } from './panels';
import { PropertiesBar } from './properties-bar';
import { SelectionToolbar } from './selection-toolbar';
import { Stage, clampZoom, fitToScreen } from './stage';
import { ToolsPalette } from './tools-palette';
import { useAutosave, type SaveStatus } from './use-autosave';
import { useShortcuts } from './use-shortcuts';

export function EditorScreen({ id }: { id: string }) {
  // โหลดงานเข้า store ตอนได้ข้อมูล (ครั้งเดียวต่อการเปิดหน้า) — ไม่ refetch ระหว่างแก้
  // เพราะข้อมูลจากเซิร์ฟเวอร์จะทับสิ่งที่ผู้ใช้เพิ่งแก้แต่ยังไม่ได้บันทึก
  const query = useQuery({
    queryKey: ['design', id],
    queryFn: async () => {
      const d = await api.get<Design>(`/designs/${id}`);

      useEditor.getState().load(
        { designId: d.id, title: d.title, designType: d.designType, width: d.width, height: d.height, access: d.access, linkAccess: d.linkAccess },
        normalizeDocument(d.document),
      );

      return d;
    },
    staleTime: Infinity,
    gcTime: 0,
  });

  if (query.isLoading) {
    return <div className="grid min-h-dvh place-items-center"><Spinner label="กำลังเปิดงาน…" /></div>;
  }

  if (query.isError) {
    const missing = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400);

    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <div className="w-full max-w-md">
          <ErrorState
            message={missing ? 'ไม่พบงานนี้ — อาจถูกลบถาวรแล้ว หรือเป็นงานของคนอื่น' : errorMessage(query.error)}
            onRetry={missing ? undefined : () => void query.refetch()}
          />
          <Link href="/" className="mt-4 inline-flex min-h-11 w-full items-center justify-center text-csmju-body font-medium text-primary hover:underline">
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    );
  }

  return <EditorLayout needsThumbnail={!query.data?.thumbnail} />;
}

function EditorLayout({ needsThumbnail }: { needsThumbnail: boolean }) {
  // จอเล็กเริ่มโดยพับแผงไว้ ให้เห็นผืนผ้าใบเต็มที่ (หน้านี้ render ฝั่ง client เท่านั้น — อยู่หลัง SessionProvider)
  const [panel, setPanelState] = useState<PanelKey | null>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? null : 'templates',
  );
  const [toolsOpen, setToolsOpen] = useState(false);

  // เปิดแผงอื่น = ปิดแถบเครื่องมือและเลิกโหมดวาด (แบบ Canva ที่แสดงทีละอย่าง)
  const setPanel = (next: PanelKey | null) => {
    setPanelState(next);
    setToolsOpen(false);
    useEditor.getState().setTool({ mode: 'select' });
  };
  const openTools = () => {
    setPanelState(null);
    setToolsOpen(true);
  };
  const closeTools = () => {
    setToolsOpen(false);
    useEditor.getState().setTool({ mode: 'select' });
  };
  const onRail = (key: RailKey) => {
    if (key === 'tools') {
      if (toolsOpen) closeTools();
      else openTools();
      return;
    }

    setPanel(panel === key ? null : key);
  };
  const railActive = (key: RailKey | 'starred') =>
    key === 'tools' ? toolsOpen || panel === 'signature' : panel === key;
  const [dialog, setDialog] = useState<'export' | 'publish' | 'share' | null>(null);
  const readOnly = useEditor((s) => s.access === 'VIEW');
  const { status, retry } = useAutosave(needsThumbnail && !readOnly);

  useShortcuts();

  if (readOnly) {
    return (
      <div className="flex h-dvh flex-col bg-stage">
        <TopBar status="saved" readOnly onRetry={retry} onExport={() => setDialog('export')} onPublish={() => setDialog('publish')} onShare={() => setDialog('share')} />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Stage />
        </div>
        <ZoomBar />
        <ExportDialog open={dialog === 'export'} onClose={() => setDialog(null)} />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-stage">
      <TopBar status={status} onRetry={retry} onExport={() => setDialog('export')} onPublish={() => setDialog('publish')} onShare={() => setDialog('share')} />
      <div className="flex min-h-0 flex-1">
        {/* แถบซ้าย (จอใหญ่) แบบ Canva: ไอคอน + ป้าย · ที่เลือกอยู่เป็นกล่องขาวไอคอนสี · "ติดดาวแล้ว" ปักล่างสุด */}
        <nav aria-label="แผงเครื่องมือ" className="hidden w-22 shrink-0 flex-col items-center gap-1 overflow-y-auto bg-stage py-3 md:flex">
          {RAIL.map((item) => (
            <RailButton key={item.key} label={item.label} icon={item.icon} tone={item.tone} active={railActive(item.key)} onClick={() => onRail(item.key)} />
          ))}
          <span aria-hidden className="mt-auto mb-1 h-px w-8 bg-line-strong" />
          <RailButton label="ติดดาวแล้ว" icon={StarredIcon} tone="text-type-orange" active={railActive('starred')} onClick={() => setPanel(panel === 'starred' ? null : 'starred')} />
        </nav>
        {panel && (
          <aside key={panel} aria-label={PANEL_LABELS[panel]} className="csmju-slide-in relative hidden w-100 shrink-0 bg-surface shadow-csmju-sm md:flex md:flex-col">
            <PanelContent panel={panel} onNavigate={setPanel} onBackToTools={openTools} onClose={() => setPanel(null)} />
            {/* ปุ่มพับแผงตรงขอบแบบ Canva */}
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label="พับแผง"
              title="พับแผง"
              className="absolute top-1/2 -right-4 z-10 flex h-20 w-4 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-line bg-surface text-ink shadow-csmju-sm hover:bg-surface-muted"
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
          </aside>
        )}

        <div className="relative flex min-w-0 flex-1 flex-col">
          <PropertiesBar />
          <div className="relative flex min-h-0 flex-1 flex-col">
            <Stage />
            <SelectionToolbar />
            {toolsOpen && <ToolsPalette onClose={closeTools} onSignature={() => setPanel('signature')} />}
          </div>
          <ZoomBar panel={panel} onPanel={setPanel} />
        </div>
      </div>

      {/* มือถือ: แผงเลื่อนขึ้นจากล่าง + แถบแท็บล่าง */}
      <MobileSheet panel={panel} onPanel={setPanel} onRail={onRail} railActive={railActive} onBackToTools={openTools} />

      <ExportDialog open={dialog === 'export'} onClose={() => setDialog(null)} />
      {dialog === 'publish' && <PublishTemplateDialog open onClose={() => setDialog(null)} />}
      {dialog === 'share' && <EditorShareDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

/// ปุ่มบนแถบซ้าย — ไอคอนในกล่องขาวมีเงาเมื่อเลือก (แบบ Canva)
function RailButton({
  label,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  tone: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="group flex w-20 flex-col items-center gap-1 py-1.5 text-csmju-caption text-ink"
    >
      <span
        className={cx(
          'flex size-11 items-center justify-center rounded-xl transition-all',
          active ? cx('bg-surface shadow-csmju-md', tone) : 'text-ink group-hover:bg-surface/70',
        )}
      >
        <Icon aria-hidden className="csmju-wiggle size-6" />
      </span>
      <span className={cx('leading-tight', active && 'font-bold')}>{label}</span>
    </button>
  );
}

/// แชร์จากหน้าแก้ไข — อัปเดตสถานะการแชร์ใน store ด้วยเมื่อปิด
function EditorShareDialog({ onClose }: { onClose: () => void }) {
  const designId = useEditor((s) => s.designId);
  const title = useEditor((s) => s.title);
  const linkAccess = useEditor((s) => s.linkAccess);
  const queryClient = useQueryClient();

  return (
    <ShareDialog
      design={{ id: designId, title, linkAccess }}
      onClose={() => {
        void queryClient.fetchQuery({ queryKey: ['design-share', designId], queryFn: () => api.get<Design>(`/designs/${designId}`) }).then((d) =>
          useEditor.setState({ linkAccess: d.linkAccess }),
        );
        onClose();
      }}
    />
  );
}

function TopBar({
  status,
  readOnly = false,
  onRetry,
  onExport,
  onPublish,
  onShare,
}: {
  status: SaveStatus;
  readOnly?: boolean;
  onRetry: () => void;
  onExport: () => void;
  onPublish: () => void;
  onShare: () => void;
}) {
  const me = useMe();
  const access = useEditor((s) => s.access);
  const designId = useEditor((s) => s.designId);
  const title = useEditor((s) => s.title);
  const create = useCreateDesign();
  const toast = useToast();
  const canPublish = !readOnly && (me.subsystemRole === 'EDITOR' || me.subsystemRole === 'ADMIN');
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const designType = useEditor((s) => s.designType);

  return (
    <header className="csmju-brandbar flex min-h-14 items-center gap-1 px-2 text-on-inverse">
      <Link href="/" className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-csmju-caption font-semibold hover:bg-surface/15">
        <ChevronLeft aria-hidden className="size-5" />
        <span className="hidden sm:inline">หน้าแรก</span>
      </Link>
      <span className="hidden rounded-xl px-3 py-2 text-csmju-caption lg:inline">{designTypeLabel(designType)}</span>
      <span aria-hidden className="mx-1 hidden h-6 w-px bg-surface/30 sm:block" />
      {readOnly ? (
        <span className="inline-flex min-h-9 items-center gap-1 rounded-full bg-surface/20 px-3 text-csmju-caption font-semibold">
          <Eye aria-hidden className="size-4" /> ดูอย่างเดียว
        </span>
      ) : (
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
      <div className="ml-auto flex items-center gap-2">
        {access === 'OWNER' ? <TitleField /> : <span className="max-w-56 truncate px-2 text-csmju-caption font-semibold">{title}</span>}
        {access !== 'OWNER' && (
          <button
            type="button"
            onClick={() =>
              create.mutate({ title: `สำเนาของ ${title}`.slice(0, 120), copyFromDesignId: designId }, { onError: (error) => toast(errorMessage(error), 'error') })
            }
            className="hidden min-h-11 items-center gap-2 rounded-xl bg-surface/15 px-4 text-csmju-caption font-semibold hover:bg-surface/25 sm:inline-flex"
          >
            <Copy aria-hidden className="size-4" /> ทำสำเนาเป็นของฉัน
          </button>
        )}
        {access === 'OWNER' && (
          <button type="button" onClick={onShare} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface/15 px-4 text-csmju-caption font-semibold hover:bg-surface/25">
            <UserPlus aria-hidden className="size-4" /> <span className="hidden sm:inline">แชร์</span>
          </button>
        )}
        {canPublish && (
          <button type="button" onClick={onPublish} className="hidden min-h-11 items-center gap-2 rounded-xl bg-surface/15 px-4 text-csmju-caption font-semibold hover:bg-surface/25 sm:inline-flex">
            <LayoutTemplate aria-hidden className="size-4" /> เผยแพร่เป็นเทมเพลต
          </button>
        )}
        <button type="button" onClick={onExport} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface px-4 text-csmju-caption font-semibold text-ink hover:bg-surface-muted">
          <Download aria-hidden className="size-4" /> <span className="hidden sm:inline">ดาวน์โหลด</span>
        </button>
      </div>
    </header>
  );
}

/// ปุ่มไอคอนบนแถบไล่สี (ไอคอนขาว พื้นโปร่ง)
function BarIcon({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-surface/15 disabled:opacity-40"
    >
      {children}
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
        className="min-h-11 w-32 min-w-0 rounded-xl border border-transparent bg-transparent px-2 text-right text-csmju-caption font-semibold text-on-inverse hover:border-surface/40 focus:border-surface focus:bg-surface/10 focus:text-left focus:outline-none sm:w-56"
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
    <span role="status" className="inline-flex items-center gap-1 px-2 text-csmju-caption text-on-inverse">
      {status === 'saved' ? <CloudCheck aria-hidden className="size-5" /> : <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      <span className="hidden sm:inline">{status === 'saved' ? 'บันทึกแล้ว' : 'กำลังบันทึก…'}</span>
    </span>
  );
}

function ZoomBar({ panel, onPanel }: { panel?: PanelKey | null; onPanel?: (panel: PanelKey | null) => void } = {}) {
  const zoom = useEditor((s) => s.zoom);
  const pageIndex = useEditor((s) => s.pageIndex);
  const pageCount = useEditor((s) => s.doc.pages.length);

  const zoomBy = (factor: number) => {
    const state = useEditor.getState();
    const stage = document.querySelector('canvas[aria-label^="ผืนผ้าใบ"]') as HTMLCanvasElement | null;
    const w = stage?.clientWidth ?? 800;
    const h = stage?.clientHeight ?? 600;
    const next = clampZoom(state.zoom * factor);
    const world = { x: (w / 2 - state.pan.x) / state.zoom, y: (h / 2 - state.pan.y) / state.zoom };

    state.setViewport(next, { x: w / 2 - world.x * next, y: h / 2 - world.y * next });
  };

  const fit = () => {
    const stage = document.querySelector('canvas[aria-label^="ผืนผ้าใบ"]') as HTMLCanvasElement | null;

    if (stage) fitToScreen({ width: stage.clientWidth, height: stage.clientHeight });
  };

  const setZoomPercent = (percent: number) => zoomBy(clampZoom(percent / 100) / useEditor.getState().zoom);

  return (
    <div className="mb-16 flex min-h-12 items-center justify-between gap-2 border-t border-line bg-surface px-3 md:mb-0">
      <div className="flex items-center gap-1">
        <IconButton label="หน้าก่อนหน้า" disabled={pageIndex === 0} onClick={() => useEditor.getState().setPageIndex(pageIndex - 1)}>
          <ChevronLeft aria-hidden className="size-5" />
        </IconButton>
        <span className="text-csmju-caption text-ink tabular-nums">
          หน้า {pageIndex + 1} / {pageCount}
        </span>
        <IconButton label="หน้าถัดไป" disabled={pageIndex >= pageCount - 1} onClick={() => useEditor.getState().setPageIndex(pageIndex + 1)}>
          <ChevronLeft aria-hidden className="size-5 rotate-180" />
        </IconButton>
        <button
          type="button"
          onClick={() => useEditor.getState().addPage()}
          className="ml-1 hidden min-h-11 items-center gap-1 rounded-xl px-3 text-csmju-caption font-medium text-ink hover:bg-surface-muted sm:inline-flex"
        >
          + เพิ่มหน้า
        </button>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="zoom-slider" className="sr-only">ระดับการซูม</label>
        <input
          id="zoom-slider"
          type="range"
          min={10}
          max={400}
          step={1}
          value={Math.round(zoom * 100)}
          onChange={(event) => setZoomPercent(Number(event.target.value))}
          className="hidden w-36 accent-primary sm:block"
        />
        <button
          type="button"
          onClick={fit}
          title="พอดีจอ"
          className="min-h-11 min-w-16 rounded-xl px-2 text-csmju-caption font-medium text-ink tabular-nums hover:bg-surface-muted"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="ซูมออก" onClick={() => zoomBy(1 / 1.2)} className="sm:hidden">
          <ZoomOut aria-hidden className="size-5" />
        </IconButton>
        <IconButton label="ซูมเข้า" onClick={() => zoomBy(1.2)} className="sm:hidden">
          <ZoomIn aria-hidden className="size-5" />
        </IconButton>
        {onPanel && (
          <>
            <button
              type="button"
              aria-pressed={panel === 'layers'}
              onClick={() => onPanel(panel === 'layers' ? null : 'layers')}
              className={cx('hidden min-h-11 items-center gap-1 rounded-xl px-3 text-csmju-caption font-medium text-ink sm:inline-flex', panel === 'layers' ? 'bg-primary-soft' : 'hover:bg-surface-muted')}
            >
              <Layers aria-hidden className="size-5" /> เลเยอร์
            </button>
            <button
              type="button"
              aria-pressed={panel === 'pages'}
              onClick={() => onPanel(panel === 'pages' ? null : 'pages')}
              className={cx('inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-csmju-caption font-medium text-ink', panel === 'pages' ? 'bg-primary-soft' : 'hover:bg-surface-muted')}
            >
              <Files aria-hidden className="size-5" /> หน้า
            </button>
          </>
        )}
        <IconButton label="พอดีจอ" onClick={fit}>
          <Maximize aria-hidden className="size-5" />
        </IconButton>
      </div>
    </div>
  );
}

function MobileSheet({
  panel,
  onPanel,
  onRail,
  railActive,
  onBackToTools,
}: {
  panel: PanelKey | null;
  onPanel: (panel: PanelKey | null) => void;
  onRail: (key: RailKey) => void;
  railActive: (key: RailKey) => boolean;
  onBackToTools: () => void;
}) {
  return (
    <div className="md:hidden">
      {panel && (
        <section
          key={panel}
          aria-label={PANEL_LABELS[panel]}
          className="csmju-slide-in fixed inset-x-0 bottom-16 z-30 flex h-sheet max-h-sheet flex-col rounded-t-3xl border-t border-line bg-surface shadow-csmju-lg"
        >
          <div className="flex shrink-0 items-center justify-between px-4 pt-2">
            <span className="mx-auto h-1.5 w-12 rounded-full bg-line-strong" aria-hidden />
          </div>
          <div className="flex shrink-0 justify-end px-2">
            <button type="button" onClick={() => onPanel(null)} className="min-h-11 px-3 text-csmju-caption font-medium text-primary">
              พับเก็บ
            </button>
          </div>
          <PanelContent panel={panel} onNavigate={onPanel} onBackToTools={onBackToTools} onClose={() => onPanel(null)} />
        </section>
      )}
      <nav aria-label="แผงเครื่องมือ (มือถือ)" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface">
        {RAIL.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={railActive(item.key)}
            onClick={() => onRail(item.key)}
            className={cx(
              'flex min-h-16 flex-1 flex-col items-center justify-center text-csmju-caption',
              railActive(item.key) ? cx('font-semibold', item.tone) : 'text-body',
            )}
          >
            <item.icon aria-hidden className="size-5" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
