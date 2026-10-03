'use client';

import { Button, inputClass } from './primitives';

export function SelectBox({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {options.map(([v, text]) => (
          <option key={v || 'all'} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="เลือกหน้า" className="mt-6 flex items-center justify-center gap-3">
      <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>ก่อนหน้า</Button>
      <span className="text-csmju-caption text-muted tabular-nums">หน้า {page} / {totalPages}</span>
      <Button disabled={page >= totalPages} onClick={() => onPage(page + 1)}>ถัดไป</Button>
    </nav>
  );
}
