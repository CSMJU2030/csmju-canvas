'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, BookOpen, ChevronRight, CircleUserRound, Clock, CloudUpload, FolderOpen, House, LayoutTemplate, LogOut, PanelLeft, Plus,
  Settings, Trash2, UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/csmju/api';
import { useMe, useSignOut } from '@/lib/csmju/session';
import { relativeTime } from '@/lib/format';
import type { DesignSummary, Folder, NotificationItem } from '@/lib/types';
import { cx } from '../csmju/primitives';
import { ACCOUNT_SECTIONS } from './account-sections';
import { CreateDesignProvider, useOpenCreate } from './create-dialog';
import { HelpAssistant } from './help-assistant';

export const ROLE_LABEL: Record<string, string> = {
  student: 'นักศึกษา',
  alumni: 'ศิษย์เก่า',
  staff: 'บุคลากร',
  lecturer: 'อาจารย์',
  guest: 'ผู้เยี่ยมชม',
  admin: 'ผู้ดูแลระบบ',
};

const NAV = [
  { href: '/', label: 'หน้าหลัก', icon: House },
  { href: '/projects', label: 'โปรเจกต์', icon: FolderOpen },
  { href: '/templates', label: 'เทมเพลต', icon: LayoutTemplate },
  { href: '/help', label: 'คู่มือ', icon: BookOpen },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/// โครงหน้าจอแบบ Canva: แถบไอคอนซ้าย (พื้นม่วงอ่อน) + แถบรองตามหน้า + แผ่นเนื้อหาสีขาวขอบมน
/// หน้าลูกใช้รู้ว่าแถบรองเปิดอยู่ไหม (หน้าบัญชีแสดงแท็บแนวนอนแทนเมื่อแถบปิด)
const SecondaryOpenContext = createContext(false);

export function useSecondaryOpen() {
  return useContext(SecondaryOpenContext);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const secondary: SecondaryKind =
    pathname.startsWith('/projects') || pathname.startsWith('/trash')
      ? 'projects'
      : pathname.startsWith('/account')
        ? 'account'
        : 'recent';
  // แถบรองเปิดเฉพาะเมื่อผู้ใช้กดปุ่มเมนูมุมซ้ายบนเท่านั้น (กดไอคอนในแถบซ้ายไม่ทำให้เด้งขึ้นเอง)
  // ค่าเดียวใช้ทุกหน้า — เปิดไว้แล้วเปลี่ยนหน้าก็ยังเปิดอยู่ แค่เนื้อหาในแถบเปลี่ยนตามหน้า
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  return (
    <CreateDesignProvider>
      <SecondaryOpenContext.Provider value={secondaryOpen}>
      <div className="flex min-h-dvh bg-canvas">
        <Rail open={secondaryOpen} onToggleSecondary={() => setSecondaryOpen((v) => !v)} />
        {/* เลื่อนเข้า-ออกด้วยการเปลี่ยนความกว้าง + จางเข้า · ปิดแล้วใช้ inert กัน Tab เข้าไปโฟกัสของที่มองไม่เห็น */}
        <aside
          aria-label="เมนูรอง"
          aria-hidden={!secondaryOpen}
          inert={!secondaryOpen}
          className={cx(
            'sticky top-0 hidden h-dvh shrink-0 overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none lg:block',
            secondaryOpen ? 'w-64 opacity-100' : 'w-0 opacity-0',
          )}
        >
          <div
            className={cx(
              'flex h-full w-64 flex-col px-3 py-4 transition-transform duration-300 ease-out motion-reduce:transition-none',
              secondaryOpen ? 'translate-x-0' : '-translate-x-6',
            )}
          >
            <Link href="/" className="csmju-gradient-text mb-4 px-3 text-csmju-h2 font-bold italic">
              CS Canvas
            </Link>
            {secondary === 'projects' ? <ProjectsNav /> : secondary === 'account' ? <AccountNav /> : <RecentDesignsNav />}
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1 pb-24 md:py-2 md:pr-2 md:pb-2">
          <div className="relative min-h-dvh overflow-hidden bg-surface md:min-h-panel md:rounded-3xl md:shadow-csmju-md">
            {children}
          </div>
        </main>
        <MobileBar />
        <HelpAssistant />
      </div>
      </SecondaryOpenContext.Provider>
    </CreateDesignProvider>
  );
}

function useUnread() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.list<NotificationItem>('/notifications?unread=true&limit=1'),
    refetchInterval: 60_000,
  }).data?.meta.total ?? 0;
}

type SecondaryKind = 'recent' | 'projects' | 'account';

function Rail({ open, onToggleSecondary }: { open: boolean; onToggleSecondary: () => void }) {
  const pathname = usePathname();
  const openCreate = useOpenCreate();

  return (
    <nav aria-label="เมนูหลัก" className="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col items-center gap-1 py-3 md:flex">
      {/* ปุ่มเปิด/ปิดแถบรอง + tooltip สีเข้มใต้ปุ่มแบบ Canva ("ปิดเมนู" / "เปิดเมนู") */}
      <div className="group relative mb-2">
        <button
          type="button"
          onClick={onToggleSecondary}
          aria-label={open ? 'ปิดเมนู' : 'เปิดเมนู'}
          aria-expanded={open}
          className={cx(
            'inline-flex size-11 items-center justify-center rounded-xl text-body hover:bg-primary-soft',
            open && 'bg-primary-soft text-primary',
          )}
        >
          <PanelLeft aria-hidden className="size-5" />
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute top-full left-1/2 z-50 mt-1 -translate-x-1/2 rounded-lg bg-inverse px-2.5 py-1 text-csmju-caption whitespace-nowrap text-on-inverse opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        >
          {open ? 'ปิดเมนู' : 'เปิดเมนู'}
        </span>
      </div>
      <button type="button" onClick={() => openCreate()} className="group mb-3 flex w-16 flex-col items-center gap-1 text-csmju-caption text-ink">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-on-inverse shadow-csmju-md transition-transform group-hover:scale-105">
          <Plus aria-hidden className="size-6" strokeWidth={2.5} />
        </span>
        สร้าง
      </button>
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);

        return (
          <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className="group flex w-16 flex-col items-center gap-1 py-1 text-csmju-caption text-ink">
            <span
              className={cx(
                'flex size-10 items-center justify-center rounded-xl transition-colors',
                active ? 'bg-surface text-primary shadow-csmju-sm' : 'text-body group-hover:bg-surface/70',
              )}
            >
              <item.icon aria-hidden className="size-5" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
            </span>
            <span className={cx(active && 'font-semibold text-primary')}>{item.label}</span>
          </Link>
        );
      })}
      <div className="mt-auto flex flex-col items-center gap-3">
        <NotificationsPopover />
        <AccountPopover />
      </div>
    </nav>
  );
}

/// ป๊อปโอเวอร์ที่ลอยออกจากแถบซ้าย (แจ้งเตือน · บัญชี) — ปิดเมื่อคลิกข้างนอกหรือ Esc
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, ref };
}

function NotificationsPopover() {
  const { open, setOpen, ref } = usePopover();
  const unread = useUnread();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['notifications', 'popover'],
    queryFn: () => api.list<NotificationItem>('/notifications?limit=8'),
    enabled: open,
  });
  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications', { read: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unread ? `การแจ้งเตือน (${unread} รายการที่ยังไม่อ่าน)` : 'การแจ้งเตือน'}
        title="การแจ้งเตือน"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx('relative inline-flex size-11 items-center justify-center rounded-xl text-body hover:bg-surface/70', open && 'bg-primary-soft text-primary')}
      >
        <Bell aria-hidden className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-danger px-1 text-center text-csmju-caption leading-5 text-on-inverse tabular-nums">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="การแจ้งเตือน" className="absolute bottom-0 left-14 z-50 flex max-h-popover w-96 flex-col rounded-2xl border border-line bg-surface shadow-csmju-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-csmju-body font-semibold text-ink">การแจ้งเตือน</h2>
            <button type="button" onClick={() => markAll.mutate()} className="min-h-11 px-2 text-csmju-caption font-semibold text-ink hover:text-primary">
              อ่านทั้งหมดแล้ว
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.isLoading ? (
              <p className="p-4 text-csmju-caption text-muted">กำลังโหลด…</p>
            ) : (list.data?.items.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Bell aria-hidden className="size-7" />
                </span>
                <p className="text-csmju-body font-semibold text-ink">ยังไม่มีการแจ้งเตือน</p>
                <p className="text-csmju-caption text-muted">เช่น เมื่อมีคนใช้เทมเพลตของคุณ</p>
              </div>
            ) : (
              <ul>
                {list.data!.items.map((n) => (
                  <li key={n.id} className="border-b border-line last:border-b-0">
                    <Link href={n.link ?? '/notifications'} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-surface-muted">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                        {n.kind === 'TEMPLATE_USED' ? <LayoutTemplate aria-hidden className="size-5" /> : <Trash2 aria-hidden className="size-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-csmju-caption text-ink">{n.title}</span>
                        <span className="block text-csmju-caption text-muted">{relativeTime(n.createdAt)}</span>
                      </span>
                      {!n.readAt && <span aria-label="ยังไม่อ่าน" className="mt-2 size-2.5 shrink-0 rounded-full bg-danger" />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="border-t border-line px-4 py-3 text-center text-csmju-caption font-semibold text-primary hover:bg-surface-muted">
            ดูการแจ้งเตือนทั้งหมด
          </Link>
        </div>
      )}
    </div>
  );
}

export function Avatar({ email, size = 'md' }: { email: string; size?: 'sm' | 'md' | 'lg' }) {
  const initial = (email.split('@')[0] || '?').slice(0, 1).toUpperCase();

  return (
    <span
      aria-hidden
      className={cx(
        'csmju-gradient-button flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'lg' ? 'size-14 text-csmju-h3' : size === 'sm' ? 'size-7 text-csmju-caption' : 'size-10 text-csmju-body',
      )}
    >
      {initial}
    </span>
  );
}

function AccountPopover() {
  const { open, setOpen, ref } = usePopover();
  const me = useMe();
  const signOut = useSignOut();
  const items = [
    { href: '/account', label: 'บัญชีของคุณ', icon: CircleUserRound },
    { href: '/account/accessibility', label: 'การตั้งค่า', icon: Settings },
    { href: '/help', label: 'ความช่วยเหลือและคู่มือ', icon: BookOpen },
  ];

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="บัญชีของคุณ" title="บัญชีของคุณ" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="rounded-full ring-offset-2 hover:ring-2 hover:ring-primary-soft-hover">
        <Avatar email={me.email} />
      </button>
      {open && (
        <div role="dialog" aria-label="บัญชี" className="absolute bottom-0 left-14 z-50 w-80 rounded-2xl border border-line bg-surface py-2 shadow-csmju-lg">
          <p className="px-4 py-1 text-csmju-caption font-semibold text-muted">บัญชี</p>
          <Link href="/account" onClick={() => setOpen(false)} className="mx-2 flex items-center gap-3 rounded-xl bg-surface-muted px-3 py-3 hover:bg-primary-soft">
            <Avatar email={me.email} size="lg" />
            <span className="min-w-0">
              <span className="block truncate text-csmju-body font-semibold text-ink">{me.email.split('@')[0]}</span>
              <span className="block truncate text-csmju-caption text-muted">{me.email}</span>
              <span className="block text-csmju-caption text-primary">{ROLE_LABEL[me.coreRole] ?? me.coreRole}</span>
            </span>
          </Link>
          <div className="my-2 h-px bg-line" />
          {items.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 px-4 text-csmju-caption text-ink hover:bg-surface-muted">
              <item.icon aria-hidden className="size-5" />
              {item.label}
            </Link>
          ))}
          <div className="my-2 h-px bg-line" />
          <button type="button" onClick={() => void signOut()} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted">
            <LogOut aria-hidden className="size-5" />
            ออกจากระบบ
          </button>
        </div>
      )}
    </div>
  );
}

function SideLink({ href, label, icon, active }: { href: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex min-h-11 items-center gap-3 rounded-xl px-3 text-csmju-caption',
        active ? 'bg-primary-soft-hover font-semibold text-primary' : 'text-ink hover:bg-surface/70',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/// แถบรองของหน้าแรก: "ดีไซน์ล่าสุด" พร้อมภาพย่อเล็ก (เลื่อนได้) + ถังขยะด้านล่าง
function RecentDesignsNav() {
  const pathname = usePathname();
  const recent = useQuery({
    queryKey: ['designs', 'recent-nav'],
    queryFn: () => api.list<DesignSummary>('/designs?limit=30&sort=updated'),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-1 px-3 text-csmju-caption font-semibold text-muted">ดีไซน์ล่าสุด</p>
      <nav aria-label="ดีไซน์ล่าสุด" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
        {recent.isLoading ? (
          <p className="px-3 py-2 text-csmju-caption text-muted">กำลังโหลด…</p>
        ) : recent.isError ? (
          <p className="px-3 py-2 text-csmju-caption text-danger">โหลดดีไซน์ล่าสุดไม่สำเร็จ</p>
        ) : (recent.data?.items.length ?? 0) === 0 ? (
          <p className="px-3 py-2 text-csmju-caption text-muted">ยังไม่มีดีไซน์ — ดีไซน์ที่คุณเปิดแก้จะขึ้นที่นี่</p>
        ) : (
          recent.data!.items.map((design) => (
            <Link
              key={design.id}
              href={`/design/${design.id}`}
              title={design.title}
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-csmju-caption text-ink hover:bg-surface/70"
            >
              <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface shadow-csmju-sm">
                {design.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ภาพย่อเป็น data URL จากฐานข้อมูล
                  <img src={design.thumbnail} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <LayoutTemplate aria-hidden className="size-4 text-muted" />
                )}
              </span>
              <span className="truncate">{design.title}</span>
            </Link>
          ))
        )}
      </nav>
      <div className="mt-2 border-t border-line pt-2">
        <SideLink href="/trash" label="ถังขยะ" icon={<Trash2 aria-hidden className="size-5" />} active={pathname.startsWith('/trash')} />
      </div>
    </div>
  );
}

function ProjectsNav() {
  // useSearchParams ต้องอยู่ใต้ Suspense ไม่งั้น next build ล้มตอน prerender
  return (
    <Suspense fallback={null}>
      <ProjectsNavInner />
    </Suspense>
  );
}

/// แถบรองของหน้าโปรเจกต์ตามภาพบรีฟ: โปรเจกต์ทั้งหมด · ล่าสุด · โปรเจกต์ของคุณ (กางดูโฟลเดอร์ได้) · ถังขยะ
function ProjectsNavInner() {
  const pathname = usePathname();
  const params = useSearchParams();
  const me = useMe();
  const [expanded, setExpanded] = useState(true);
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.list<Folder>('/folders?limit=100') });
  const view = params.get('view');
  const folder = params.get('folder');
  const onProjects = pathname === '/projects';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="โปรเจกต์" className="flex min-h-0 flex-col gap-0.5">
        <SideLink href="/projects" label="โปรเจกต์ทั้งหมด" icon={<FolderOpen aria-hidden className="size-5" />} active={onProjects && !view && !folder} />
        <SideLink href="/projects?view=recent" label="ล่าสุด" icon={<Clock aria-hidden className="size-5" />} active={onProjects && view === 'recent'} />
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'ซ่อนโฟลเดอร์ของคุณ' : 'แสดงโฟลเดอร์ของคุณ'}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface/70"
          >
            <ChevronRight aria-hidden className={cx('size-4 transition-transform', expanded && 'rotate-90')} />
          </button>
          <span className="flex min-h-11 min-w-0 items-center gap-3 text-csmju-caption text-ink">
            <Avatar email={me.email} size="sm" />
            <span className="truncate">โปรเจกต์ของคุณ</span>
          </span>
        </div>
        {expanded && (
          <div className="ml-6 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
            <SideLink href="/projects?view=uploads" label="อัปโหลด" icon={<CloudUpload aria-hidden className="size-5 text-muted" />} active={onProjects && view === 'uploads'} />
            {folders.data?.items.map((f) => (
              <SideLink key={f.id} href={`/projects?folder=${f.id}`} label={f.name} icon={<FolderOpen aria-hidden className="size-5 text-muted" />} active={onProjects && folder === f.id} />
            ))}
          </div>
        )}
      </nav>
      <div className="mt-auto border-t border-line pt-2">
        <SideLink href="/trash" label="ถังขยะ" icon={<Trash2 aria-hidden className="size-5" />} active={pathname.startsWith('/trash')} />
      </div>
    </div>
  );
}

function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="หัวข้อบัญชี" className="flex flex-col gap-0.5">
      {ACCOUNT_SECTIONS.map((s) => {
        const href = s.key === 'profile' ? '/account' : `/account/${s.key}`;

        return <SideLink key={s.key} href={href} label={s.label} icon={<s.icon aria-hidden className="size-5" />} active={pathname === href} />;
      })}
    </nav>
  );
}

function MobileBar() {
  const pathname = usePathname();
  const openCreate = useOpenCreate();
  const unread = useUnread();
  const items = [
    { href: '/', label: 'หน้าหลัก', icon: House },
    { href: '/projects', label: 'โปรเจกต์', icon: FolderOpen },
    { href: '#create', label: 'สร้าง', icon: Plus },
    { href: '/notifications', label: 'แจ้งเตือน', icon: Bell },
    { href: '/account', label: 'บัญชี', icon: UserRound },
  ];

  return (
    <nav aria-label="เมนูหลัก (มือถือ)" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface md:hidden">
      {items.map((item) =>
        item.href === '#create' ? (
          <button key={item.href} type="button" onClick={() => openCreate()} className="flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-csmju-caption text-ink">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-on-inverse">
              <item.icon aria-hidden className="size-5" strokeWidth={2.5} />
            </span>
            {item.label}
          </button>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            className={cx('relative flex min-h-16 flex-1 flex-col items-center justify-center text-csmju-caption', isActive(pathname, item.href) ? 'font-semibold text-primary' : 'text-body')}
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
