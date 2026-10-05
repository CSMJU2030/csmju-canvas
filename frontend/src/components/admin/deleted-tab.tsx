'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, ChevronLeft, ChevronRight, Eye, Search, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Pager } from '@/components/csmju/list-controls';
import { Button, Dialog, EmptyState, ErrorState, FormField, IconButton, Spinner, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { Thumbnail } from '@/components/designs/cards';
import { api, qs } from '@/lib/csmju/api';
import { designTypeLabel } from '@/lib/design-types';
import { renderPageToCanvas } from '@/lib/editor/render';
import { normalizeDocument, pageSizeOf } from '@/lib/editor/types';
import { relativeTime } from '@/lib/format';
import { shortId, type DeletedDesign, type DeletedDesignDetail } from '@/lib/moderation';

/// แท็บ "งานที่ถูกลบ" ของแผงผู้ดูแล — งานที่เจ้าของลบถาวรแล้วยังอยู่ให้ตรวจ 30 วัน (การตัดสินใจของ PL)
///
/// กู้คืน = กลับไปอยู่ในถังขยะของเจ้าของ (เจ้าของได้รับแจ้ง) · ลบทันที = ลบจริงไม่รอครบกำหนด
const PAGE_SIZE = 24;

type Pending = { design: DeletedDesign; action: 'restore' | 'purge' };

export function DeletedTab() {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [previewing, setPreviewing] = useState<DeletedDesign | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const query = useQuery({
    queryKey: ['admin-deleted-designs', q, page],
    queryFn: () => api.list<DeletedDesign>(`/deleted-designs${qs({ q: q || undefined, page, limit: PAGE_SIZE })}`),
  });

  const search = (event: FormEvent) => {
    event.preventDefault();
    setQ(draft.trim());
    setPage(1);
  };

  return (
    <section aria-labelledby="deleted-heading">
      <h2 id="deleted-heading" className="sr-only">
        งานที่ถูกลบ
      </h2>
      <p className="text-csmju-body text-body">
        งานที่เจ้าของลบถาวรแล้ว ระบบเก็บไว้ให้ตรวจสอบ 30 วันก่อนลบจริงอัตโนมัติ (ทุกวันเวลา 03:00 น.)
      </p>
      <form role="search" onSubmit={search} className="mt-4 flex items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <FormField label="ค้นหางานที่ถูกลบ" hint="ชื่องาน หรือรหัสอ้างอิงของเจ้าของ (ตรงทั้งคำ)">
            {(props) => <input {...props} type="search" maxLength={100} value={draft} onChange={(e) => setDraft(e.target.value)} className={inputClass} />}
          </FormField>
        </div>
        <Button type="submit" className="mb-7">
          <Search aria-hidden className="size-4" /> ค้นหา
        </Button>
      </form>

      <div className="mt-4">
        {query.isLoading ? (
          <Spinner label="กำลังโหลดงานที่ถูกลบ…" />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data!.items.length === 0 ? (
          <EmptyState
            icon={<Trash2 aria-hidden className="size-8" />}
            title={q ? `ไม่พบงานที่ถูกลบที่ตรงกับ “${q}”` : 'ไม่มีงานที่ถูกลบในช่วง 30 วัน'}
            description="งานจะมาอยู่ที่นี่เมื่อเจ้าของลบถาวรจากถังขยะ หรืออยู่ในถังขยะครบ 30 วัน"
          />
        ) : (
          <>
            <p className="mb-3 text-csmju-caption text-muted tabular-nums">ทั้งหมด {query.data!.meta.total.toLocaleString('th-TH')} งาน</p>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {query.data!.items.map((design) => (
                <li key={design.id} className="flex flex-col rounded-2xl border border-line bg-surface p-3">
                  <Thumbnail src={design.thumbnail} width={design.width} height={design.height} designType={design.designType} alt={`ภาพย่อของ ${design.title}`} />
                  <p className="mt-2 truncate text-csmju-body font-semibold text-ink">{design.title}</p>
                  <p className="truncate text-csmju-caption text-muted">
                    {designTypeLabel(design.designType).replace(/\s*\(.*\)$/, '')} · {design.pageCount} หน้า
                  </p>
                  <p className="text-csmju-caption text-muted">
                    เจ้าของ {shortId(design.ownerCoreUserId)} · ลบ {relativeTime(design.deletedAt)}
                  </p>
                  <p className={design.daysLeft <= 3 ? 'text-csmju-caption font-medium text-danger' : 'text-csmju-caption text-body'}>
                    ลบจริงใน {design.daysLeft} วัน ({new Date(design.purgeAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })})
                  </p>
                  <div className="mt-auto flex gap-2 pt-3">
                    <Button className="flex-1 px-2" onClick={() => setPreviewing(design)}>
                      <Eye aria-hidden className="size-4" /> ดู
                    </Button>
                    <Button className="flex-1 px-2" onClick={() => setPending({ design, action: 'restore' })}>
                      <ArchiveRestore aria-hidden className="size-4" /> กู้คืน
                    </Button>
                    <IconButton label={`ลบ ${design.title} ทันที`} className="text-danger" onClick={() => setPending({ design, action: 'purge' })}>
                      <Trash2 aria-hidden className="size-4" />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
            <Pager page={page} totalPages={query.data!.meta.totalPages} onPage={setPage} />
          </>
        )}
      </div>

      {previewing && <PreviewDialog design={previewing} onClose={() => setPreviewing(null)} />}
      {pending && <ConfirmDialog pending={pending} onClose={() => setPending(null)} />}
    </section>
  );
}

function ConfirmDialog({ pending, onClose }: { pending: Pending; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { design, action } = pending;
  const run = useMutation({
    mutationFn: () => (action === 'restore' ? api.patch(`/deleted-designs/${design.id}`, { restore: true }) : api.del(`/deleted-designs/${design.id}`)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-deleted-designs'] });
      toast(action === 'restore' ? `กู้คืน “${design.title}” ไปไว้ในถังขยะของเจ้าของแล้ว` : `ลบ “${design.title}” จริงแล้ว`);
      onClose();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={action === 'restore' ? 'กู้คืนงานนี้?' : 'ลบงานนี้ทันที?'}
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant={action === 'restore' ? 'primary' : 'danger'} loading={run.isPending} onClick={() => run.mutate()}>
            {action === 'restore' ? (
              <>
                <ArchiveRestore aria-hidden className="size-4" /> กู้คืน
              </>
            ) : (
              <>
                <Trash2 aria-hidden className="size-4" /> ลบทันที
              </>
            )}
          </Button>
        </>
      }
    >
      <p className="text-csmju-body font-semibold text-ink">“{design.title}”</p>
      <p className="mt-2 text-csmju-body text-body">
        {action === 'restore'
          ? 'งานจะกลับไปอยู่ในถังขยะของเจ้าของ (ลิงก์แชร์ยังปิดอยู่) และเจ้าของจะได้รับแจ้ง เจ้าของกู้คืนต่อเองได้ภายใน 30 วัน'
          : 'งาน เวอร์ชัน ความคิดเห็น และสถิติการเปิดจะถูกลบจริงทันที กู้คืนไม่ได้อีก (รูปที่เจ้าของอัปโหลดไม่ถูกลบ)'}
      </p>
    </Dialog>
  );
}

/// ดูงานแบบอ่านอย่างเดียว — วาดแต่ละหน้าจาก JSON state ในเบราว์เซอร์ (ไม่เปิดหน้าแก้ไข)
function PreviewDialog({ design, onClose }: { design: DeletedDesign; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const detail = useQuery({
    queryKey: ['admin-deleted-designs', 'detail', design.id],
    queryFn: () => api.get<DeletedDesignDetail>(`/deleted-designs/${design.id}`),
  });
  const doc = detail.data ? normalizeDocument(detail.data.document) : null;
  const pages = doc?.pages ?? [];
  const current = pages[Math.min(index, Math.max(0, pages.length - 1))];
  const image = useQuery({
    queryKey: ['admin-deleted-designs', 'page', design.id, current?.id],
    queryFn: async () => {
      const size = pageSizeOf(current!, { width: design.width, height: design.height });
      const canvas = await renderPageToCanvas(current!, size, Math.min(1, 1200 / Math.max(size.width, size.height)), {
        background: current!.background ? undefined : 'rgb(255 255 255)',
      });

      return canvas.toDataURL('image/png');
    },
    enabled: Boolean(current),
    staleTime: Infinity,
  });

  return (
    <Dialog open onClose={onClose} title={`ตัวอย่าง: ${design.title}`} size="lg">
      {detail.isLoading ? (
        <Spinner label="กำลังโหลดงาน…" />
      ) : detail.isError ? (
        <ErrorState message={errorMessage(detail.error)} onRetry={() => void detail.refetch()} />
      ) : pages.length === 0 ? (
        <EmptyState title="งานนี้ไม่มีหน้า" />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="csmju-checker flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl">
            {image.isLoading ? (
              <Spinner label="กำลังวาดหน้า…" />
            ) : image.isError ? (
              <p className="px-4 text-center text-csmju-caption text-danger">วาดหน้านี้ไม่สำเร็จ: {errorMessage(image.error)}</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- ภาพวาดจาก canvas ในเครื่อง
              <img src={image.data} alt={`หน้า ${index + 1} ของ ${design.title}`} className="max-h-full max-w-full object-contain shadow-csmju-md" />
            )}
          </div>
          {pages.length > 1 && (
            <nav aria-label="เลือกหน้า" className="flex items-center gap-3">
              <IconButton label="หน้าก่อนหน้า" disabled={index <= 0} onClick={() => setIndex((i) => i - 1)}>
                <ChevronLeft aria-hidden className="size-5" />
              </IconButton>
              <span className="text-csmju-caption text-muted tabular-nums">
                หน้า {index + 1} / {pages.length}
              </span>
              <IconButton label="หน้าถัดไป" disabled={index >= pages.length - 1} onClick={() => setIndex((i) => i + 1)}>
                <ChevronRight aria-hidden className="size-5" />
              </IconButton>
            </nav>
          )}
          <p className="text-csmju-caption text-muted">ดูอย่างเดียว · รูปที่เจ้าของอัปโหลดอาจไม่แสดงถ้าเจ้าของลบรูปนั้นไปแล้ว</p>
        </div>
      )}
    </Dialog>
  );
}
