'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/components/csmju/primitives';
import { useEditor } from '@/lib/editor/store';

/// ชิ้นส่วนที่แผงด้านซ้ายใช้ร่วมกัน (panels.tsx · elements-panel.tsx · media-panel.tsx)

/// ส่วนหัวของแผงอยู่กับที่ เนื้อหาเลื่อนได้ (แบบ Canva ที่ช่องค้นหาไม่เลื่อนหายไป)
export function PanelFrame({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-4 pt-4 pb-3">{header}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
    </div>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-csmju-body font-bold text-ink">{children}</h2>;
}

export function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onBack} aria-label="ย้อนกลับ" className="-ml-2 inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface-muted">
        <ArrowLeft aria-hidden className="size-5" />
      </button>
      <h2 className="text-csmju-body font-bold text-ink">{title}</h2>
    </div>
  );
}

export function usePageSize() {
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);

  return { width, height };
}

/// ช่องค้นหาบนสุดของแผง (กรอบขาวมุมมน แบบ Canva)
export function PanelSearch({
  id,
  label,
  value,
  onChange,
  onSubmit,
  trailing,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className="relative"
    >
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink" />
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className={cx(
          'min-h-14 w-full rounded-2xl border border-line-strong bg-surface pl-12 text-csmju-body text-ink placeholder:text-muted focus:border-primary focus:outline-none',
          trailing ? 'pr-16' : 'pr-4',
        )}
      />
      {trailing && <div className="absolute top-1/2 right-2 -translate-y-1/2">{trailing}</div>}
    </form>
  );
}

export function SectionHeading({ children, onSeeAll, seeAllLabel = 'ดูทั้งหมด' }: { children: ReactNode; onSeeAll?: () => void; seeAllLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-csmju-body font-bold text-ink">{children}</h3>
      {onSeeAll && (
        <button type="button" onClick={onSeeAll} className="min-h-11 px-2 text-csmju-caption font-semibold text-ink hover:underline">
          {seeAllLabel}
        </button>
      )}
    </div>
  );
}

/// โหลดไฟล์รายการของคลังกราฟิกในระบบครั้งเดียวต่อการเปิดหน้า
export function useLibrary<T>(key: string, loader: () => Promise<T>, enabled = true) {
  return useQuery({ queryKey: ['library', key], queryFn: loader, staleTime: Infinity, gcTime: Infinity, enabled });
}
