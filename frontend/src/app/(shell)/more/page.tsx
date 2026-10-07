'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bell, BookOpen, ChevronDown, ChevronRight, CircleHelp, CircleUserRound, CloudUpload, Contrast, Flag, HardDrive, Info,
  Lightbulb, LogOut, Settings, ShieldCheck, Sparkles, Star, Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { cx } from '@/components/csmju/primitives';
import { FeedbackDialog, ThemeOptions } from '@/components/shell/account-popover';
import { Avatar, ROLE_LABEL } from '@/components/shell/avatar';
import { api } from '@/lib/csmju/api';
import { useMe, useSignOut } from '@/lib/csmju/session';
import { formatBytes } from '@/lib/format';
import type { NotificationItem, Quota } from '@/lib/types';

/// หน้า "เพิ่มเติม" ของมือถือ (ภาพบรีฟ "เมนูเพิ่มเติม" ทั้งสองภาพ)
///
/// การ์ดโปรโมต "ทดลองใช้ฟรี 30 วัน" ของ Canva แทนด้วยการ์ดพื้นที่ใช้งาน (ระบบนี้ไม่มีการขาย)
/// รายการสินค้าของ Canva (แบรนด์ พิมพ์ DreamLab Grow) แทนด้วยของที่ CS Canvas มีจริง
export default function MorePage() {
  const me = useMe();
  const signOut = useSignOut();
  const [expanded, setExpanded] = useState<'account' | 'theme' | 'help' | null>(null);
  const [feedback, setFeedback] = useState<'SUGGESTION' | 'REPORT' | null>(null);
  const quota = useQuery({ queryKey: ['quotas'], queryFn: () => api.get<Quota>('/quotas') });
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.list<NotificationItem>('/notifications?unread=true&limit=1'),
  }).data?.meta.total ?? 0;
  const toggle = (key: 'account' | 'theme' | 'help') => setExpanded(expanded === key ? null : key);
  const percent = quota.data ? Math.min(100, (quota.data.usedBytes / quota.data.quotaBytes) * 100) : 0;

  return (
    <div className="relative min-h-dvh pb-28">
      <div aria-hidden className="csmju-hero pointer-events-none absolute inset-x-0 top-0 h-64" />
      <div className="relative mx-auto max-w-xl px-4">
        <div className="flex justify-end gap-1 pt-3">
          <Link href="/notifications" aria-label={unread ? `การแจ้งเตือน (${unread} รายการใหม่)` : 'การแจ้งเตือน'} className="relative inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface/60">
            <Bell aria-hidden className="size-6" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-csmju-caption leading-none font-bold text-on-inverse ring-2 ring-surface">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
          <Link href="/assistant" aria-label="ผู้ช่วย" className="inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface/60">
            <CircleHelp aria-hidden className="size-6" />
          </Link>
        </div>

        <section className="csmju-search mt-4 rounded-3xl p-5">
          <p className="flex items-center gap-2 text-csmju-body font-bold text-ink">
            <HardDrive aria-hidden className="size-5 text-chart-5" /> พื้นที่ใช้งานของคุณ
          </p>
          <p className="mt-1 text-csmju-caption text-body">
            {quota.data
              ? `ใช้ไป ${formatBytes(quota.data.usedBytes)} จาก ${formatBytes(quota.data.quotaBytes)} · ใช้ CS Canvas ได้ฟรีทุกฟีเจอร์สำหรับนักศึกษาและบุคลากร`
              : 'กำลังโหลด…'}
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="พื้นที่ที่ใช้ไป" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <Link href="/account/storage" className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover">
            จัดการพื้นที่จัดเก็บ
          </Link>
        </section>

        <section className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface shadow-csmju-md">
          <button type="button" onClick={() => toggle('account')} aria-expanded={expanded === 'account'} className="flex w-full items-center gap-3 p-4 text-left">
            <Avatar email={me.email} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-csmju-h3 font-bold text-ink">{me.email.split('@')[0]}</span>
              <span className="block truncate text-csmju-caption text-muted">{me.email}</span>
            </span>
            <span className="inline-flex size-10 items-center justify-center rounded-full border border-line">
              <ChevronDown aria-hidden className={cx('size-5 transition-transform', expanded === 'account' && 'rotate-180')} />
            </span>
          </button>
          {expanded === 'account' && (
            <dl className="csmju-fade-in grid grid-cols-2 gap-y-2 border-t border-line px-5 py-4 text-csmju-caption">
              <dt className="text-muted">บทบาท</dt>
              <dd className="text-right text-ink">{ROLE_LABEL[me.coreRole] ?? me.coreRole}</dd>
              <dt className="text-muted">สิทธิ์ใน CS Canvas</dt>
              <dd className="text-right text-ink">{me.subsystemRole === 'ADMIN' ? 'ผู้ดูแลระบบ' : me.subsystemRole === 'EDITOR' ? 'เผยแพร่เทมเพลตได้' : 'ผู้สร้างงาน'}</dd>
            </dl>
          )}
        </section>

        <section className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface">
          <Row href="/help" icon={<BookOpen aria-hidden className="size-6 text-primary" />} label="คู่มือการใช้งาน" />
          <Row href="/templates?starred=true" icon={<Star aria-hidden className="size-6 text-primary" />} label="คอนเทนต์ติดดาว" />
          <Row href="/projects?view=uploads" icon={<CloudUpload aria-hidden className="size-6 text-primary" />} label="ไฟล์อัปโหลด" />
          <Row href="/assistant" icon={<Sparkles aria-hidden className="size-6 text-primary" />} label="ผู้ช่วย CS Canvas" last />
        </section>

        <nav aria-label="บัญชีและการตั้งค่า" className="mt-6">
          <PlainRow href="/account" icon={<CircleUserRound aria-hidden className="size-6" />} label="บัญชีของคุณ" />
          <PlainRow href="/account/accessibility" icon={<Settings aria-hidden className="size-6" />} label="การตั้งค่า" />
          <PlainRow href="/trash" icon={<Trash2 aria-hidden className="size-6" />} label="ถังขยะ" />
          <ExpandRow icon={<Contrast aria-hidden className="size-6" />} label="ธีม" open={expanded === 'theme'} onToggle={() => toggle('theme')}>
            <ThemeOptions />
          </ExpandRow>
          <ExpandRow icon={<Info aria-hidden className="size-6" />} label="ความช่วยเหลือและฟีดแบ็ก" open={expanded === 'help'} onToggle={() => toggle('help')}>
            <Link href="/assistant" className="flex min-h-11 items-center gap-3 px-4 text-csmju-caption text-ink hover:bg-surface-muted">
              <CircleHelp aria-hidden className="size-5" /> ผู้ช่วย
            </Link>
            <button type="button" onClick={() => setFeedback('SUGGESTION')} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted">
              <Lightbulb aria-hidden className="size-5" /> แนะนำการปรับปรุง
            </button>
            <button type="button" onClick={() => setFeedback('REPORT')} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted">
              <Flag aria-hidden className="size-5" /> รายงานคอนเทนต์
            </button>
            <Link href="/account/privacy" className="flex min-h-11 items-center gap-3 px-4 text-csmju-caption text-ink hover:bg-surface-muted">
              <ShieldCheck aria-hidden className="size-5" /> นโยบายความเป็นส่วนตัว
            </Link>
          </ExpandRow>
          <button type="button" onClick={() => void signOut()} className="flex min-h-14 w-full items-center gap-4 px-3 text-left text-csmju-body text-ink hover:bg-surface-muted">
            <LogOut aria-hidden className="size-6" /> ออกจากระบบ
          </button>
        </nav>
      </div>
      {feedback && <FeedbackDialog kind={feedback} onClose={() => setFeedback(null)} />}
    </div>
  );
}

function Row({ href, icon, label, last = false }: { href: string; icon: ReactNode; label: string; last?: boolean }) {
  return (
    <Link href={href} className={cx('flex min-h-16 items-center gap-4 px-5 text-csmju-body text-ink hover:bg-surface-muted', !last && 'border-b border-line')}>
      {icon}
      <span className="flex-1">{label}</span>
      <ChevronRight aria-hidden className="size-5 text-ink" />
    </Link>
  );
}

function PlainRow({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-4 px-3 text-csmju-body text-ink hover:bg-surface-muted">
      {icon}
      <span className="flex-1">{label}</span>
      <ChevronRight aria-hidden className="size-5" />
    </Link>
  );
}

function ExpandRow({ icon, label, open, onToggle, children }: { icon: ReactNode; label: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-14 w-full items-center gap-4 px-3 text-left text-csmju-body text-ink hover:bg-surface-muted">
        {icon}
        <span className="flex-1">{label}</span>
        <ChevronRight aria-hidden className={cx('size-5 transition-transform', open && 'rotate-90')} />
      </button>
      {open && <div className="csmju-fade-in mb-2 ml-10 rounded-2xl border border-line bg-surface py-1">{children}</div>}
    </div>
  );
}
