'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, CloudAlert, CloudCheck, Download, LayoutTemplate, LoaderCircle, Maximize, Redo2, Undo2,
  ZoomIn, ZoomOut,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button, ErrorState, IconButton, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { api, ApiError } from '@/lib/csmju/api';
import { useMe } from '@/lib/csmju/session';
import { designTypeLabel } from '@/lib/design-types';
import { useEditor } from '@/lib/editor/store';
import { normalizeDocument } from '@/lib/editor/types';
import type { Design } from '@/lib/types';
import { ExportDialog, PublishTemplateDialog } from './dialogs';
import { PANELS, PanelContent, type PanelKey } from './panels';
import { PropertiesBar } from './properties-bar';
import { Stage, clampZoom, fitToScreen } from './stage';
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
        { designId: d.id, title: d.title, designType: d.designType, width: d.width, height: d.height },
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
  const [panel, setPanel] = useState<PanelKey | null>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? null : 'text',
  );
  const [dialog, setDialog] = useState<'export' | 'publish' | null>(null);
  const { status, retry } = useAutosave(needsThumbnail);

  useShortcuts();

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <TopBar status={status} onRetry={retry} onExport={() => setDialog('export')} onPublish={() => setDialog('publish')} />
      <div className="flex min-h-0 flex-1">
        {/* แถบแท็บซ้าย (จอใหญ่) */}
        <nav aria-label="เครื่องมือ" className="hidden w-20 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-2 md:flex">
          {PANELS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={panel === p.key}
              onClick={() => setPanel(panel === p.key ? null : p.key)}
              className={cx(
                'flex w-16 flex-col items-center gap-0.5 rounded-xl py-2 text-csmju-caption',
                panel === p.key ? 'bg-primary-soft font-semibold text-primary' : 'text-body hover:bg-surface-muted',
              )}
            >
              <p.icon aria-hidden className="size-6" />
              {p.label}
            </button>
          ))}
        </nav>
        {panel && (
          <aside aria-label={PANELS.find((p) => p.key === panel)?.label} className="hidden w-80 shrink-0 overflow-y-auto border-r border-line bg-surface p-4 md:block">
            <h2 className="mb-3 text-csmju-h3 font-semibold text-ink">{PANELS.find((p) => p.key === panel)?.label}</h2>
            <PanelContent panel={panel} />
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <PropertiesBar />
          <Stage />
          <ZoomBar />
        </div>
      </div>

      {/* มือถือ: แผงเลื่อนขึ้นจากล่าง + แถบแท็บล่าง */}
      <MobileSheet panel={panel} onPanel={setPanel} />

      <ExportDialog open={dialog === 'export'} onClose={() => setDialog(null)} />
      {dialog === 'publish' && <PublishTemplateDialog open onClose={() => setDialog(null)} />}
    </div>
  );
}

function TopBar({
  status,
  onRetry,
  onExport,
  onPublish,
}: {
  status: SaveStatus;
  onRetry: () => void;
  onExport: () => void;
  onPublish: () => void;
}) {
  const me = useMe();
  const canPublish = me.subsystemRole === 'EDITOR' || me.subsystemRole === 'ADMIN';
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const designType = useEditor((s) => s.designType);

  return (
    <header className="flex min-h-14 items-center gap-1 border-b border-line bg-surface px-2">
      <Link href="/" aria-label="กลับหน้าหลัก" title="กลับหน้าหลัก" className="inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-primary-soft">
        <ChevronLeft aria-hidden className="size-6" />
      </Link>
      <TitleField />
      <span className="hidden text-csmju-caption text-muted lg:inline">{designTypeLabel(designType)}</span>
      <SaveIndicator status={status} onRetry={onRetry} />
      <div className="ml-auto flex items-center gap-1">
        <IconButton label="ย้อนกลับ (Ctrl+Z)" disabled={!canUndo} onClick={() => useEditor.getState().undo()}>
          <Undo2 aria-hidden className="size-5" />
        </IconButton>
        <IconButton label="ทำซ้ำ (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useEditor.getState().redo()}>
          <Redo2 aria-hidden className="size-5" />
        </IconButton>
        {canPublish && (
          <Button variant="ghost" onClick={onPublish} className="hidden sm:inline-flex">
            <LayoutTemplate aria-hidden className="size-4" /> เผยแพร่เป็นเทมเพลต
          </Button>
        )}
        <Button variant="primary" onClick={onExport}>
          <Download aria-hidden className="size-4" /> <span className="hidden sm:inline">ดาวน์โหลด</span>
        </Button>
      </div>
    </header>
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
        className="min-h-11 w-36 min-w-0 rounded-xl border border-transparent bg-transparent px-2 text-csmju-body font-semibold text-ink hover:border-line focus:border-primary focus:outline-none sm:w-64"
      />
    </>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'error') {
    return (
      <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-csmju-caption text-danger hover:bg-danger-bg">
        <CloudAlert aria-hidden className="size-5" /> บันทึกไม่สำเร็จ · ลองอีกครั้ง
      </button>
    );
  }

  return (
    <span role="status" className="inline-flex items-center gap-1 px-2 text-csmju-caption text-muted">
      {status === 'saved' ? <CloudCheck aria-hidden className="size-5" /> : <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      <span className="hidden sm:inline">{status === 'saved' ? 'บันทึกแล้ว' : 'กำลังบันทึก…'}</span>
    </span>
  );
}

function ZoomBar() {
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

  return (
    <div className="mb-16 flex min-h-12 items-center justify-between gap-2 border-t border-line bg-surface px-2 md:mb-0">
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
      </div>
      <div className="flex items-center gap-1">
        <IconButton label="ซูมออก" onClick={() => zoomBy(1 / 1.2)}>
          <ZoomOut aria-hidden className="size-5" />
        </IconButton>
        <span className="w-14 text-center text-csmju-caption text-ink tabular-nums">{Math.round(zoom * 100)}%</span>
        <IconButton label="ซูมเข้า" onClick={() => zoomBy(1.2)}>
          <ZoomIn aria-hidden className="size-5" />
        </IconButton>
        <IconButton label="พอดีจอ" onClick={fit}>
          <Maximize aria-hidden className="size-5" />
        </IconButton>
      </div>
    </div>
  );
}

function MobileSheet({ panel, onPanel }: { panel: PanelKey | null; onPanel: (panel: PanelKey | null) => void }) {
  return (
    <div className="md:hidden">
      {panel && (
        <section
          aria-label={PANELS.find((p) => p.key === panel)?.label}
          className="fixed inset-x-0 bottom-16 z-30 max-h-[55dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-4 shadow-csmju-lg"
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line-strong" aria-hidden />
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-csmju-h3 font-semibold text-ink">{PANELS.find((p) => p.key === panel)?.label}</h2>
            <button type="button" onClick={() => onPanel(null)} className="min-h-11 px-3 text-csmju-caption font-medium text-primary">
              พับเก็บ
            </button>
          </div>
          <PanelContent panel={panel} />
        </section>
      )}
      <nav aria-label="เครื่องมือ (มือถือ)" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface">
        {PANELS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={panel === p.key}
            onClick={() => onPanel(panel === p.key ? null : p.key)}
            className={cx(
              'flex min-h-16 flex-1 flex-col items-center justify-center text-csmju-caption',
              panel === p.key ? 'font-semibold text-primary' : 'text-body',
            )}
          >
            <p.icon aria-hidden className="size-5" />
            {p.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
