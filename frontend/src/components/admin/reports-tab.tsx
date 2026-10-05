'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Flag, MessageSquareText, ShieldX, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Pager, SelectBox } from '@/components/csmju/list-controls';
import { Button, Dialog, EmptyState, ErrorState, FormField, Spinner, Toggle, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { Thumbnail } from '@/components/designs/cards';
import { api, qs } from '@/lib/csmju/api';
import { relativeTime } from '@/lib/format';
import {
  HIDE_ACTION_LABELS,
  STATUS_LABELS,
  TARGET_LABELS,
  reasonLabel,
  shortId,
  type Report,
  type ReportStatus,
  type ReportTargetKind,
} from '@/lib/moderation';

/// แท็บ "เรื่องร้องเรียน" ของแผงผู้ดูแล (แบบ csmju-nexus) — ดูสิ่งที่ถูกรายงาน ปิดเรื่อง และซ่อนเป้าหมายได้
const STATUSES: ReportStatus[] = ['OPEN', 'RESOLVED', 'REJECTED'];
const KIND_OPTIONS: [string, string][] = [
  ['', 'ทุกประเภท'],
  ['DESIGN', TARGET_LABELS.DESIGN],
  ['TEMPLATE', TARGET_LABELS.TEMPLATE],
  ['COMMENT', TARGET_LABELS.COMMENT],
  ['OTHER', TARGET_LABELS.OTHER],
];
const PAGE_SIZE = 20;

export function ReportsTab() {
  const [status, setStatus] = useState<ReportStatus>('OPEN');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [deciding, setDeciding] = useState<{ report: Report; decision: 'RESOLVED' | 'REJECTED' } | null>(null);
  const query = useQuery({
    queryKey: ['admin-reports', 'list', status, kind, page],
    queryFn: () => api.list<Report>(`/reports${qs({ status, targetKind: kind || undefined, page, limit: PAGE_SIZE })}`),
  });

  return (
    <section aria-labelledby="reports-heading">
      <h2 id="reports-heading" className="sr-only">
        เรื่องร้องเรียน
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="สถานะของเรื่อง" className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <StatusChip
              key={s}
              status={s}
              kind={kind}
              active={status === s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            />
          ))}
        </div>
        <div className="sm:w-56">
          <SelectBox
            label="ประเภทของสิ่งที่ถูกรายงาน"
            value={kind}
            onChange={(value) => {
              setKind(value);
              setPage(1);
            }}
            options={KIND_OPTIONS}
          />
        </div>
      </div>

      <div className="mt-6">
        {query.isLoading ? (
          <Spinner label="กำลังโหลดเรื่องร้องเรียน…" />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data!.items.length === 0 ? (
          <EmptyState
            icon={<Flag aria-hidden className="size-8" />}
            title={status === 'OPEN' ? 'ไม่มีเรื่องที่รอจัดการ' : `ยังไม่มีเรื่องที่${STATUS_LABELS[status]}`}
            description="เรื่องร้องเรียนมาจากปุ่ม “รายงาน” บนการ์ดเทมเพลต ความคิดเห็น เมนูไฟล์ของงานที่แชร์ และเมนูความช่วยเหลือ"
          />
        ) : (
          <>
            <ul className="flex flex-col gap-4">
              {query.data!.items.map((report) => (
                <ReportRow key={report.id} report={report} onDecide={(decision) => setDeciding({ report, decision })} />
              ))}
            </ul>
            <Pager page={page} totalPages={query.data!.meta.totalPages} onPage={setPage} />
          </>
        )}
      </div>

      {deciding && <DecisionDialog report={deciding.report} decision={deciding.decision} onClose={() => setDeciding(null)} />}
    </section>
  );
}

/// ปุ่มกรองสถานะพร้อมจำนวน (meta.total ของแต่ละสถานะ)
function StatusChip({ status, kind, active, onClick }: { status: ReportStatus; kind: string; active: boolean; onClick: () => void }) {
  const count = useQuery({
    queryKey: ['admin-reports', 'count', status, kind],
    queryFn: async () => (await api.list<Report>(`/reports${qs({ status, targetKind: kind || undefined, limit: 1 })}`)).meta.total,
  });

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-csmju-caption font-medium transition-colors',
        active ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink hover:bg-surface-muted',
      )}
    >
      {STATUS_LABELS[status]}
      {count.data !== undefined && (
        <span
          className={cx(
            'min-w-6 rounded-full px-1.5 text-center tabular-nums',
            status === 'OPEN' && count.data > 0 ? 'bg-danger text-on-inverse' : 'bg-surface-muted text-body',
          )}
        >
          {count.data.toLocaleString('th-TH')}
          <span className="sr-only"> เรื่อง</span>
        </span>
      )}
    </button>
  );
}

function ReportRow({ report, onDecide }: { report: Report; onDecide: (decision: 'RESOLVED' | 'REJECTED') => void }) {
  const target = report.target;
  // งานที่ปิดลิงก์แล้วผู้ดูแลเปิดไม่ได้ (ไม่ใช่เจ้าของ) — ไม่แสดงลิงก์ที่กดแล้วได้ 404
  const canOpen = Boolean(report.link) && (target === null || (target.exists && !(report.targetKind === 'DESIGN' && target.hidden)));

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-col gap-4 md:flex-row">
        <TargetPreview report={report} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-csmju-caption">
            <span className="rounded-full bg-surface-muted px-2.5 py-0.5 font-medium text-ink">{TARGET_LABELS[report.targetKind]}</span>
            <span className="rounded-full bg-danger-bg px-2.5 py-0.5 font-medium text-danger">{reasonLabel(report.reason)}</span>
            {target && !target.exists && <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-muted">ถูกลบแล้ว</span>}
            {target?.exists && target.hidden && (
              <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-muted">{report.targetKind === 'DESIGN' ? 'ปิดลิงก์แชร์แล้ว' : 'ซ่อนแล้ว'}</span>
            )}
          </div>
          <p className="mt-2 truncate text-csmju-body font-semibold text-ink">
            {target?.title ?? report.targetExcerpt ?? (report.targetKind === 'OTHER' ? 'เรื่องอื่นในระบบ' : 'ไม่ทราบชื่อ')}
          </p>
          {report.details ? (
            <p className="mt-1 text-csmju-body whitespace-pre-line text-body">{report.details}</p>
          ) : (
            <p className="mt-1 text-csmju-caption text-muted">ผู้รายงานไม่ได้เขียนรายละเอียด</p>
          )}
          <p className="mt-2 text-csmju-caption text-muted">
            แจ้งโดย <span className="font-mono">{shortId(report.reporterCoreUserId)}</span> · {relativeTime(report.createdAt)}
            {target?.ownerCoreUserId && (
              <>
                {' '}
                · เจ้าของ <span className="font-mono">{shortId(target.ownerCoreUserId)}</span>
              </>
            )}
          </p>

          {report.status !== 'OPEN' && (
            <div className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-csmju-caption text-body">
              <p className="font-medium text-ink">
                {STATUS_LABELS[report.status]}
                {report.actionTaken === 'HIDE_TARGET' && report.targetKind !== 'OTHER' && ` · ${HIDE_ACTION_LABELS[report.targetKind]}`}
              </p>
              <p>
                โดย <span className="font-mono">{shortId(report.resolvedByCoreUserId ?? '-')}</span>
                {report.resolvedAt && ` · ${relativeTime(report.resolvedAt)}`}
              </p>
              {report.resolutionNote && <p className="mt-1 whitespace-pre-line">{report.resolutionNote}</p>}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {canOpen && (
              <Link
                href={report.link!}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-csmju-caption font-medium text-ink hover:bg-surface-muted"
              >
                <ExternalLink aria-hidden className="size-4" /> เปิดดู
              </Link>
            )}
            {report.status === 'OPEN' && (
              <>
                <Button variant="primary" onClick={() => onDecide('RESOLVED')}>
                  <Check aria-hidden className="size-4" /> จัดการแล้ว
                </Button>
                <Button onClick={() => onDecide('REJECTED')}>
                  <X aria-hidden className="size-4" /> ปัดตก
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/// ภาพย่อของงาน/เทมเพลต · ข้อความของความคิดเห็น · ลิงก์ของเรื่องอื่น
function TargetPreview({ report }: { report: Report }) {
  const target = report.target;

  if (report.targetKind === 'COMMENT') {
    return (
      <div className="flex w-full shrink-0 flex-col gap-1 rounded-xl bg-surface-muted p-3 md:w-56">
        <span className="flex items-center gap-1.5 text-csmju-caption text-muted">
          <MessageSquareText aria-hidden className="size-4" /> ความคิดเห็น
        </span>
        <p className="line-clamp-5 text-csmju-caption whitespace-pre-line text-ink">{target?.body ?? report.targetExcerpt ?? '—'}</p>
      </div>
    );
  }

  if (report.targetKind === 'OTHER' || !target || !target.designType || !target.width || !target.height) {
    return (
      <div className="flex w-full shrink-0 flex-col items-center justify-center gap-2 rounded-xl bg-surface-muted p-4 text-center md:w-56">
        <ShieldX aria-hidden className="size-8 text-muted" />
        <span className="text-csmju-caption break-all text-muted">{report.link ?? report.targetExcerpt ?? 'ไม่มีตัวอย่าง'}</span>
      </div>
    );
  }

  return (
    <div className="w-full shrink-0 md:w-56">
      <Thumbnail
        src={target.thumbnail}
        width={target.width}
        height={target.height}
        designType={target.designType}
        alt={`ภาพย่อของ ${target.title ?? report.targetExcerpt ?? TARGET_LABELS[report.targetKind]}`}
      />
    </div>
  );
}

function DecisionDialog({ report, decision, onClose }: { report: Report; decision: 'RESOLVED' | 'REJECTED'; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [hide, setHide] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const canHide = decision === 'RESOLVED' && report.targetKind !== 'OTHER' && report.target?.exists === true;
  const hideLabel = report.targetKind === 'OTHER' ? '' : HIDE_ACTION_LABELS[report.targetKind as Exclude<ReportTargetKind, 'OTHER'>];
  const save = useMutation({
    mutationFn: () =>
      api.patch<Report>(`/reports/${report.id}`, {
        status: decision,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(canHide && hide ? { action: 'HIDE_TARGET' } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      toast(decision === 'RESOLVED' ? 'ปิดเรื่องแล้ว แจ้งผู้รายงานแล้ว' : 'ปัดตกเรื่องแล้ว แจ้งผู้รายงานแล้ว');
      onClose();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={decision === 'RESOLVED' ? 'ปิดเรื่องว่าจัดการแล้ว' : 'ปัดตกเรื่องนี้'}
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant={canHide && hide ? 'danger' : 'primary'} loading={save.isPending} onClick={() => save.mutate()}>
            {canHide && hide ? 'ปิดเรื่องและซ่อน' : 'ยืนยัน'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-csmju-body text-body">
          {decision === 'RESOLVED'
            ? 'ผู้รายงานจะได้รับแจ้งว่าเรื่องได้รับการจัดการแล้ว'
            : 'ผู้รายงานจะได้รับแจ้งว่าพิจารณาแล้วไม่พบการละเมิด'}
        </p>
        <FormField label="บันทึกของผู้ดูแล" hint={`ไม่บังคับ · เก็บกับเรื่องและใน Audit log (ผู้รายงานไม่เห็น) · ${note.length}/1000`}>
          {(props) => <textarea {...props} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className={cx(inputClass, 'py-3')} />}
        </FormField>
        {canHide && (
          <div className="rounded-xl border border-line px-3">
            <Toggle
              checked={hide}
              onChange={setHide}
              label={hideLabel}
              description="เรื่องอื่นที่ยังเปิดอยู่กับเป้าหมายเดียวกันจะถูกปิดไปพร้อมกัน และเจ้าของได้รับแจ้ง"
            />
          </div>
        )}
        {decision === 'RESOLVED' && report.targetKind !== 'OTHER' && report.target?.exists === false && (
          <p className="text-csmju-caption text-muted">สิ่งที่ถูกรายงานถูกลบไปแล้ว จึงไม่มีอะไรให้ซ่อน</p>
        )}
      </div>
    </Dialog>
  );
}
