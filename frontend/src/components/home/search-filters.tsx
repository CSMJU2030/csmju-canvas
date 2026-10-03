'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DESIGN_TYPES, TEMPLATE_CATEGORIES } from '@/lib/design-types';
import { cx } from '../csmju/primitives';

export interface SearchFilters {
  designType: string;
  category: string;
  owner: 'all' | 'me' | 'others';
  editedWithin: '' | 'day' | 'week' | 'month' | 'year';
}

export const EMPTY_FILTERS: SearchFilters = { designType: '', category: '', owner: 'all', editedWithin: '' };

const OWNER_OPTIONS = [
  { value: 'all', label: 'ทุกคน' },
  { value: 'me', label: 'ตัวเรา (งานของฉัน)' },
  { value: 'others', label: 'คนอื่น (เทมเพลตที่เผยแพร่)' },
] as const;

export const EDITED_OPTIONS = [
  { value: '', label: 'ทุกช่วงเวลา' },
  { value: 'day', label: 'วันนี้' },
  { value: 'week', label: '7 วันที่ผ่านมา' },
  { value: 'month', label: '30 วันที่ผ่านมา' },
  { value: 'year', label: 'ปีที่ผ่านมา' },
] as const;

/// ปุ่มตัวกรอง 4 ตัวใต้ช่องค้นหา (ประเภท · หมวดหมู่ · เจ้าของ · วันที่แก้) ตามภาพบรีฟ
export function FilterBar({ value, onChange }: { value: SearchFilters; onChange: (next: SearchFilters) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <FilterPopover
        label="ประเภท"
        current={value.designType}
        options={[{ value: '', label: 'ทุกประเภท' }, ...DESIGN_TYPES.map((t) => ({ value: t.key, label: t.label }))]}
        onPick={(designType) => onChange({ ...value, designType })}
      />
      <FilterPopover
        label="หมวดหมู่"
        current={value.category}
        options={[{ value: '', label: 'ทุกหมวด' }, ...TEMPLATE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))]}
        onPick={(category) => onChange({ ...value, category })}
      />
      <FilterPopover
        label="เจ้าของ"
        current={value.owner === 'all' ? '' : value.owner}
        options={OWNER_OPTIONS.map((o) => ({ value: o.value === 'all' ? '' : o.value, label: o.label }))}
        onPick={(owner) => onChange({ ...value, owner: (owner || 'all') as SearchFilters['owner'] })}
      />
      <FilterPopover
        label="วันที่แก้"
        current={value.editedWithin}
        options={EDITED_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        onPick={(editedWithin) => onChange({ ...value, editedWithin: editedWithin as SearchFilters['editedWithin'] })}
      />
    </div>
  );
}

export function FilterPopover({
  label,
  current,
  options,
  onPick,
}: {
  label: string;
  current: string;
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === current && current !== '');

  useEffect(() => {
    if (!open) return;

    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-csmju-caption',
          selected ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink hover:bg-surface-muted',
        )}
      >
        {selected ? `${label}: ${selected.label}` : label}
        <ChevronDown aria-hidden className="size-4" />
      </button>
      {open && (
        <ul role="listbox" aria-label={label} className="absolute left-0 z-40 mt-1 max-h-80 min-w-60 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-csmju-lg">
          {options.map((option) => (
            <li key={option.value || 'all'} role="option" aria-selected={option.value === current}>
              <button
                type="button"
                onClick={() => {
                  onPick(option.value);
                  setOpen(false);
                }}
                className={cx(
                  'flex min-h-11 w-full items-center px-4 text-left text-csmju-caption hover:bg-surface-muted',
                  option.value === current ? 'font-semibold text-primary' : 'text-ink',
                )}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
