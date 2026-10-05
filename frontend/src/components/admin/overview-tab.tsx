'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Flag, HardDrive } from 'lucide-react';
import Link from 'next/link';
import { Bone, cx, ErrorState, errorMessage } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { formatBytes, relativeTime } from '@/lib/format';
import { bytes, percentLabel } from './admin-format';
import type { AdminOverview } from './admin-types';

/// แท็บ "ภาพรวม" — ตัวเลขรวมของระบบ (แบบ csmju-nexus) และรายการที่ต้องดูแล
export function OverviewTab() {
  const query = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api.get<AdminOverview>('/admin-overview'),
  });

  if (query.isPending) return <OverviewSkeleton />;

  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;

  const data = query.data;
  const stats: { label: string; value: string; hint?: string }[] = [
    { label: 'สมาชิกทั้งหมด', value: data.memberCount.toLocaleString('th-TH') },
    { label: 'เข้าใช้ใน 7 วัน', value: data.activeMemberCount7d.toLocaleString('th-TH') },
    {
      label: 'ดีไซน์',
      value: data.designCount.toLocaleString('th-TH'),
      hint: `ในถังขยะ ${data.trashedDesignCount.toLocaleString('th-TH')} · ถูกลบรอตรวจ ${data.deletedDesignCount.toLocaleString('th-TH')}`,
    },
    {
      label: 'เทมเพลต',
      value: data.templateCount.toLocaleString('th-TH'),
      hint: `ผู้ใช้เผยแพร่เอง ${data.userTemplateCount.toLocaleString('th-TH')}`,
    },
    {
      label: 'ไฟล์ที่อัปโหลด',
      value: data.assetCount.toLocaleString('th-TH'),
      hint: `รวม ${formatBytes(bytes(data.storageUsedBytes))}`,
    },
    { label: 'ความคิดเห็น', value: data.commentCount.toLocaleString('th-TH') },
  ];
  const needsCare = data.openReportCount > 0 || data.nearQuotaMemberCount > 0;

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col rounded-2xl border border-line bg-surface px-4 py-3">
            <dt className="order-2 text-csmju-caption text-muted">{stat.label}</dt>
            <dd className="order-1 text-csmju-h2 font-bold text-ink tabular-nums">{stat.value}</dd>
            {stat.hint && <dd className="order-3 text-csmju-caption text-body">{stat.hint}</dd>}
          </div>
        ))}
      </dl>

      <section aria-labelledby="admin-care-heading">
        <h2 id="admin-care-heading" className="text-csmju-h3 font-semibold text-ink">
          ต้องดูแล
        </h2>
        {!needsCare ? (
          <p className="mt-3 flex items-center gap-2 rounded-2xl border border-line bg-success-bg px-4 py-3 text-csmju-body text-success">
            <CircleCheck aria-hidden className="size-5 shrink-0" />
            ไม่มีเรื่องร้องเรียนค้าง และไม่มีสมาชิกที่พื้นที่ใกล้เต็ม
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {data.openReportCount > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-warning-bg px-4 py-3">
                <span className="flex items-center gap-2 text-csmju-body text-warning">
                  <Flag aria-hidden className="size-5 shrink-0" />
                  เรื่องร้องเรียน {data.openReportCount.toLocaleString('th-TH')} เรื่อง
                </span>
                <Link href="/admin?tab=reports" className="text-csmju-caption font-semibold text-primary underline-offset-4 hover:underline">
                  ไปที่เรื่องร้องเรียน
                </Link>
              </li>
            )}
            {data.nearQuotaMemberCount > 0 && (
              <li className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-csmju-body text-ink">
                    <HardDrive aria-hidden className="size-5 shrink-0 text-danger" />
                    สมาชิกที่ใช้พื้นที่ตั้งแต่ 90% ขึ้นไป {data.nearQuotaMemberCount.toLocaleString('th-TH')} คน
                  </span>
                  <Link href="/admin?tab=members" className="text-csmju-caption font-semibold text-primary underline-offset-4 hover:underline">
                    ปรับพื้นที่ในแท็บสมาชิก
                  </Link>
                </div>
                <ul className="mt-3 flex flex-col divide-y divide-line">
                  {data.nearQuotaMembers.map((m) => (
                    <li key={m.coreUserId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-csmju-caption">
                      <span className="font-medium break-all text-ink">{m.coreUserId}</span>
                      <span className={cx('tabular-nums', m.usagePercent >= 100 ? 'text-danger' : 'text-body')}>
                        {formatBytes(bytes(m.storageUsedBytes))} / {formatBytes(bytes(m.storageQuotaBytes))} ({percentLabel(m.usagePercent)})
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        )}
      </section>

      <p className="text-csmju-caption text-muted">
        พื้นที่เริ่มต้นต่อคน {formatBytes(bytes(data.defaultQuotaBytes))} · ข้อมูลเมื่อ {relativeTime(data.generatedAt)}
      </p>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div role="status" aria-label="กำลังโหลดภาพรวม" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface px-4 py-3">
          <Bone className="h-8 w-20" />
          <Bone className="mt-2 h-3.5 w-28" />
        </div>
      ))}
    </div>
  );
}
