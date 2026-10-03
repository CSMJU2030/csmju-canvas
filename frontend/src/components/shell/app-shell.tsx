'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell, CirclePlus, FolderOpen, House, LayoutTemplate, LogOut, Trash2, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { api } from '@/lib/csmju/api';
import { useMe, useSignOut } from '@/lib/csmju/session';
import type { NotificationItem } from '@/lib/types';
import { Menu, cx } from '../csmju/primitives';
import { CreateDesignProvider, useOpenCreate } from './create-dialog';
import { HelpAssistant } from './help-assistant';

const NAV = [
  { href: '/', label: 'หน้าหลัก', icon: House },
  { href: '/projects', label: 'โปรเจกต์', icon: FolderOpen },
  { href: '/templates', label: 'เทมเพลต', icon: LayoutTemplate },
  { href: '/trash', label: 'ถังขยะ', icon: Trash2 },
];

export const ROLE_LABEL: Record<string, string> = {
  student: 'นักศึกษา',
  alumni: 'ศิษย์เก่า',
  staff: 'บุคลากร',
  lecturer: 'อาจารย์',
  guest: 'ผู้เยี่ยมชม',
  admin: 'ผู้ดูแลระบบ',
};

/// โครงหน้าจอหลัก: แถบซ้าย (จอใหญ่) / แถบล่าง (มือถือ) + พื้นที่เนื้อหา + ปุ่มผู้ช่วย ?
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CreateDesignProvider>
      <div className="flex min-h-dvh">
        <Rail />
        <main id="main" className="min-w-0 flex-1 pb-24 md:p-2 md:pb-2">
          <div className="min-h-full rounded-none bg-surface md:min-h-[calc(100dvh-1rem)] md:rounded-3xl md:shadow-csmju-md">{children}</div>
        </main>
        <MobileBar />
        <HelpAssistant />
      </div>
    </CreateDesignProvider>
  );
}

function useUnreadCount() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.list<NotificationItem>('/notifications?unread=true&limit=1'),
    refetchInterval: 60_000,
  });

  return data?.meta.total ?? 0;
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function Rail() {
  const pathname = usePathname();
  const openCreate = useOpenCreate();
  const unread = useUnreadCount();

  return (
    <nav aria-label="เมนูหลัก" className="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col items-center gap-1 py-3 md:flex">
      <RailButton label="สร้าง" onClick={() => openCreate()}>
        <CirclePlus aria-hidden className="size-7 text-primary" />
      </RailButton>
      <div className="my-2 h-px w-10 bg-line" />
      {NAV.map((item) => (
        <RailLink key={item.href} href={item.href} label={item.label} active={isActive(pathname, item.href)}>
          <item.icon aria-hidden className="size-6" />
        </RailLink>
      ))}
      <div className="mt-auto flex flex-col items-center gap-1">
        <RailLink href="/notifications" label="แจ้งเตือน" active={isActive(pathname, '/notifications')} badge={unread}>
          <Bell aria-hidden className="size-6" />
        </RailLink>
        <AccountMenu />
      </div>
    </nav>
  );
}

function RailLink({
  href,
  label,
  active,
  badge = 0,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'relative flex w-16 flex-col items-center gap-0.5 rounded-xl py-2 text-csmju-caption',
        active ? 'bg-primary-soft font-semibold text-primary' : 'text-body hover:bg-surface',
      )}
    >
      {children}
      <span>{label}</span>
      {badge > 0 && (
        <span className="absolute top-1 right-2 min-w-5 rounded-full bg-danger px-1 text-center text-csmju-caption leading-5 text-on-inverse tabular-nums">
          {badge > 99 ? '99+' : badge}
          <span className="sr-only"> รายการที่ยังไม่อ่าน</span>
        </span>
      )}
    </Link>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-16 flex-col items-center gap-0.5 rounded-xl py-2 text-csmju-caption text-body hover:bg-surface">
      {children}
      <span>{label}</span>
    </button>
  );
}

function AccountMenu() {
  const me = useMe();
  const signOut = useSignOut();
  const router = useRouter();
  const initial = (me.email.split('@')[0] || '?').slice(0, 1).toUpperCase();

  return (
    <Menu
      label="บัญชีของคุณ"
      align="left"
      triggerClassName="size-12 rounded-full bg-primary text-on-inverse text-csmju-body font-semibold shadow-none hover:bg-primary-hover"
      trigger={<span aria-hidden>{initial}</span>}
      items={[
        {
          label: `${me.email} · ${ROLE_LABEL[me.coreRole] ?? me.coreRole}`,
          icon: <UserRound aria-hidden className="size-4" />,
          onSelect: () => router.push('/account'),
        },
        { label: 'ออกจากระบบ', icon: <LogOut aria-hidden className="size-4" />, onSelect: () => void signOut() },
      ]}
    />
  );
}

function MobileBar() {
  const pathname = usePathname();
  const openCreate = useOpenCreate();
  const unread = useUnreadCount();
  const items = [
    NAV[0],
    NAV[1],
    { href: '#create', label: 'สร้าง', icon: CirclePlus },
    { href: '/notifications', label: 'แจ้งเตือน', icon: Bell },
    { href: '/account', label: 'บัญชี', icon: UserRound },
  ];

  return (
    <nav aria-label="เมนูหลัก (มือถือ)" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface md:hidden">
      {items.map((item) =>
        item.href === '#create' ? (
          <button key={item.href} type="button" onClick={() => openCreate()} className="flex min-h-16 flex-1 flex-col items-center justify-center text-csmju-caption text-primary">
            <item.icon aria-hidden className="size-7" />
            {item.label}
          </button>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            className={cx(
              'relative flex min-h-16 flex-1 flex-col items-center justify-center text-csmju-caption',
              isActive(pathname, item.href) ? 'font-semibold text-primary' : 'text-body',
            )}
          >
            <item.icon aria-hidden className="size-6" />
            {item.label}
            {item.href === '/notifications' && unread > 0 && (
              <span className="absolute top-2 right-1/4 size-2.5 rounded-full bg-danger">
                <span className="sr-only">มีแจ้งเตือนที่ยังไม่อ่าน</span>
              </span>
            )}
          </Link>
        ),
      )}
    </nav>
  );
}
