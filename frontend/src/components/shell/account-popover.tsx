'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check, ChevronRight, CircleHelp, CircleUserRound, Contrast, Flag, Info, Lightbulb, LogOut, Moon, Settings,
  ShieldCheck, Sun,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/csmju/api';
import { useMe, useSignOut } from '@/lib/csmju/session';
import type { Preference } from '@/lib/types';
import { Button, Dialog, FormField, cx, errorMessage, inputClass, useToast } from '../csmju/primitives';
import { applyTheme } from '../csmju/providers';
import { Avatar, ROLE_LABEL } from './avatar';

/// เปิดผู้ช่วยค้นหา (ปุ่ม ?) จากที่อื่นในหน้า — HelpAssistant ฟังเหตุการณ์นี้
export const OPEN_HELP_EVENT = 'csmju:open-help';

type Submenu = 'theme' | 'help' | null;

/// เมนูบัญชีแบบ Canva (ภาพบรีฟ "บัญชี" · "Theme" · "HELP")
///
/// ตัดรายการที่ระบบนี้ไม่มีจริงออก: สร้างทีม · เครื่องมือขั้นสูง · แผนและราคา · ประวัติการซื้อ · แอปเดสก์ท็อป
/// (ทีมอยู่ในแผนช่วงถัดไป ส่วนที่เหลือเป็นเรื่องการขายของ Canva ซึ่ง CS Canvas ไม่มี)
export function AccountPopover() {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<Submenu>(null);
  const [feedback, setFeedback] = useState<'SUGGESTION' | 'REPORT' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const me = useMe();
  const signOut = useSignOut();
  const name = me.email.split('@')[0];

  useEffect(() => {
    if (!open) return;

    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
        setSubmenu(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (submenu) setSubmenu(null);
      else setOpen(false);
    };

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, submenu]);

  const closeAll = () => {
    setOpen(false);
    setSubmenu(null);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="บัญชีของคุณ"
        title="บัญชีของคุณ"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setSubmenu(null);
        }}
        className="rounded-full ring-offset-2 ring-offset-canvas hover:ring-2 hover:ring-primary-soft-hover"
      >
        <Avatar email={me.email} />
      </button>

      {open && (
        <div role="menu" aria-label="บัญชี" className="absolute bottom-0 left-14 z-50 w-80 origin-bottom-left csmju-pop rounded-2xl border border-line bg-surface py-2 shadow-csmju-lg">
          <p className="px-4 py-1 text-csmju-caption font-semibold text-muted">บัญชี</p>
          <Link href="/account" onClick={closeAll} className="mx-2 flex items-center gap-3 rounded-xl bg-surface-muted px-3 py-3 hover:bg-primary-soft">
            <Avatar email={me.email} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-csmju-body font-semibold text-ink">{name}</span>
              <span className="block truncate text-csmju-caption text-muted">{me.email}</span>
              <span className="block text-csmju-caption text-primary">{ROLE_LABEL[me.coreRole] ?? me.coreRole}</span>
            </span>
            <ChevronRight aria-hidden className="size-5 text-muted" />
          </Link>
          <Divider />
          <MenuLink href="/account" icon={<CircleUserRound aria-hidden className="size-5" />} onNavigate={closeAll}>บัญชีของคุณ</MenuLink>
          <MenuLink href="/account/accessibility" icon={<Settings aria-hidden className="size-5" />} onNavigate={closeAll}>การตั้งค่า</MenuLink>
          <SubmenuButton icon={<Contrast aria-hidden className="size-5" />} active={submenu === 'theme'} onClick={() => setSubmenu(submenu === 'theme' ? null : 'theme')}>
            ธีม
          </SubmenuButton>
          <SubmenuButton icon={<Info aria-hidden className="size-5" />} active={submenu === 'help'} onClick={() => setSubmenu(submenu === 'help' ? null : 'help')}>
            ความช่วยเหลือและฟีดแบ็ก
          </SubmenuButton>
          <Divider />
          <button type="button" role="menuitem" onClick={() => void signOut()} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted">
            <LogOut aria-hidden className="size-5" />
            ออกจากระบบ
          </button>

          {submenu === 'theme' && <ThemeSubmenu />}
          {submenu === 'help' && (
            <HelpSubmenu
              onAssistant={() => {
                closeAll();
                window.dispatchEvent(new Event(OPEN_HELP_EVENT));
              }}
              onFeedback={(kind) => {
                closeAll();
                setFeedback(kind);
              }}
              onNavigate={closeAll}
            />
          )}
        </div>
      )}

      {feedback && <FeedbackDialog kind={feedback} onClose={() => setFeedback(null)} />}
    </div>
  );
}

function Divider() {
  return <div className="my-2 h-px bg-line" />;
}

function MenuLink({ href, icon, children, onNavigate }: { href: string; icon: ReactNode; children: ReactNode; onNavigate: () => void }) {
  return (
    <Link href={href} role="menuitem" onClick={onNavigate} className="flex min-h-11 items-center gap-3 px-4 text-csmju-caption text-ink hover:bg-surface-muted">
      {icon}
      {children}
    </Link>
  );
}

function SubmenuButton({ icon, active, onClick, children }: { icon: ReactNode; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={active}
      onClick={onClick}
      onMouseEnter={() => !active && onClick()}
      className={cx('flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted', active && 'bg-surface-muted')}
    >
      {icon}
      <span className="flex-1">{children}</span>
      <ChevronRight aria-hidden className="size-4 text-muted" />
    </button>
  );
}

/// เมนูย่อยลอยออกทางขวาของเมนูบัญชี
function Flyout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="menu" aria-label={label} className="absolute bottom-16 left-full z-50 ml-2 w-72 csmju-pop rounded-2xl border border-line bg-surface py-2 shadow-csmju-lg">
      {children}
    </div>
  );
}

function ThemeSubmenu() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: () => api.get<Preference>('/preferences') });
  const save = useMutation({
    mutationFn: (theme: Preference['theme']) => api.patch<Preference>('/preferences', { theme }),
    onMutate: (theme) => applyTheme(theme),
    onSuccess: (data) => queryClient.setQueryData(['preferences'], data),
    onError: (error) => {
      if (prefs.data) applyTheme(prefs.data.theme);
      toast(errorMessage(error), 'error');
    },
  });
  const current = save.isPending ? save.variables : prefs.data?.theme;
  const options: { value: Preference['theme']; label: string; icon: ReactNode }[] = [
    { value: 'LIGHT', label: 'สว่าง', icon: <Sun aria-hidden className="size-5" /> },
    { value: 'DARK', label: 'มืด', icon: <Moon aria-hidden className="size-5" /> },
    { value: 'SYSTEM', label: 'ตามการตั้งค่าอุปกรณ์', icon: <Contrast aria-hidden className="size-5" /> },
  ];

  return (
    <Flyout label="ธีม">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="menuitemradio"
          aria-checked={current === option.value}
          onClick={() => save.mutate(option.value)}
          className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted"
        >
          {option.icon}
          <span className="flex-1">{option.label}</span>
          {current === option.value && <Check aria-hidden className="size-5" />}
        </button>
      ))}
    </Flyout>
  );
}

function HelpSubmenu({
  onAssistant,
  onFeedback,
  onNavigate,
}: {
  onAssistant: () => void;
  onFeedback: (kind: 'SUGGESTION' | 'REPORT') => void;
  onNavigate: () => void;
}) {
  const item = 'flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption text-ink hover:bg-surface-muted';

  return (
    <Flyout label="ความช่วยเหลือและฟีดแบ็ก">
      <button type="button" role="menuitem" onClick={onAssistant} className={item}>
        <CircleHelp aria-hidden className="size-5" /> ผู้ช่วย
      </button>
      <button type="button" role="menuitem" onClick={() => onFeedback('SUGGESTION')} className={item}>
        <Lightbulb aria-hidden className="size-5" /> แนะนำการปรับปรุง
      </button>
      <button type="button" role="menuitem" onClick={() => onFeedback('REPORT')} className={item}>
        <Flag aria-hidden className="size-5" /> รายงานคอนเทนต์
      </button>
      <Link href="/account/privacy" role="menuitem" onClick={onNavigate} className={item}>
        <ShieldCheck aria-hidden className="size-5" /> นโยบายความเป็นส่วนตัว
      </Link>
    </Flyout>
  );
}

/// ส่งข้อเสนอแนะหรือรายงานเนื้อหาให้ผู้ดูแลระบบ (เก็บในฐานข้อมูลของ CS Canvas — ไม่ส่งออกนอกระบบ)
function FeedbackDialog({ kind, onClose }: { kind: 'SUGGESTION' | 'REPORT'; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [link, setLink] = useState(() => (typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''));
  const toast = useToast();
  const send = useMutation({
    mutationFn: () => api.post('/feedbacks', { kind, message: message.trim(), link: link.trim().startsWith('/') ? link.trim() : undefined }),
    onSuccess: () => {
      toast(kind === 'REPORT' ? 'ส่งรายงานให้ผู้ดูแลระบบแล้ว ขอบคุณที่ช่วยดูแลเนื้อหา' : 'ส่งข้อเสนอแนะแล้ว ขอบคุณครับ');
      onClose();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const tooShort = message.trim().length < 5;

  return (
    <Dialog
      open
      onClose={onClose}
      title={kind === 'REPORT' ? 'รายงานคอนเทนต์' : 'แนะนำการปรับปรุง'}
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" disabled={tooShort} loading={send.isPending} onClick={() => send.mutate()}>
            ส่ง
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-csmju-caption text-muted">
          {kind === 'REPORT'
            ? 'แจ้งเทมเพลตหรือเนื้อหาที่ไม่เหมาะสม ผู้ดูแลระบบจะเห็นเฉพาะข้อความและลิงก์ ไม่เห็นชื่อของคุณ'
            : 'บอกเราว่าอยากให้ CS Canvas ทำอะไรได้ดีขึ้น ผู้ดูแลระบบจะเห็นเฉพาะข้อความ ไม่เห็นชื่อของคุณ'}
        </p>
        <FormField label="รายละเอียด" error={message && tooShort ? 'เขียนอย่างน้อย 5 ตัวอักษร' : null} hint={`${message.length}/2000`}>
          {(props) => <textarea {...props} autoFocus rows={5} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} className={cx(inputClass, 'py-3')} />}
        </FormField>
        <FormField label="หน้าที่เกี่ยวข้อง" hint="ไม่บังคับ · path ภายในระบบ เช่น /templates">
          {(props) => <input {...props} maxLength={300} value={link} onChange={(e) => setLink(e.target.value)} className={inputClass} />}
        </FormField>
      </div>
    </Dialog>
  );
}
