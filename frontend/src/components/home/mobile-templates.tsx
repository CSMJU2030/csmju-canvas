'use client';

import { BriefcaseBusiness, CalendarDays, Check, ChevronDown, GraduationCap, Megaphone, Search, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { cx } from '@/components/csmju/primitives';
import { useMe } from '@/lib/csmju/session';

const CHIPS: { key: string; label: string; icon: ReactNode }[] = [
  { key: 'career', label: 'งานและอาชีพ', icon: <BriefcaseBusiness aria-hidden className="size-4 text-type-teal" /> },
  { key: 'social', label: 'โซเชียลมีเดีย', icon: <Share2 aria-hidden className="size-4 text-type-red" /> },
  { key: 'event', label: 'กิจกรรม', icon: <CalendarDays aria-hidden className="size-4 text-type-pink" /> },
  { key: 'education', label: 'การศึกษา', icon: <GraduationCap aria-hidden className="size-4 text-type-purple" /> },
  { key: 'announcement', label: 'ประกาศ', icon: <Megaphone aria-hidden className="size-4 text-type-orange" /> },
];

/// หัวของแท็บเทมเพลตบนมือถือ (ภาพบรีฟ "เทมเพลต1" – "เทมเพลต1.6")
///
/// "เทมเพลต ⌄" เปิดเมนูเลือกขอบเขต (เหมือนแถบรองบนจอใหญ่) · หัวย่อติดด้านบนเมื่อเลื่อนลง
export function MobileTemplatesShell({
  query,
  onQuery,
  category,
  onCategory,
  children,
}: {
  query: string;
  onQuery: (q: string) => void;
  category: string;
  onCategory: (c: string) => void;
  children: ReactNode;
}) {
  const heroRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const hero = heroRef.current;

    if (!hero) return;

    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { threshold: 0 });

    observer.observe(hero);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="pb-28">
      <div
        className={cx(
          'fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface px-4 transition-transform duration-200',
          compact ? 'translate-y-0' : '-translate-y-full',
        )}
        aria-hidden={!compact}
        inert={!compact}
      >
        <ScopeMenu compact />
        <button
          type="button"
          aria-label="ค้นหาเทมเพลต"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => inputRef.current?.focus(), 300);
          }}
          className="inline-flex size-11 items-center justify-center rounded-xl text-ink"
        >
          <Search aria-hidden className="size-6" />
        </button>
      </div>

      <section ref={heroRef} className="csmju-hero px-4 pt-8 pb-4">
        <ScopeMenu />
        <form role="search" onSubmit={(e) => e.preventDefault()} className="mt-5">
          <div className="csmju-search relative rounded-2xl">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink" />
            <label htmlFor="mobile-template-search" className="sr-only">ค้นหาเทมเพลต</label>
            <input
              id="mobile-template-search"
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="ค้นหาเทมเพลต"
              className="min-h-14 w-full rounded-2xl bg-transparent pr-4 pl-12 text-csmju-body text-ink placeholder:text-muted focus:outline-none"
            />
          </div>
        </form>
        <ul className="csmju-scroll-x -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
          {CHIPS.map((chip) => (
            <li key={chip.key} className="shrink-0">
              <button
                type="button"
                aria-pressed={category === chip.key}
                onClick={() => onCategory(category === chip.key ? '' : chip.key)}
                className={cx(
                  'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-csmju-caption font-medium',
                  category === chip.key ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface/80 text-ink',
                )}
              >
                {chip.icon}
                {chip.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-8 px-4 pt-4">{children}</div>
    </div>
  );
}

function ScopeMenu({ compact = false }: { compact?: boolean }) {
  const params = useSearchParams();
  const me = useMe();
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');
  const canPublish = me.subsystemRole === 'EDITOR' || me.subsystemRole === 'ADMIN';
  const current = params.get('starred') ? 'starred' : params.get('builtIn') ? 'builtIn' : params.get('owner') === 'me' ? 'mine' : 'all';
  const options = [
    { key: 'all', href: '/templates', label: 'เทมเพลต' },
    { key: 'builtIn', href: '/templates?builtIn=true', label: 'เทมเพลตตั้งต้นของทีม' },
    ...(canPublish ? [{ key: 'mine', href: '/templates?owner=me', label: 'ที่ฉันเผยแพร่' }] : []),
    { key: 'starred', href: '/templates?starred=true', label: 'คอนเทนต์ติดดาว' },
  ];
  const label = options.find((o) => o.key === current)?.label ?? 'เทมเพลต';

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx('inline-flex min-h-11 items-center gap-2 font-bold text-ink', compact ? 'text-csmju-body' : 'text-csmju-h1')}
      >
        {label}
        <span className="inline-flex size-7 items-center justify-center rounded-full border border-line-strong bg-surface">
          <ChevronDown aria-hidden className="size-4" />
        </span>
      </button>
      <FloatingPanel open={open} menuRef={menuRef} label="เลือกขอบเขตเทมเพลต" className="w-64 rounded-2xl border border-line bg-surface py-1 shadow-csmju-lg">
        {options.map((option) => (
          <Link
            key={option.key}
            href={option.href}
            role="menuitemradio"
            aria-checked={current === option.key}
            onClick={() => setOpen(false)}
            className="flex min-h-12 items-center gap-3 px-4 text-csmju-body text-ink hover:bg-surface-muted"
          >
            <span className="flex-1">{option.label}</span>
            {current === option.key && <Check aria-hidden className="size-5" />}
          </Link>
        ))}
      </FloatingPanel>
    </>
  );
}
