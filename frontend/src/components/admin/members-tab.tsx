'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Pager, SelectBox } from '@/components/csmju/list-controls';
import {
  Bone,
  Button,
  cx,
  Dialog,
  EmptyState,
  ErrorState,
  errorMessage,
  FormField,
  inputClass,
  useToast,
} from '@/components/csmju/primitives';
import { api, qs } from '@/lib/csmju/api';
import { formatBytes, relativeTime } from '@/lib/format';
import {
  bytes,
  MAX_QUOTA_BYTES,
  NEAR_QUOTA_PERCENT,
  parseQuotaInput,
  percentLabel,
  QUOTA_PRESETS,
} from './admin-format';
import type { AdminMember } from './admin-types';

const LIMIT = 20;

type Sort = 'recent' | 'usage';

/// แท็บ "สมาชิกและพื้นที่" — ค้นหา ดูพื้นที่ที่ใช้ และปรับโควตาให้คนที่พื้นที่เต็ม
export function MembersTab() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminMember | null>(null);

  // รอพิมพ์เสร็จก่อนค้น ไม่ยิงทุกตัวอักษร
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [input]);

  const query = useQuery({
    queryKey: ['admin-members', q, sort, page],
    queryFn: () => api.list<AdminMember>(`/subsystem-members${qs({ q: q || undefined, sort, page, limit: LIMIT })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <FormField label="ค้นหาสมาชิก" hint="พิมพ์บางส่วนของ coreUserId (ระบบนี้ไม่เก็บชื่อหรืออีเมล)">
            {(props) => (
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
                <input
                  {...props}
                  type="search"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="เช่น user-00"
                  className={cx(inputClass, 'pl-10')}
                />
              </div>
            )}
          </FormField>
        </div>
        <div className="sm:w-56">
          <SelectBox
            label="เรียงตาม"
            value={sort}
            onChange={(value) => {
              setSort(value as Sort);
              setPage(1);
            }}
            options={[
              ['recent', 'เข้าใช้ล่าสุดก่อน'],
              ['usage', 'ใกล้เต็มก่อน'],
            ]}
          />
        </div>
      </div>

      {query.isPending ? (
        <MembersSkeleton />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden className="size-8" />}
          title={q ? 'ไม่พบสมาชิกที่ตรงกับคำค้น' : 'ยังไม่มีสมาชิก'}
          description={q ? 'ลองพิมพ์ coreUserId ให้สั้นลง' : 'สมาชิกจะปรากฏเมื่อผู้ใช้เปิด CS Canvas ครั้งแรก'}
        />
      ) : (
        <>
          <p className="text-csmju-caption text-muted" aria-live="polite">
            ทั้งหมด {query.data.meta.total.toLocaleString('th-TH')} คน
          </p>

          {/* จอกว้าง: ตาราง */}
          <div className="hidden overflow-x-auto rounded-2xl border border-line md:block">
            <table className="w-full text-left text-csmju-caption">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">สมาชิก</th>
                  <th scope="col" className="px-4 py-3 font-medium">พื้นที่ที่ใช้</th>
                  <th scope="col" className="px-4 py-3 font-medium">ดีไซน์</th>
                  <th scope="col" className="px-4 py-3 font-medium">เข้าใช้ล่าสุด</th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    <span className="sr-only">จัดการ</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {query.data.items.map((member) => (
                  <tr key={member.coreUserId} className={cx(member.usagePercent >= NEAR_QUOTA_PERCENT && 'bg-danger-bg')}>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium break-all text-ink">{member.coreUserId}</p>
                    </td>
                    <td className="w-72 px-4 py-3 align-top">
                      <UsageBar member={member} />
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums text-body">{member.designCount.toLocaleString('th-TH')}</td>
                    <td className="px-4 py-3 align-top text-body">{member.lastSeenAt ? relativeTime(member.lastSeenAt) : 'ยังไม่เคยเปิดแอป'}</td>
                    <td className="px-4 py-3 text-right align-top">
                      <Button onClick={() => setEditing(member)}>ปรับพื้นที่</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* จอแคบ: การ์ดซ้อนกัน */}
          <ul className="flex flex-col gap-3 md:hidden">
            {query.data.items.map((member) => (
              <li
                key={member.coreUserId}
                className={cx(
                  'flex flex-col gap-3 rounded-2xl border border-line px-4 py-3',
                  member.usagePercent >= NEAR_QUOTA_PERCENT ? 'bg-danger-bg' : 'bg-surface',
                )}
              >
                <div>
                  <p className="text-csmju-body font-medium break-all text-ink">{member.coreUserId}</p>
                  <p className="text-csmju-caption text-muted">
                    ดีไซน์ {member.designCount.toLocaleString('th-TH')} ·{' '}
                    {member.lastSeenAt ? `เข้าใช้ ${relativeTime(member.lastSeenAt)}` : 'ยังไม่เคยเปิดแอป'}
                  </p>
                </div>
                <UsageBar member={member} />
                <Button onClick={() => setEditing(member)}>ปรับพื้นที่</Button>
              </li>
            ))}
          </ul>

          <Pager page={page} totalPages={query.data.meta.totalPages} onPage={setPage} />
        </>
      )}

      {/* key ตาม coreUserId = เปิดให้คนใหม่ทุกครั้งเริ่มจากค่าว่าง */}
      <QuotaDialog key={editing?.coreUserId ?? 'none'} member={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function UsageBar({ member }: { member: AdminMember }) {
  const percent = Math.min(100, member.usagePercent);
  const near = member.usagePercent >= NEAR_QUOTA_PERCENT;

  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label={`พื้นที่ที่ใช้ของ ${member.coreUserId}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className={cx('h-full rounded-full', near ? 'bg-danger' : 'bg-primary')} style={{ width: `${percent}%` }} />
      </div>
      <p className={cx('text-csmju-caption tabular-nums', near ? 'font-semibold text-danger' : 'text-body')}>
        {formatBytes(bytes(member.storageUsedBytes))} / {formatBytes(bytes(member.storageQuotaBytes))} ({percentLabel(member.usagePercent)})
        {member.quotaOverridden && <span className="font-normal text-muted"> · ปรับโดยผู้ดูแล</span>}
      </p>
    </div>
  );
}

function QuotaDialog({ member, onClose }: { member: AdminMember | null; onClose: () => void }) {
  const toast = useToast();
  const client = useQueryClient();
  const [choice, setChoice] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<'MB' | 'GB'>('GB');
  const [reason, setReason] = useState('');

  const save = useMutation({
    mutationFn: (storageQuotaBytes: number | null) =>
      api.patch<AdminMember>(`/subsystem-members/${encodeURIComponent(member!.coreUserId)}/storage-quota`, {
        storageQuotaBytes,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: (updated) => {
      toast(`ปรับพื้นที่ของ ${updated.coreUserId} เป็น ${formatBytes(bytes(updated.storageQuotaBytes))} แล้ว`);
      void client.invalidateQueries({ queryKey: ['admin-members'] });
      void client.invalidateQueries({ queryKey: ['admin-overview'] });
      onClose();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const customBytes = choice === 'custom' ? parseQuotaInput(amount, unit) : null;
  const target: number | null | undefined =
    choice === 'default' ? null : choice === 'custom' ? customBytes ?? undefined : choice ? Number(choice) : undefined;
  const customError =
    choice === 'custom' && amount.trim()
      ? customBytes === null
        ? 'กรอกตัวเลขที่มากกว่า 0'
        : customBytes > MAX_QUOTA_BYTES
          ? 'สูงสุด 5 GB'
          : customBytes < 1024 * 1024
            ? 'อย่างน้อย 1 MB'
            : null
      : null;
  const canSave = target !== undefined && !customError;
  const used = member ? bytes(member.storageUsedBytes) : 0;
  const belowUsage = typeof target === 'number' && target < used;

  return (
    <Dialog
      open={member !== null}
      onClose={onClose}
      title="ปรับพื้นที่เก็บไฟล์"
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" disabled={!canSave} loading={save.isPending} onClick={() => target !== undefined && save.mutate(target)}>
            บันทึก
          </Button>
        </>
      }
    >
      {member && (
        <div className="flex flex-col gap-4">
          <p className="text-csmju-body text-body">
            <span className="font-semibold break-all text-ink">{member.coreUserId}</span> ใช้ไป {formatBytes(used)} จาก{' '}
            {formatBytes(bytes(member.storageQuotaBytes))} {member.quotaOverridden ? '(ปรับโดยผู้ดูแล)' : '(ค่าเริ่มต้น)'}
          </p>

          <fieldset>
            <legend className="text-csmju-caption font-medium text-ink">พื้นที่ใหม่</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUOTA_PRESETS.map((preset) => (
                <PresetButton key={preset.bytes} active={choice === String(preset.bytes)} onClick={() => setChoice(String(preset.bytes))}>
                  {preset.label}
                </PresetButton>
              ))}
              <PresetButton active={choice === 'custom'} onClick={() => setChoice('custom')}>
                กำหนดเอง
              </PresetButton>
              {member.quotaOverridden && (
                <PresetButton active={choice === 'default'} onClick={() => setChoice('default')}>
                  กลับเป็นค่าเริ่มต้น
                </PresetButton>
              )}
            </div>
          </fieldset>

          {choice === 'custom' && (
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <FormField label="ขนาด" error={customError} hint="สูงสุด 5 GB">
                  {(props) => (
                    <input {...props} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
                  )}
                </FormField>
              </div>
              <div className="w-28">
                <FormField label="หน่วย">
                  {(props) => (
                    <select {...props} value={unit} onChange={(e) => setUnit(e.target.value as 'MB' | 'GB')} className={inputClass}>
                      <option value="MB">MB</option>
                      <option value="GB">GB</option>
                    </select>
                  )}
                </FormField>
              </div>
            </div>
          )}

          <FormField label="เหตุผล (ไม่บังคับ)" hint="บันทึกไว้ใน Audit log">
            {(props) => (
              <input {...props} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className={inputClass} />
            )}
          </FormField>

          {belowUsage && (
            <p role="alert" className="rounded-xl bg-warning-bg px-3 py-2 text-csmju-caption text-warning">
              ค่าที่เลือกต่ำกว่าที่ใช้อยู่ — สมาชิกจะอัปโหลดเพิ่มไม่ได้จนกว่าจะลบไฟล์
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

function PresetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'min-h-11 rounded-xl border px-3 py-2 text-csmju-caption font-medium transition-colors',
        active ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink hover:bg-surface-muted',
      )}
    >
      {children}
    </button>
  );
}

function MembersSkeleton() {
  return (
    <div role="status" aria-label="กำลังโหลดรายชื่อสมาชิก" className="flex flex-col gap-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3">
          <div className="flex-1">
            <Bone className="h-4 w-40" />
            <Bone className="mt-2 h-3 w-24" />
          </div>
          <Bone className="h-2 w-48" />
        </div>
      ))}
    </div>
  );
}
