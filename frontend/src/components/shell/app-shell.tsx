'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Bell, ShieldCheck, BookOpen, ChevronRight, Clock, Ellipsis, FolderOpen, House, LayoutTemplate, PanelLeft, Plus, Sparkles,
  Star, Trash2, UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/csmju/api';
import { CORE_HUB_WEB_URL } from '@/lib/csmju/core-hub';
import { useMe } from '@/lib/csmju/session';
import { isAdminRole } from '@/components/admin/admin-access';
import { relativeTime } from '@/lib/format';
import type { Asset, DesignSummary, Folder, NotificationItem } from '@/lib/types';
import { AssetPreview } from '@/components/projects/asset-preview';
import { UploadIcon } from '@/components/shell/upload-icon';
import { cx } from '../csmju/primitives';
import { ACCOUNT_SECTIONS } from './account-sections';
import { AccountPopover } from './account-popover';
import { Avatar } from './avatar';
import { CreateDesignProvider, useOpenCreate } from './create-dialog';
import { HelpAssistant } from './help-assistant';
import { NotificationIcon } from './notification-icon';

export { ROLE_LABEL } from './avatar';

const NAV = [
  { href: '/', label: 'หน้าหลัก', icon: House },
  { href: '/projects', label: 'โปรเจกต์', icon: FolderOpen },
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
        : pathname.startsWith('/templates')
          ? 'templates'
          : 'recent';
  // แถบรองเปิดเฉพาะเมื่อผู้ใช้กดปุ่มเมนูมุมซ้ายบนเท่านั้น (กดไอคอนในแถบซ้ายไม่ทำให้เด้งขึ้นเอง)
  // ค่าเดียวใช้ทุกหน้า — เปิดไว้แล้วเปลี่ยนหน้าก็ยังเปิดอยู่ แค่เนื้อหาในแถบเปลี่ยนตามหน้า
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  return (
    <CreateDesignProvider>
      <SecondaryOpenContext.Provider value={secondaryOpen}>
      <div className="csmju-sidebar flex min-h-dvh bg-canvas">
        <Rail open={secondaryOpen} onToggleSecondary={() => setSecondaryOpen((v) => !v)} />
        {/* เลื่อนเข้า-ออกด้วยการเปลี่ยนความกว้าง + จางเข้า · ปิดแล้วใช้ inert กัน Tab เข้าไปโฟกัสของที่มองไม่เห็น */}
        <aside
          aria-label="เมนูรอง"
          aria-hidden={!secondaryOpen}
          inert={!secondaryOpen}
          className={cx(
            'csmju-on-brand sticky top-0 hidden h-dvh shrink-0 overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none lg:block',
            secondaryOpen ? 'w-64 opacity-100' : 'w-0 opacity-0',
          )}
        >
          <div
            className={cx(
              'flex h-full w-64 flex-col px-3 py-4 transition-transform duration-300 ease-out motion-reduce:transition-none',
              secondaryOpen ? 'translate-x-0' : '-translate-x-6',
            )}
          >
            <Link href="/" className="mb-4 flex items-center gap-2.5 px-2">
              {/* โลโก้สาขาชุดเดียวกับ Core Hub ในวงกลมขาว */}
              <span className="csmju-logo-badge size-10 shrink-0 p-0.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์เล็กใน public ไม่ต้องผ่านตัวย่อรูป */}
                <img src="/csmju-mark.png" alt="" width={36} height={36} className="size-9 rounded-full object-contain" />
              </span>
              <span className="csmju-logo text-csmju-h2 leading-tight">CS Canvas</span>
            </Link>
            {secondary === 'projects' ? (
              <ProjectsNav />
            ) : secondary === 'account' ? (
              <AccountNav />
            ) : secondary === 'templates' ? (
              <TemplatesNav />
            ) : (
              <RecentDesignsNav />
            )}
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

type SecondaryKind = 'recent' | 'projects' | 'account' | 'templates';

function Rail({ open, onToggleSecondary }: { open: boolean; onToggleSecondary: () => void }) {
  const pathname = usePathname();
  const openCreate = useOpenCreate();
  const me = useMe();

  // z-40: ป๊อปโอเวอร์บัญชี/แจ้งเตือนลอยออกจากแถบนี้ ต้องอยู่เหนือแถบรองและแผ่นเนื้อหา
  // ไม่งั้นมองเห็นแต่กดไม่ได้ (แถบรองกับ <main> อยู่ทีหลังใน DOM จึงทับอยู่)
  return (
    <nav aria-label="เมนูหลัก" className="csmju-on-brand sticky top-0 z-40 hidden h-dvh w-20 shrink-0 flex-col items-center gap-1 py-3 md:flex">
      <Link href="/" aria-label="CS Canvas หน้าแรก" className="csmju-logo-badge mb-2 size-11 p-0.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์เล็กใน public ไม่ต้องผ่านตัวย่อรูป */}
        <img src="/csmju-mark.png" alt="" width={40} height={40} className="size-10 rounded-full object-contain" />
      </Link>
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
        <span className="csmju-gradient-button flex size-10 items-center justify-center rounded-full shadow-csmju-md ring-2 ring-white/70">
          <Plus aria-hidden className="csmju-wiggle size-6" strokeWidth={2.5} />
        </span>
        สร้าง
      </button>
      {/* ไอคอน "เทมเพลต" โผล่ต่อท้ายพร้อมเส้นคั่นเมื่อเปิดแท็บเทมเพลต (ภาพบรีฟ "เมื่อกด เทมเพลต") */}
      {[...NAV, ...(pathname.startsWith('/templates') ? [{ href: '/templates', label: 'เทมเพลต', icon: LayoutTemplate }] : [])].map((item, index) => {
        const active = isActive(pathname, item.href);

        return (
          <div key={item.href} className={cx('flex flex-col items-center', index === NAV.length && 'csmju-pop')}>
          {index === NAV.length && <span aria-hidden className="my-2 h-px w-8 bg-line-strong" />}
          <Link href={item.href} aria-current={active ? 'page' : undefined} className="group flex w-16 flex-col items-center gap-1 py-1 text-csmju-caption text-ink">
            <span
              className={cx(
                'flex size-10 items-center justify-center rounded-xl transition-colors',
                active ? 'bg-surface text-primary shadow-csmju-sm' : 'text-body group-hover:bg-surface/70',
              )}
            >
              <item.icon aria-hidden className="csmju-wiggle size-5" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
            </span>
            <span className={cx(active && 'font-semibold text-primary')}>{item.label}</span>
          </Link>
          </div>
        );
      })}
      <div className="mt-auto flex flex-col items-center gap-3">
        {isAdminRole(me.coreRole) && (
          <Link href="/admin" aria-current={pathname.startsWith('/admin') ? 'page' : undefined} className="group flex w-16 flex-col items-center gap-1 text-csmju-caption text-ink">
            <span className={cx('flex size-10 items-center justify-center rounded-xl', pathname.startsWith('/admin') ? 'bg-surface text-primary shadow-csmju-sm' : 'text-body group-hover:bg-surface/70')}>
              <ShieldCheck aria-hidden className="csmju-wiggle size-5" />
            </span>
            <span className={cx(pathname.startsWith('/admin') && 'font-semibold text-primary')}>ผู้ดูแล</span>
          </Link>
        )}
        {/* ปุ่มกลับพอร์ทัลกลาง (ui-design-system.md ข้อ 5.1) — ไปอีก origin จึงใช้ <a> ไม่ใช่ Link */}
        <a href={CORE_HUB_WEB_URL} aria-label="กลับ CSMJU Portal" title="กลับ CSMJU Portal" className="group flex w-16 flex-col items-center gap-1 text-csmju-caption text-ink">
          <span className="flex size-10 items-center justify-center rounded-xl text-body group-hover:bg-surface/70">
            <ArrowLeft aria-hidden className="size-5" />
          </span>
          Portal
        </a>
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
          <span className="csmju-pop absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-csmju-caption leading-none font-bold text-on-inverse ring-2 ring-canvas tabular-nums">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="การแจ้งเตือน" className="csmju-pop csmju-on-surface absolute bottom-0 left-14 z-50 flex max-h-popover w-96 flex-col rounded-2xl border border-line bg-surface shadow-csmju-lg">
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
                        <NotificationIcon kind={n.kind} />
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
    queryFn: () => api.list<DesignSummary>('/designs?limit=6&sort=updated'),
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
        {(recent.data?.meta.total ?? 0) > 6 && (
          <Link href="/projects?view=recent" className="flex min-h-11 items-center justify-center rounded-xl text-csmju-caption font-semibold text-primary hover:bg-surface/70">
            ดูทั้งหมด
          </Link>
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
            <UploadsTree active={onProjects && view === 'uploads'} focus={params.get('asset')} />
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

/// "อัปโหลด" ในแถบรองกางดูไฟล์ล่าสุดได้ (ภาพบรีฟ "อัพโหลดแบบใหม่") — กดไฟล์เพื่อเปิดรายละเอียด
function UploadsTree({ active, focus }: { active: boolean; focus: string | null }) {
  const [open, setOpen] = useState(false);
  const files = useQuery({
    queryKey: ['assets', 'sidebar'],
    queryFn: () => api.list<Asset>('/assets?limit=30'),
    enabled: open,
  });

  return (
    <div>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'ซ่อนไฟล์อัปโหลด' : 'แสดงไฟล์อัปโหลด'}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface/70"
        >
          <ChevronRight aria-hidden className={cx('size-4 transition-transform', open && 'rotate-90')} />
        </button>
        <div className="min-w-0 flex-1">
          <SideLink href="/projects?view=uploads" label="อัปโหลด" icon={<UploadIcon className="size-5 text-muted" />} active={active && !focus} />
        </div>
      </div>
      {open && (
        <div className="csmju-fade-in ml-6 flex flex-col gap-0.5">
          {files.isLoading ? (
            <p className="px-3 py-2 text-csmju-caption text-muted">กำลังโหลด…</p>
          ) : (files.data?.items.length ?? 0) === 0 ? (
            <p className="px-3 py-2 text-csmju-caption text-muted">ยังไม่มีไฟล์</p>
          ) : (
            files.data!.items.map((file) => (
              <Link
                key={file.id}
                href={`/projects?view=uploads&asset=${file.id}`}
                title={file.fileName}
                aria-current={focus === file.id ? 'page' : undefined}
                className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-csmju-caption hover:bg-surface/70', focus === file.id ? 'bg-primary-soft-hover font-semibold text-primary' : 'text-ink')}
              >
                <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface">
                  <AssetPreview asset={file} className="size-full object-cover" iconClassName="size-3.5" />
                </span>
                <span className="truncate">{file.fileName}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/// แถบรองของแท็บเทมเพลต (ภาพบรีฟ "เมื่อกด เทมเพลต") — ใช้หมวดที่ระบบนี้มีจริง
/// (ไม่มีคลังภาพถ่าย/กราฟิกจากบริการภายนอก จึงแทนด้วยเทมเพลตตั้งต้น · ที่ฉันเผยแพร่ · ติดดาว)
function TemplatesNav() {
  return (
    <Suspense fallback={null}>
      <TemplatesNavInner />
    </Suspense>
  );
}

function TemplatesNavInner() {
  const params = useSearchParams();
  const me = useMe();
  const canPublish = me.subsystemRole === 'EDITOR' || me.subsystemRole === 'ADMIN';
  const current = params.get('starred') ? 'starred' : params.get('builtIn') ? 'builtIn' : params.get('owner') === 'me' ? 'mine' : 'all';
  const items = [
    { key: 'all', href: '/templates', label: 'เทมเพลต', icon: <LayoutTemplate aria-hidden className="size-5" /> },
    { key: 'builtIn', href: '/templates?builtIn=true', label: 'เทมเพลตตั้งต้นของทีม', icon: <Sparkles aria-hidden className="size-5" /> },
    ...(canPublish ? [{ key: 'mine', href: '/templates?owner=me', label: 'ที่ฉันเผยแพร่', icon: <UserRound aria-hidden className="size-5" /> }] : []),
    { key: 'starred', href: '/templates?starred=true', label: 'คอนเทนต์ติดดาว', icon: <Star aria-hidden className="size-5" /> },
  ];

  return (
    <nav aria-label="เทมเพลต" className="flex flex-col gap-0.5">
      {items.map((item) => (
        <SideLink key={item.key} href={item.href} label={item.label} icon={item.icon} active={current === item.key} />
      ))}
    </nav>
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

/// แถบล่างของมือถือ 5 แท็บตามภาพบรีฟ: หน้าหลัก · ดีไซน์ของคุณ · เทมเพลต · ผู้ช่วย · เพิ่มเติม
/// (สร้างงานใหม่ใช้ปุ่มลอยในหน้าแรกและปุ่ม + ในหน้าดีไซน์ของคุณ · แจ้งเตือนอยู่ในหน้าเพิ่มเติม)
function MobileBar() {
  const pathname = usePathname();
  const unread = useUnread();
  const items = [
    { href: '/', label: 'หน้าหลัก', icon: House, match: ['/'] },
    { href: '/projects', label: 'ดีไซน์ของคุณ', icon: FolderOpen, match: ['/projects', '/trash'] },
    { href: '/templates', label: 'เทมเพลต', icon: LayoutTemplate, match: ['/templates'] },
    { href: '/assistant', label: 'ผู้ช่วย', icon: Sparkles, match: ['/assistant', '/help'] },
    { href: '/more', label: 'เพิ่มเติม', icon: Ellipsis, match: ['/more', '/account', '/notifications'] },
  ];

  return (
    <nav aria-label="เมนูหลัก (มือถือ)" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-safe md:hidden">
      {items.map((item) => {
        const active = item.match.some((m) => (m === '/' ? pathname === '/' : pathname.startsWith(m)));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cx('group relative flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-csmju-caption leading-tight', active ? 'font-semibold text-primary' : 'text-body')}
          >
            {item.href === '/assistant' && active ? (
              <span className="csmju-gradient-button flex size-7 items-center justify-center rounded-full">
                <item.icon aria-hidden className="size-4" />
              </span>
            ) : (
              <item.icon aria-hidden className="csmju-wiggle size-6" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.2 : 0} />
            )}
            <span className="max-w-full truncate px-0.5">{item.label}</span>
            {item.href === '/more' && unread > 0 && (
              <span className="absolute top-2 right-1/4 size-2.5 rounded-full bg-danger ring-2 ring-surface">
                <span className="sr-only">มีแจ้งเตือนที่ยังไม่อ่าน</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
