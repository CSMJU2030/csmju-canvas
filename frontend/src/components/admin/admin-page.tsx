'use client';

import { ShieldAlert } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cx } from '@/components/csmju/primitives';
import { useMe } from '@/lib/csmju/session';
import { ActivityTab } from './activity-tab';
import { isAdminRole } from './admin-access';
import { AuditTab } from './audit-tab';
import { DeletedTab } from './deleted-tab';
import { MembersTab } from './members-tab';
import { OverviewTab } from './overview-tab';
import { ReportsTab } from './reports-tab';

/// แผงผู้ดูแล (แบบ csmju-nexus) — เจ้าหน้าที่ (staff) และผู้ดูแลองค์กร (admin) เท่านั้น
///
/// แต่ละแท็บเป็นไฟล์ของตัวเองใน components/admin/ · แท็บที่เปิดอยู่เก็บใน ?tab= ให้แชร์ลิงก์ได้
const TABS = [
  { key: 'overview', label: 'ภาพรวม' },
  { key: 'members', label: 'สมาชิกและพื้นที่' },
  { key: 'activity', label: 'กิจกรรม' },
  { key: 'reports', label: 'เรื่องร้องเรียน' },
  { key: 'deleted', label: 'งานที่ถูกลบ' },
  { key: 'audit', label: 'Audit log' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function AdminPage() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const tab: TabKey = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'overview';

  if (!isAdminRole(me.coreRole)) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-20 text-center">
        <ShieldAlert aria-hidden className="size-10 text-muted" />
        <h1 className="text-csmju-h2 font-bold text-ink">ไม่มีสิทธิ์เข้าแผงผู้ดูแล</h1>
        <p className="text-csmju-body text-muted">แผงนี้เปิดได้เฉพาะเจ้าหน้าที่และผู้ดูแลระบบ</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 md:px-10">
      <h1 className="text-csmju-h1 font-bold text-ink">แผงผู้ดูแล</h1>
      <div role="tablist" aria-label="หัวข้อของแผงผู้ดูแล" className="csmju-scroll-x mt-6 flex gap-6 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => router.replace(t.key === 'overview' ? '/admin' : `/admin?tab=${t.key}`, { scroll: false })}
            className={cx(
              '-mb-px min-h-11 shrink-0 border-b-2 px-1 text-csmju-body',
              tab === t.key ? 'border-primary font-semibold text-ink' : 'border-transparent text-body hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-6">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'members' && <MembersTab />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'deleted' && <DeletedTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}
