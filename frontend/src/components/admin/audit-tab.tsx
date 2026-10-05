'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Pager } from '@/components/csmju/list-controls';
import { Bone, Button, EmptyState, ErrorState, errorMessage, FormField, inputClass } from '@/components/csmju/primitives';
import { api, qs } from '@/lib/csmju/api';
import { relativeTime } from '@/lib/format';
import { ACTION_LABELS, actionLabel, dayBoundary, metadataEntries, roleLabel, targetLabel } from './admin-format';
import type { AuditLogEntry } from './admin-types';

const LIMIT = 20;

/// แท็บ "Audit log" — ใครทำอะไรกับอะไร เมื่อไร (ใหม่สุดก่อน)
export function AuditTab() {
  const [action, setAction] = useState('');
  const [actorInput, setActorInput] = useState('');
  const [actor, setActor] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActor(actorInput.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [actorInput]);

  const rangeError = since && until && since > until ? 'วันเริ่มต้องไม่อยู่หลังวันสิ้นสุด' : null;
  const query = useQuery({
    queryKey: ['admin-audit-logs', action, actor, since, until, page],
    queryFn: () =>
      api.list<AuditLogEntry>(
        `/audit-logs${qs({
          action: action || undefined,
          actorCoreUserId: actor || undefined,
          since: dayBoundary(since, 'start'),
          until: dayBoundary(until, 'end'),
          page,
          limit: LIMIT,
        })}`,
      ),
    enabled: !rangeError,
    placeholderData: keepPreviousData,
  });
  const filtered = Boolean(action || actor || since || until);

  const clear = () => {
    setAction('');
    setActorInput('');
    setActor('');
    setSince('');
    setUntil('');
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="การกระทำ">
          {(props) => (
            <select
              {...props}
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">ทั้งหมด</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="ผู้กระทำ (coreUserId)">
          {(props) => (
            <input {...props} value={actorInput} onChange={(e) => setActorInput(e.target.value)} placeholder="เช่น system" className={inputClass} />
          )}
        </FormField>
        <FormField label="ตั้งแต่วันที่">
          {(props) => (
            <input
              {...props}
              type="date"
              value={since}
              onChange={(e) => {
                setSince(e.target.value);
                setPage(1);
              }}
              className={inputClass}
            />
          )}
        </FormField>
        <FormField label="ถึงวันที่" error={rangeError}>
          {(props) => (
            <input
              {...props}
              type="date"
              value={until}
              onChange={(e) => {
                setUntil(e.target.value);
                setPage(1);
              }}
              className={inputClass}
            />
          )}
        </FormField>
      </div>
      {filtered && (
        <div>
          <Button variant="ghost" onClick={clear}>
            ล้างตัวกรอง
          </Button>
        </div>
      )}

      {rangeError ? null : query.isPending ? (
        <AuditSkeleton />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={<ScrollText aria-hidden className="size-8" />}
          title={filtered ? 'ไม่พบรายการตามตัวกรอง' : 'ยังไม่มีรายการใน Audit log'}
          description="การกระทำของผู้ดูแล เช่น ปรับพื้นที่ ลบงานถาวร หรือปิดเรื่องร้องเรียน จะถูกบันทึกที่นี่"
        />
      ) : (
        <>
          <p className="text-csmju-caption text-muted" aria-live="polite">
            ทั้งหมด {query.data.meta.total.toLocaleString('th-TH')} รายการ
          </p>
          <ol className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {query.data.items.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ol>
          <Pager page={page} totalPages={query.data.meta.totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const meta = metadataEntries(entry.metadata);
  const at = new Date(entry.createdAt);

  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-csmju-body font-semibold text-ink">{actionLabel(entry.action)}</p>
        <time
          dateTime={entry.createdAt}
          title={at.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
          className="text-csmju-caption text-muted"
        >
          {relativeTime(entry.createdAt)}
        </time>
      </div>
      <p className="text-csmju-caption text-body">
        โดย <span className="font-medium break-all text-ink">{entry.actorCoreUserId === 'system' ? 'ระบบอัตโนมัติ' : entry.actorCoreUserId}</span>
        {entry.actorCoreUserId !== 'system' && ` (${roleLabel(entry.actorCoreRole)})`} · {targetLabel(entry.targetKind)}
        {entry.targetId && <span className="break-all"> {entry.targetId}</span>}
      </p>
      {meta.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-csmju-caption">
          {meta.map(([label, value]) => (
            <div key={label} className="flex gap-1">
              <dt className="text-muted">{label}:</dt>
              <dd className="break-all text-body">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-csmju-caption text-muted">{entry.action}</p>
    </li>
  );
}

function AuditSkeleton() {
  return (
    <div role="status" aria-label="กำลังโหลด Audit log" className="flex flex-col gap-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface px-4 py-3">
          <Bone className="h-4 w-48" />
          <Bone className="mt-2 h-3 w-72 max-w-full" />
        </div>
      ))}
    </div>
  );
}
