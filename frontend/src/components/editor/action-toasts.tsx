'use client';

import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { Dialog, cx } from '@/components/csmju/primitives';
import { useActionToasts } from '@/lib/editor/action-toast';
import { formatKeys, searchShortcuts } from '@/lib/editor/shortcuts';
import { useEditorUi } from '@/lib/editor/ui-store';

/// ป๊อปอัปเล็กมุมขวาใต้แถบบน — บอกว่าคีย์ลัดเพิ่งทำอะไร (lib/editor/action-toast.ts)
export function ActionToasts() {
  const toasts = useActionToasts((s) => s.toasts);
  const dismiss = useActionToasts((s) => s.dismiss);

  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed top-20 right-4 z-50 flex w-72 max-w-full flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            'csmju-fade-in pointer-events-auto flex min-h-11 max-w-full items-center gap-2 rounded-xl px-3 py-2 text-csmju-caption shadow-csmju-lg',
            t.muted ? 'bg-surface text-muted ring-1 ring-line' : 'bg-inverse text-on-inverse',
          )}
        >
          <span className="min-w-0 flex-1 truncate">{t.label}</span>
          {t.count > 1 && <span className="shrink-0 font-semibold tabular-nums">×{t.count}</span>}
          {t.keys && (
            <kbd className={cx('shrink-0 rounded-md px-1.5 py-0.5 font-sans text-csmju-caption', t.muted ? 'bg-surface-muted' : 'bg-surface/15')}>{formatKeys(t.keys)}</kbd>
          )}
          <button type="button" onClick={() => dismiss(t.id)} aria-label="ปิดการแจ้ง" className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md opacity-70 hover:opacity-100">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/// หน้ารวมคีย์ลัด (Ctrl+/ หรือ ?) — ค้นหาได้ · เปิด/ปิดป๊อปอัปมุมขวา
export function ShortcutSheet() {
  const open = useEditorUi((s) => s.overlay === 'shortcuts');
  const [query, setQuery] = useState('');
  const enabled = useActionToasts((s) => s.enabled);
  const setEnabled = useActionToasts((s) => s.setEnabled);
  const groups = searchShortcuts(query);

  if (!open) return null;

  return (
    <Dialog open onClose={() => useEditorUi.getState().set({ overlay: null })} title="คีย์ลัด" size="lg">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
          <label htmlFor="shortcut-search" className="sr-only">
            ค้นหาคีย์ลัด
          </label>
          <input
            id="shortcut-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='ลองค้นหาว่า "วาง" หรือ "Ctrl+G"'
            className="min-h-11 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-csmju-body text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
        <label className="flex min-h-10 items-center justify-between gap-3 text-csmju-caption text-ink">
          แสดงป๊อปอัปมุมขวาเมื่อใช้คีย์ลัด
          <input type="checkbox" role="switch" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-5 accent-primary" />
        </label>
        {groups.length === 0 ? (
          <p className="text-csmju-caption text-muted">ไม่พบคีย์ลัดที่ค้นหา</p>
        ) : (
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {groups.map((group) => (
              <section key={group.title}>
                <h3 className="mb-2 text-csmju-body font-bold text-ink">{group.title}</h3>
                <dl className="flex flex-col gap-1">
                  {group.items.map((item) => (
                    <div key={item.keys + item.label} className="flex min-h-9 items-center justify-between gap-3 border-b border-line text-csmju-caption">
                      <dt className="text-ink">{item.label}</dt>
                      <dd>
                        <kbd className="rounded-md bg-surface-muted px-2 py-0.5 font-sans text-ink">{formatKeys(item.keys)}</kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
