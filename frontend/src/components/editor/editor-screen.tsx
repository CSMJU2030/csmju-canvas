'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Wallpaper } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorState, Spinner, cx, errorMessage } from '@/components/csmju/primitives';
import { api, ApiError } from '@/lib/csmju/api';
import { canEditDoc, useEditor } from '@/lib/editor/store';
import { useEditorUi } from '@/lib/editor/ui-store';
import { normalizeDocument } from '@/lib/editor/types';
import type { Design } from '@/lib/types';
import { PublishTemplateDialog } from './dialogs';
import { CommentPins, CommentsPanel } from './comments';
import { EditorDialogs } from './editor-dialogs';
import { Rulers } from './rulers';
import { TopBar } from './top-bar';
import { VersionHistory } from './versions';
import { PANEL_LABELS, PanelContent, RAIL, StarredIcon, type PanelKey, type RailKey } from './panels';
import { ContextMenu } from './context-menu';
import { ContextToolbar } from './context-toolbar';
import { SelectionToolbar } from './selection-toolbar';
import { Stage } from './stage';
import { ToolsPalette } from './tools-palette';
import { BottomBar, PagesGrid } from './page-strip';
import { Presenter, presentFromCurrent } from './presenter';
import { TimerWidget, stopTimerAudio } from './timer';
import { useAutosave } from './use-autosave';
import { usePasteAndDropImport } from './file-import';
import { ImportHintBar } from './image-sources-panel';
import { useShortcuts } from './use-shortcuts';
import { SourcesLayer } from './sources-window';

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

      // ลิงก์ "คัดลอกลิงก์ไปที่หน้านี้" (?page=3) เปิดที่หน้านั้น
      const wanted = Number(new URLSearchParams(window.location.search).get('page'));
      const pages = useEditor.getState().doc.pages.length;

      if (Number.isInteger(wanted) && wanted >= 1 && wanted <= pages) useEditor.getState().setPageIndex(wanted - 1);

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
  const panel = useEditorUi((s) => s.panel);
  const toolsOpen = useEditorUi((s) => s.toolsOpen);
  const colorTarget = useEditorUi((s) => s.colorTarget);

  // จอเล็กเริ่มโดยพับแผงไว้ ให้เห็นผืนผ้าใบเต็มที่ · จอใหญ่เปิดแผงเทมเพลตแบบ Canva
  useEffect(() => {
    useEditorUi.getState().setPanel(window.matchMedia('(max-width: 767px)').matches ? null : 'templates');

    return () => {
      useEditorUi.getState().setPanel(null);
      stopTimerAudio();
    };
  }, []);

  // Ctrl+Alt+P = พรีเซนต์เต็มจอ
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        presentFromCurrent();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pagesView = useEditorUi((s) => s.pagesView);

  // เปิดแผงอื่น = ปิดแถบเครื่องมือและเลิกโหมดวาด (แบบ Canva ที่แสดงทีละอย่าง)
  const setPanel = (next: PanelKey | null) => {
    useEditorUi.getState().setPanel(next);
    useEditor.getState().setTool({ mode: 'select' });
  };
  const openTools = () => useEditorUi.getState().setToolsOpen(true);
  const closeTools = () => {
    useEditorUi.getState().setToolsOpen(false);
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
  const railActive = (key: RailKey | 'starred' | 'background') =>
    key === 'tools'
      ? toolsOpen || panel === 'signature'
      : key === 'background'
        ? panel === 'background' || (panel === 'color' && colorTarget === 'background')
        : panel === key;
  const [publishing, setPublishing] = useState(false);
  const readOnly = useEditor((s) => !canEditDoc(s));
  const { status, retry } = useAutosave(needsThumbnail && !readOnly);

  useShortcuts();
  usePasteAndDropImport();

  return (
    <div className="flex h-dvh flex-col bg-stage">
      <TopBar status={status} onRetry={retry} onPublish={() => setPublishing(true)} />
      <div className="flex min-h-0 flex-1">
        {/* แถบซ้าย (จอใหญ่) แบบ Canva: ไอคอน + ป้าย · ที่เลือกอยู่เป็นกล่องขาวไอคอนสี · "ติดดาวแล้ว" ปักล่างสุด */}
        {!readOnly && (
          <nav aria-label="แผงเครื่องมือ" className="hidden w-22 shrink-0 flex-col items-center gap-1 overflow-y-auto bg-stage py-3 md:flex">
            {RAIL.map((item) => (
              <RailButton key={item.key} label={item.label} icon={item.icon} tone={item.tone} active={railActive(item.key)} onClick={() => onRail(item.key)} />
            ))}
            <span aria-hidden className="mt-auto mb-1 h-px w-8 bg-line-strong" />
            <RailButton label="แบ็กกราวด์" icon={Wallpaper} tone="text-type-red" active={railActive('background')} onClick={() => setPanel(railActive('background') ? null : 'background')} />
            <RailButton label="ติดดาวแล้ว" icon={StarredIcon} tone="text-type-orange" active={railActive('starred')} onClick={() => setPanel(panel === 'starred' ? null : 'starred')} />
          </nav>
        )}
        {panel && (!readOnly || panel === 'notes') && (
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
          <div className="relative flex min-h-0 flex-1 flex-col">
            <Stage />
            <Rulers />
            <CommentPins />
            {!readOnly && <ContextToolbar />}
            {!readOnly && <SelectionToolbar />}
            {!readOnly && toolsOpen && <ToolsPalette onClose={closeTools} onSignature={() => setPanel('signature')} />}
            <TimerWidget />
            {!readOnly && <ImportHintBar />}
            {pagesView === 'grid' && <PagesGrid />}
          </div>
          <BottomBar readOnly={readOnly} onPresent={() => presentFromCurrent()} />
        </div>
        <CommentsPanel />
      </div>

      {/* มือถือ: แผงเลื่อนขึ้นจากล่าง + แถบแท็บล่าง */}
      {!readOnly && <MobileSheet panel={panel} onPanel={setPanel} onRail={onRail} railActive={railActive} onBackToTools={openTools} />}

      {publishing && <PublishTemplateDialog open onClose={() => setPublishing(false)} />}
      <EditorDialogs />
      <VersionHistory />
      <ContextMenu />
      <SourcesLayer />
      <Presenter />
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
