'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, CircleHelp, LayoutTemplate, Palette, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, qs } from '@/lib/csmju/api';
import { searchHelp } from '@/lib/help-articles';
import type { DesignSummary, TemplateSummary } from '@/lib/types';
import { cx, inputClass } from '../csmju/primitives';

/// ผู้ช่วยค้นหา (ปุ่ม ?) — ค้นจากคู่มือ เทมเพลต และงานของผู้ใช้จริง แล้วตอบเป็นลิงก์
///
/// ไม่ใช้ LLM และไม่ส่งคำถามออกนอกระบบ (การตัดสินใจของ PL) · คำถามนอกบริบทงานออกแบบ
/// จะได้คำตอบตรง ๆ ว่าผู้ช่วยตอบได้เฉพาะเรื่องการใช้งาน CS Canvas
export function HelpAssistant() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);

    return () => clearTimeout(timer);
  }, [query]);

  // เปิดจากเมนูบัญชี → ความช่วยเหลือและฟีดแบ็ก → ผู้ช่วย
  useEffect(() => {
    const openHelp = () => setOpen(true);

    window.addEventListener('csmju:open-help', openHelp);

    return () => window.removeEventListener('csmju:open-help', openHelp);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const articles = searchHelp(debounced);
  const templates = useQuery({
    queryKey: ['help', 'templates', debounced],
    queryFn: () => api.list<TemplateSummary>(`/templates${qs({ q: debounced, limit: 4 })}`),
    enabled: open && debounced.length > 0,
  });
  const designs = useQuery({
    queryKey: ['help', 'designs', debounced],
    queryFn: () => api.list<DesignSummary>(`/designs${qs({ q: debounced, limit: 4 })}`),
    enabled: open && debounced.length > 0,
  });

  const loading = templates.isFetching || designs.isFetching;
  const nothing =
    debounced.length > 0 &&
    !loading &&
    articles.length === 0 &&
    (templates.data?.items.length ?? 0) === 0 &&
    (designs.data?.items.length ?? 0) === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="help-panel"
        aria-label="ผู้ช่วยค้นหา"
        title="ผู้ช่วยค้นหา"
        className="fixed right-4 bottom-20 z-30 inline-flex size-14 items-center justify-center rounded-full bg-primary text-on-inverse shadow-csmju-lg hover:bg-primary-hover md:bottom-6"
      >
        {open ? <X aria-hidden className="size-6" /> : <CircleHelp aria-hidden className="size-7" />}
      </button>

      {open && (
        <div
          id="help-panel"
          ref={panel}
          role="dialog"
          aria-label="ผู้ช่วยค้นหา"
          className="csmju-pop fixed right-4 bottom-36 z-30 flex max-h-popover w-11/12 max-w-md flex-col rounded-2xl border border-line bg-surface shadow-csmju-lg md:bottom-24"
        >
          <div className="border-b border-line p-4">
            <p className="text-csmju-body font-semibold text-ink">ผู้ช่วย CS Canvas</p>
            <p className="text-csmju-caption text-muted">ถามเรื่องการใช้งาน ค้นเทมเพลต หรือหางานของคุณ</p>
            <div className="relative mt-3">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
              <label htmlFor="help-query" className="sr-only">
                คำถามหรือคำค้น
              </label>
              <input
                id="help-query"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="เช่น ดาวน์โหลด png โปร่งใส, เกียรติบัตร"
                className={cx(inputClass, 'pl-10')}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-live="polite">
            {!debounced && (
              <div className="p-2">
                <p className="mb-2 text-csmju-caption text-muted">หัวข้อที่ถามบ่อย</p>
                <ul className="flex flex-wrap gap-2">
                  {['เริ่มสร้างงาน', 'ดาวน์โหลด png', 'เลเยอร์', 'กู้คืน', 'คีย์ลัด'].map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        onClick={() => setQuery(suggestion)}
                        className="min-h-11 rounded-full border border-line-strong px-3 text-csmju-caption text-ink hover:bg-surface-muted"
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {articles.length > 0 && (
              <ResultGroup title="คู่มือ" icon={<BookOpen aria-hidden className="size-4" />}>
                {articles.map((article) => (
                  <ResultLink key={article.slug} href={`/help/${article.slug}`} title={article.title} detail={article.summary} onNavigate={() => setOpen(false)} />
                ))}
              </ResultGroup>
            )}

            {(templates.data?.items.length ?? 0) > 0 && (
              <ResultGroup title="เทมเพลต" icon={<LayoutTemplate aria-hidden className="size-4" />}>
                {templates.data!.items.map((template) => (
                  <ResultLink key={template.id} href={`/templates?q=${encodeURIComponent(template.title)}`} title={template.title} detail={template.description || 'เปิดในหน้าเทมเพลต'} onNavigate={() => setOpen(false)} />
                ))}
              </ResultGroup>
            )}

            {(designs.data?.items.length ?? 0) > 0 && (
              <ResultGroup title="งานของคุณ" icon={<Palette aria-hidden className="size-4" />}>
                {designs.data!.items.map((design) => (
                  <ResultLink key={design.id} href={`/design/${design.id}`} title={design.title} detail="เปิดในหน้าแก้ไข" onNavigate={() => setOpen(false)} />
                ))}
              </ResultGroup>
            )}

            {loading && <p className="p-3 text-csmju-caption text-muted">กำลังค้นหา…</p>}

            {nothing && (
              <div className="p-3">
                <p className="text-csmju-caption text-ink">
                  ไม่พบคำตอบสำหรับ “{debounced}” — ผู้ช่วยตอบได้เฉพาะเรื่องการใช้งาน CS Canvas เทมเพลต และงานของคุณ
                </p>
                <Link href="/help" onClick={() => setOpen(false)} className="mt-2 inline-flex min-h-11 items-center text-csmju-caption font-medium text-primary underline">
                  ดูคู่มือทั้งหมด
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ResultGroup({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-2">
      <h3 className="flex items-center gap-2 px-2 py-1 text-csmju-caption font-semibold text-muted">
        {icon}
        {title}
      </h3>
      <ul>{children}</ul>
    </section>
  );
}

function ResultLink({ href, title, detail, onNavigate }: { href: string; title: string; detail: string; onNavigate: () => void }) {
  return (
    <li>
      <Link href={href} onClick={onNavigate} className="block rounded-xl px-3 py-2 hover:bg-surface-muted">
        <span className="block text-csmju-caption font-medium text-ink">{title}</span>
        <span className="block truncate text-csmju-caption text-muted">{detail}</span>
      </Link>
    </li>
  );
}

