'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { cx } from '@/components/csmju/primitives';
import { FONT_FAMILIES, assetFontId, cssFamily, ensureFont, fontLabel, isPopularFont, popularFirst, userFontName, useUserFonts, type FontFamily, type FontStyle } from '@/lib/editor/fonts';
import { useMyFonts } from './use-my-fonts';

/// หมวดของฟอนต์ (ชิปใต้ช่องค้นหา แบบภาพบรีฟ "อันนี้ฟอนต์")
type Category = FontStyle | 'all' | 'popular';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'popular', label: 'ยอดนิยม' },
  { key: 'handwriting', label: 'ลายมือ' },
  { key: 'display', label: 'ดิสเพลย์' },
  { key: 'sans', label: 'ไม่มีหัว' },
  { key: 'serif', label: 'มีเชิง' },
  { key: 'mono', label: 'โมโนสเปซ' },
];

/// โหลดฟอนต์ทุกตัวไว้ให้ตัวอย่างในรายการแสดงด้วยฟอนต์จริง (ไฟล์อยู่ใน repo ไม่ออกเน็ตภายนอก)
export function usePreloadFonts(ids: string[]) {
  const key = ids.join('|');

  useEffect(() => {
    for (const id of key.split('|')) if (id) void ensureFont(id, 400);
  }, [key]);
}

/// โหลดไฟล์ฟอนต์เมื่อแถวนั้นเลื่อนมาให้เห็น (มีฟอนต์หลายสิบตัว ไม่โหลดทั้งหมดพร้อมกัน)
export function FontName({ id, label, className }: { id: string; label: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        void ensureFont(id, 400);
        observer.disconnect();
      }
    });

    observer.observe(el);

    return () => observer.disconnect();
  }, [id]);

  return (
    <span ref={ref} className={className} style={{ fontFamily: cssFamily(id) }}>
      {label}
    </span>
  );
}

/// ค้นฟอนต์ในคลัง · ยอดนิยมขึ้นก่อน
export function matchFonts(query: string, category: Category = 'all'): FontFamily[] {
  const term = query.trim().toLowerCase();

  return popularFirst(
    FONT_FAMILIES.filter(
      (font) =>
        (category === 'all' || (category === 'popular' ? isPopularFont(font.id) : font.style === category)) &&
        (!term || font.label.toLowerCase().includes(term) || font.id.toLowerCase().includes(term)),
    ),
  );
}

/// ปุ่มเลือกฟอนต์แบบ dropdown — รายการแสดง "ชื่อฟอนต์ ตัวอย่าง" ด้วยฟอนต์นั้น
export function FontPicker({ value, onChange, label = 'ฟอนต์' }: { value: string; onChange: (id: string) => void; label?: string }) {
  const { open, setOpen, anchorRef, menuRef } = useAnchoredMenu('start');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const searchId = useId();
  const names = useUserFonts((s) => s.names);
  const currentLabel = fontLabel(value, names);

  usePreloadFonts([value]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${currentLabel}`}
        title="เลือกฟอนต์"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-line-strong bg-surface-muted px-4 text-csmju-body text-ink hover:bg-surface"
        style={{ fontFamily: cssFamily(value) }}
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown aria-hidden className="size-5 shrink-0" />
      </button>
      <FloatingPanel open={open} menuRef={menuRef} role="dialog" label="เลือกฟอนต์" className="w-96 max-w-full rounded-2xl border border-line bg-surface p-4 shadow-csmju-lg">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink" />
          <label htmlFor={searchId} className="sr-only">ค้นหาฟอนต์</label>
          <input
            id={searchId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='ลองค้นหาว่า "ลายมือ" หรือ "Sarabun"'
            className="min-h-11 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-csmju-body text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
        <div className="csmju-scroll-x mt-3 flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={category === c.key}
              onClick={() => setCategory(c.key)}
              className={cx(
                'min-h-10 shrink-0 rounded-xl border px-3 text-csmju-caption font-semibold',
                category === c.key ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong text-ink hover:bg-surface-muted',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        {open && (
          <FontOptions
            query={query}
            category={category}
            value={value}
            onPick={(id) => {
              onChange(id);
              setOpen(false);
            }}
          />
        )}
      </FloatingPanel>
    </>
  );
}

/// รายการฟอนต์ในตัวเลือก (โหลด "ฟอนต์ของฉัน" เมื่อเปิดรายการเท่านั้น)
function FontOptions({ query, category, value, onPick }: { query: string; category: Category; value: string; onPick: (id: string) => void }) {
  const myFonts = useMyFonts();
  const term = query.trim().toLowerCase();
  // ฟอนต์ของฉันขึ้นก่อน (หมวด "ทั้งหมด" เท่านั้น)
  const mine =
    category === 'all'
      ? (myFonts.data?.items ?? []).map((a) => ({ id: assetFontId(a.id), label: userFontName(a.fileName), mine: true })).filter((f) => !term || f.label.toLowerCase().includes(term))
      : [];
  const fonts: Array<{ id: string; label: string; mine?: boolean }> = [...mine, ...matchFonts(query, category)];

  return (
    <ul role="listbox" aria-label="ฟอนต์" className="mt-2 max-h-popover overflow-y-auto">
      {fonts.length === 0 ? (
        <li className="px-2 py-4 text-csmju-caption text-muted">ไม่พบฟอนต์ที่ค้นหา</li>
      ) : (
        fonts.map((font) => (
          <li key={font.id} role="option" aria-selected={font.id === value}>
            <button
              type="button"
              onClick={() => onPick(font.id)}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-surface-muted"
            >
              <FontName id={font.id} label={font.label} className="flex-1 truncate text-csmju-body text-ink" />
              {font.mine && <span className="text-csmju-caption text-muted">ของฉัน</span>}
              {font.id === value && <Check aria-hidden className="size-5 text-ink" />}
            </button>
          </li>
        ))
      )}
    </ul>
  );
}
