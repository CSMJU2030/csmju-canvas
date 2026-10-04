'use client';

import { useQuery } from '@tanstack/react-query';
import { Copy, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ErrorState, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { drawPage, preloadPage } from '@/lib/editor/render';
import { useEditor } from '@/lib/editor/store';
import { normalizeDocument, pageSizeOf, type DesignDocument, type Page } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';

/// ประวัติเวอร์ชัน (ภาพบรีฟ "ประวัติเวอร์ชั่น"): ดูตัวอย่างเวอร์ชันเก่าเต็มจอ แล้ว "ทำสำเนา" หรือ "กู้คืน"
///
/// กู้คืน = เก็บงานปัจจุบันเป็นเวอร์ชันก่อน แล้วแทนเนื้องานด้วยเวอร์ชันที่เลือก (ย้อนกลับได้ด้วย Ctrl+Z)

interface VersionSummary {
  id: string;
  author: 'me' | 'owner' | 'collaborator';
  width: number;
  height: number;
  pageCount: number;
  createdAt: string;
}

interface VersionFull extends VersionSummary {
  document: unknown;
}

const AUTHOR = { me: 'คุณ', owner: 'เจ้าของงาน', collaborator: 'ผู้ร่วมงาน' } as const;

function formatTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();

  return sameDay
    ? `วันนี้ ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
    : d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function VersionHistory() {
  const open = useEditorUi((s) => s.overlay === 'versions');

  if (!open) return null;

  return <VersionHistoryInner />;
}

function VersionHistoryInner() {
  const designId = useEditor((s) => s.designId);
  const title = useEditor((s) => s.title);
  const doc = useEditor((s) => s.doc);
  const baseWidth = useEditor((s) => s.baseWidth);
  const baseHeight = useEditor((s) => s.baseHeight);
  const [selected, setSelected] = useState<string | 'current'>('current');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const close = () => useEditorUi.getState().set({ overlay: null });
  const list = useQuery({ queryKey: ['versions', designId], queryFn: () => api.list<VersionSummary>(`/designs/${designId}/versions?limit=50`) });
  const version = useQuery({
    queryKey: ['version', designId, selected],
    queryFn: () => api.get<VersionFull>(`/designs/${designId}/versions/${selected}`),
    enabled: selected !== 'current',
  });
  const previewDoc: DesignDocument | null = selected === 'current' ? doc : version.data ? normalizeDocument(version.data.document) : null;
  const previewSize = selected === 'current' ? { width: baseWidth, height: baseHeight } : version.data ? { width: version.data.width, height: version.data.height } : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const restore = async () => {
    if (!version.data) return;

    setBusy(true);

    try {
      await api.post(`/designs/${designId}/versions`);

      const state = useEditor.getState();

      if (version.data.width !== state.baseWidth || version.data.height !== state.baseHeight) state.resize(version.data.width, version.data.height);
      state.replaceDocument(normalizeDocument(version.data.document));
      toast('กู้คืนเวอร์ชันนี้แล้ว — งานก่อนกู้คืนเก็บไว้ในประวัติเวอร์ชันด้วย');
      close();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    if (!version.data) return;

    setBusy(true);

    try {
      const copy = await api.post<{ id: string }>('/designs', {
        title: `${title} (เวอร์ชัน ${formatTime(version.data.createdAt)})`.slice(0, 120),
        designType: useEditor.getState().designType,
        width: version.data.width,
        height: version.data.height,
        document: version.data.document,
      });

      window.open(`/design/${copy.id}`, '_blank');
      toast('ทำสำเนาเวอร์ชันนี้เป็นงานใหม่แล้ว');
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }

  };

  return (
    <div role="dialog" aria-modal="true" aria-label="ประวัติเวอร์ชัน" className="csmju-fade-in fixed inset-0 z-50 flex bg-stage">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 px-4 py-3">
          <button type="button" onClick={close} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-csmju-caption font-semibold text-ink hover:bg-surface">
            <X aria-hidden className="size-5" /> ปิดประวัติเวอร์ชัน
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={selected === 'current' || !version.data || busy}
              onClick={() => void duplicate()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-40"
            >
              <Copy aria-hidden className="size-4" /> ทำสำเนา
            </button>
            <button
              type="button"
              disabled={selected === 'current' || !version.data || busy}
              onClick={() => void restore()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover disabled:opacity-40"
            >
              <RotateCcw aria-hidden className="size-4" /> กู้คืน
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {!previewDoc || !previewSize ? (
            <Spinner label="กำลังโหลดเวอร์ชัน…" />
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-6">
              {previewDoc.pages.map((page) => (
                <PreviewPage key={page.id} page={page} base={previewSize} />
              ))}
            </div>
          )}
        </div>
      </div>
      <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-surface">
        <h2 className="px-4 pt-4 pb-2 text-csmju-body font-bold text-ink">ประวัติเวอร์ชัน</h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <VersionRow active={selected === 'current'} title="เวอร์ชันปัจจุบัน" detail="งานที่เปิดอยู่" onClick={() => setSelected('current')} />
          {list.isLoading ? (
            <Spinner />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
          ) : list.data!.items.length === 0 ? (
            <p className="px-3 py-4 text-csmju-caption text-muted">ยังไม่มีเวอร์ชันเก่า — ระบบเก็บให้อัตโนมัติทุก 10 นาทีที่แก้งาน หรือกด “บันทึก” ในเมนูไฟล์</p>
          ) : (
            list.data!.items.map((v) => (
              <VersionRow key={v.id} active={selected === v.id} title={formatTime(v.createdAt)} detail={`${AUTHOR[v.author]} · ${v.pageCount} หน้า`} onClick={() => setSelected(v.id)} />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function VersionRow({ active, title, detail, onClick }: { active: boolean; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cx('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left', active ? 'bg-primary-soft' : 'hover:bg-surface-muted')}>
      <span aria-hidden className={cx('mt-1.5 size-2.5 shrink-0 rounded-full border-2', active ? 'border-primary bg-primary' : 'border-line-strong')} />
      <span>
        <span className={cx('block text-csmju-caption', active ? 'font-bold text-primary' : 'font-semibold text-ink')}>{title}</span>
        <span className="block text-csmju-caption text-muted">{detail}</span>
      </span>
    </button>
  );
}

function PreviewPage({ page, base }: { page: Page; base: { width: number; height: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height } = pageSizeOf(page, base);

  useEffect(() => {
    let cancelled = false;

    void preloadPage(page).then(() => {
      const canvas = ref.current;

      if (!canvas || cancelled) return;

      const scale = Math.min(2, 1600 / Math.max(width, height));

      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      const ctx = canvas.getContext('2d')!;

      ctx.scale(scale, scale);
      ctx.fillStyle = 'rgb(255 255 255)';
      ctx.fillRect(0, 0, width, height);
      drawPage(ctx, page, { width, height });
    });

    return () => {
      cancelled = true;
    };
  }, [page, width, height]);

  return <canvas ref={ref} aria-label="ตัวอย่างหน้า" className="w-full rounded-lg bg-surface shadow-csmju-md" style={{ aspectRatio: `${width} / ${height}` }} />;
}
