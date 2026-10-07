'use client';

import { ArrowLeft, Check, ChevronRight, CopyPlus, ExternalLink, FileText, Loader2, Ruler, Scaling, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { CAMPAIGN_TYPES, DESIGN_GROUPS, DESIGN_TYPES, type DesignGroupKey, type DesignType } from '@/lib/design-types';
import { fitTemplate } from '@/lib/editor/fit-template';
import { useEditor } from '@/lib/editor/store';
import { A4, designToDocument } from '@/lib/editor/to-document';
import type { DesignDocument } from '@/lib/editor/types';

/// เมนู "ปรับขนาด" แบบ Canva (บรีฟ i want/this1ireallywant*.png)
///
///   หน้าแรก    ปรับขนาด › · แปลงเป็นเอกสาร ›
///   ปรับขนาด   ค้นหา · แนะนำ (แคมเปญ 4 ขนาด · สตอรี่ · โพสต์ IG) · หมวดหมู่ › · ติ๊กได้หลายขนาด · เพิ่มเติม (กริด)
///   ปุ่มล่าง   "ปรับขนาดงานนี้" (เลือกขนาดเดียว) · "คัดลอกและปรับขนาด" (สร้างงานใหม่ทุกขนาดที่ติ๊ก งานเดิมไม่เปลี่ยน)
///
/// "แปลภาษา" ของ Canva ไม่มีในระบบนี้ — ต้องส่งข้อความไปบริการแปลภายนอก ซึ่งมาตรฐานห้าม (ข้อมูลผู้ใช้ออกนอกระบบ)

type View = { kind: 'root' } | { kind: 'resize' } | { kind: 'group'; group: DesignGroupKey } | { kind: 'more' } | { kind: 'custom' };

interface Created {
  id: string;
  label: string;
}

const RECOMMENDED: { key: string; label: string; sub: string; keys: readonly string[] }[] = [
  { key: 'campaign', label: 'แคมเปญ', sub: 'พรีเซนเทชั่น โพสต์ สตอรี่ ใบปลิว', keys: CAMPAIGN_TYPES },
  { key: 'story', label: 'สตอรี่ Instagram', sub: '1080 × 1920 px', keys: ['story'] },
  { key: 'instagram-post', label: 'โพสต์ Instagram (4:5)', sub: '1080 × 1350 px', keys: ['instagram-post'] },
];

/// ภาพย่อสัดส่วนของขนาด (กรอบในช่องสี่เหลี่ยม) — เห็นทรงก่อนเลือก
function AspectPreview({ width, height, many = false }: { width: number; height: number; many?: boolean }) {
  const ratio = width / height;
  const w = ratio >= 1 ? 64 : 64 * ratio;
  const h = ratio >= 1 ? 64 / ratio : 64;

  return (
    <span className="relative flex aspect-square w-full items-center justify-center rounded-xl bg-surface-muted">
      {many && <span aria-hidden className="absolute rounded-md bg-primary-soft-hover" style={{ width: w * 0.9, height: h * 0.9, transform: 'translate(10px,-8px) rotate(8deg)' }} />}
      <span aria-hidden className="relative rounded-md border-2 border-primary bg-primary-soft shadow-csmju-sm" style={{ width: w, height: h }} />
      {many && <span className="absolute top-2 left-2 rounded-md bg-inverse/80 px-1.5 text-csmju-caption text-on-inverse">4 ขนาด</span>}
    </span>
  );
}

function scaledDocument(doc: DesignDocument, from: { width: number; height: number }, to: { width: number; height: number }): DesignDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => (page.width || page.height ? page : { ...fitTemplate({ version: doc.version, pages: [page] }, from, to).pages[0], id: page.id })),
  };
}

export function MagicSwitch({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [view, setView] = useState<View>({ kind: 'root' });
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<{ w: string; h: string }>(() => {
    const s = useEditor.getState();

    return { w: String(s.baseWidth), h: String(s.baseHeight) };
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [created, setCreated] = useState<Created[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const customSize = { width: Math.round(Number(custom.w)), height: Math.round(Number(custom.h)) };
  const customValid = customSize.width >= 16 && customSize.height >= 16 && customSize.width <= 8000 && customSize.height <= 8000;

  /// ขนาดที่ติ๊กไว้ทั้งหมด (รวม "กำหนดขนาดเอง")
  const targets = useMemo(() => {
    const list: { key: string; label: string; width: number; height: number }[] = DESIGN_TYPES.filter((t) => picked.has(t.key)).map((t) => ({ key: t.key, label: t.label, width: t.width, height: t.height }));

    if (picked.has('custom') && customValid) list.push({ key: 'custom', label: `กำหนดเอง ${customSize.width}×${customSize.height}`, width: customSize.width, height: customSize.height });

    return list;
  }, [picked, customValid, customSize.width, customSize.height]);

  const toggle = (keys: readonly string[]) =>
    setPicked((current) => {
      const next = new Set(current);
      const all = keys.every((k) => next.has(k));

      for (const k of keys) {
        if (all) next.delete(k);
        else next.add(k);
      }

      return next;
    });

  const query = q.trim();
  const matches = query ? DESIGN_TYPES.filter((t) => t.label.toLowerCase().includes(query.toLowerCase()) || `${t.width}×${t.height}`.includes(query)) : [];

  const resizeThis = () => {
    const [target] = targets;

    if (!target) return;
    useEditor.getState().resizeDesign(target.width, target.height, true);
    toast(`ปรับขนาดเป็น ${target.width} × ${target.height} px แล้ว (ย้อนกลับได้ด้วย Ctrl+Z)`);
    onClose();
  };

  const copyAndResize = async () => {
    const s = useEditor.getState();
    const from = { width: s.baseWidth, height: s.baseHeight };
    const made: Created[] = [];

    setBusy('กำลังสร้างงานใหม่…');

    try {
      for (const target of targets) {
        setBusy(`กำลังสร้าง ${made.length + 1}/${targets.length}…`);

        const design = await api.post<{ id: string }>('/designs', {
          title: `${s.title || 'ดีไซน์'} · ${target.label}`,
          designType: target.key === 'custom' ? s.designType || 'poster' : target.key,
          width: target.width,
          height: target.height,
          document: scaledDocument(s.doc, from, target),
        });

        made.push({ id: design.id, label: target.label });
      }

      setCreated(made);
      toast(`สร้างงานใหม่ ${made.length} ขนาดแล้ว — งานเดิมไม่เปลี่ยน`);
    } catch (error) {
      setCreated(made);
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const toDocument = async () => {
    const s = useEditor.getState();

    setBusy('กำลังแปลงเป็นเอกสาร…');

    try {
      const document = designToDocument(s.doc, { width: s.baseWidth, height: s.baseHeight });
      const design = await api.post<{ id: string }>('/designs', {
        title: `${s.title || 'ดีไซน์'} (เอกสาร)`,
        designType: 'document-a4',
        width: A4.width,
        height: A4.height,
        document,
      });

      setCreated([{ id: design.id, label: `เอกสาร A4 · ${document.pages.length} หน้า` }]);
      toast('แปลงเป็นเอกสารแล้ว — เปิดได้จากรายการด้านล่าง');
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ type }: { type: DesignType }) => (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-surface-muted">
      <input type="checkbox" checked={picked.has(type.key)} onChange={() => toggle([type.key])} className="size-5 accent-primary" />
      <span className="flex-1 text-csmju-caption text-ink">{type.label}</span>
      <span className="text-csmju-caption text-muted tabular-nums">
        {type.width}×{type.height}
      </span>
    </label>
  );

  const header = (title: string, back: View) => (
    <div className="mb-2 flex items-center gap-2">
      <button type="button" aria-label="ย้อนกลับ" onClick={() => setView(back)} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-muted">
        <ArrowLeft aria-hidden className="size-5" />
      </button>
      <h3 className="text-csmju-body font-semibold text-ink">{title}</h3>
    </div>
  );

  return (
    <>
      <button type="button" aria-label="ปิดเมนูปรับขนาด" tabIndex={-1} onClick={onClose} className="fixed inset-0 z-40 cursor-default" />
      <div
        role="dialog"
        aria-label="ปรับขนาดและแปลงงาน"
        className="csmju-on-surface csmju-pop fixed top-16 left-2 z-50 flex max-h-[min(44rem,calc(100dvh-5rem))] w-[min(30rem,calc(100vw-1rem))] flex-col rounded-2xl border border-line bg-surface shadow-csmju-lg md:left-24"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {view.kind === 'root' && (
            <ul className="flex flex-col">
              {[
                { icon: <Scaling aria-hidden className="size-6" />, title: 'ปรับขนาด', sub: 'ปรับขนาดดีไซน์ให้เป็นทุกรูปแบบที่คุณต้องการ', go: () => setView({ kind: 'resize' }) },
                { icon: <FileText aria-hidden className="size-6" />, title: 'แปลงเป็น เอกสาร', sub: 'แปลงคอนเทนต์ในดีไซน์ของคุณให้เป็น เอกสาร A4', go: () => void toDocument() },
              ].map((item) => (
                <li key={item.title}>
                  <button type="button" disabled={busy !== null} onClick={item.go} className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left hover:bg-surface-muted disabled:opacity-50">
                    <span className="text-ink">{item.icon}</span>
                    <span className="flex-1">
                      <span className="block text-csmju-body font-semibold text-ink">{item.title}</span>
                      <span className="block text-csmju-caption text-muted">{item.sub}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {view.kind !== 'root' && (
            <div className="relative mb-4">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
              <label htmlFor="magic-switch-search" className="sr-only">ค้นหาตัวเลือกปรับขนาด</label>
              <input
                id="magic-switch-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาตัวเลือกปรับขนาด"
                className="h-11 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-csmju-body text-ink focus:border-primary focus:outline-none"
              />
            </div>
          )}

          {view.kind !== 'root' && query && (
            <div>
              <p className="mb-1 text-csmju-caption font-semibold text-muted">ผลการค้นหา</p>
              {matches.length === 0 ? <p className="px-2 py-3 text-csmju-caption text-muted">ไม่พบขนาดที่ค้นหา</p> : matches.map((t) => <Row key={t.key} type={t} />)}
            </div>
          )}

          {view.kind === 'resize' && !query && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-csmju-caption font-semibold text-muted">แนะนำ</p>
                <button type="button" onClick={() => setView({ kind: 'more' })} className="text-csmju-caption font-semibold text-ink hover:underline">
                  ดูทั้งหมด
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {RECOMMENDED.map((r) => {
                  const first = DESIGN_TYPES.find((t) => t.key === r.keys[0])!;
                  const on = r.keys.every((k) => picked.has(k));

                  return (
                    <button key={r.key} type="button" aria-pressed={on} onClick={() => toggle(r.keys)} className="flex flex-col gap-1 text-left">
                      <span className={cx('relative rounded-xl ring-2', on ? 'ring-primary' : 'ring-transparent')}>
                        <AspectPreview width={first.width} height={first.height} many={r.keys.length > 1} />
                        {on && (
                          <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-on-inverse">
                            <Check aria-hidden className="size-4" />
                          </span>
                        )}
                      </span>
                      <span className="truncate text-csmju-caption font-semibold text-ink">{r.label}</span>
                      <span className="truncate text-csmju-caption text-muted">{r.sub}</span>
                    </button>
                  );
                })}
              </div>

              <p className="mt-5 mb-1 text-csmju-caption font-semibold text-muted">ค้นหาตามหมวดหมู่</p>
              <ul>
                <li>
                  <button type="button" onClick={() => setView({ kind: 'custom' })} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-muted">
                    <Ruler aria-hidden className="size-5 text-ink" />
                    <span className="flex-1 text-csmju-caption text-ink">กำหนดขนาดเอง{picked.has('custom') && customValid ? ` · ${customSize.width}×${customSize.height}` : ''}</span>
                    <ChevronRight aria-hidden className="size-5 text-muted" />
                  </button>
                </li>
                {DESIGN_GROUPS.filter((g) => g.available).map((g) => {
                  const list = DESIGN_TYPES.filter((t) => t.group === g.key);
                  const count = list.filter((t) => picked.has(t.key)).length;

                  return (
                    <li key={g.key}>
                      <button type="button" onClick={() => setView({ kind: 'group', group: g.key })} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-muted">
                        <span className={cx('flex size-6 items-center justify-center rounded-md text-on-inverse', g.tone)}>
                          <g.icon aria-hidden className="size-4" />
                        </span>
                        <span className="flex-1 text-csmju-caption text-ink">
                          {g.label}
                          {count > 0 && <span className="ml-2 rounded-full bg-primary-soft px-2 text-primary">{count}</span>}
                        </span>
                        <ChevronRight aria-hidden className="size-5 text-muted" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {view.kind === 'group' && !query && (
            <>
              {header(DESIGN_GROUPS.find((g) => g.key === view.group)?.label ?? '', { kind: 'resize' })}
              {DESIGN_TYPES.filter((t) => t.group === view.group).map((t) => (
                <Row key={t.key} type={t} />
              ))}
            </>
          )}

          {view.kind === 'custom' && !query && (
            <>
              {header('กำหนดขนาดเอง', { kind: 'resize' })}
              <div className="flex flex-wrap items-end gap-3 px-1">
                <label className="flex flex-col gap-1 text-csmju-caption text-ink">
                  กว้าง (px)
                  <input type="number" value={custom.w} onChange={(e) => setCustom((c) => ({ ...c, w: e.target.value }))} className="h-11 w-28 rounded-xl border border-line-strong bg-surface px-3 text-ink" />
                </label>
                <label className="flex flex-col gap-1 text-csmju-caption text-ink">
                  สูง (px)
                  <input type="number" value={custom.h} onChange={(e) => setCustom((c) => ({ ...c, h: e.target.value }))} className="h-11 w-28 rounded-xl border border-line-strong bg-surface px-3 text-ink" />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-csmju-caption text-ink">
                  <input type="checkbox" checked={picked.has('custom')} onChange={() => toggle(['custom'])} className="size-5 accent-primary" />
                  ใช้ขนาดนี้
                </label>
              </div>
              {!customValid && <p className="mt-2 px-1 text-csmju-caption text-danger">ขนาดต้องอยู่ระหว่าง 16–8000 พิกเซล</p>}
            </>
          )}

          {view.kind === 'more' && !query && (
            <>
              {header('เพิ่มเติม', { kind: 'resize' })}
              <div className="grid grid-cols-3 gap-3">
                {DESIGN_TYPES.map((t) => {
                  const on = picked.has(t.key);

                  return (
                    <button key={t.key} type="button" aria-pressed={on} onClick={() => toggle([t.key])} className="flex flex-col gap-1 text-left">
                      <span className={cx('relative rounded-xl ring-2', on ? 'ring-primary' : 'ring-transparent')}>
                        <AspectPreview width={t.width} height={t.height} />
                        {on && (
                          <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-on-inverse">
                            <Check aria-hidden className="size-4" />
                          </span>
                        )}
                      </span>
                      <span className="line-clamp-2 text-csmju-caption font-semibold text-ink">{t.label}</span>
                      <span className="text-csmju-caption text-muted tabular-nums">
                        {t.width} × {t.height} px
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {created.length > 0 && (
            <div className="mt-4 rounded-xl bg-success-bg p-3">
              <p className="mb-1 text-csmju-caption font-semibold text-success">สร้างงานใหม่แล้ว</p>
              <ul>
                {created.map((c) => (
                  <li key={c.id}>
                    <a href={`/design/${c.id}`} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1 text-csmju-caption font-semibold text-primary hover:underline">
                      {c.label} <ExternalLink aria-hidden className="size-4" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-line p-3">
          {busy ? (
            <span role="status" className="flex flex-1 items-center justify-center gap-2 text-csmju-caption text-muted">
              <Loader2 aria-hidden className="size-4 animate-spin" /> {busy}
            </span>
          ) : view.kind === 'root' ? (
            <button type="button" onClick={onClose} className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-csmju-caption font-semibold text-ink hover:bg-surface-muted">
              <X aria-hidden className="size-4" /> ปิด
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={targets.length !== 1}
                title={targets.length !== 1 ? 'เลือกขนาดเดียวเพื่อปรับงานนี้' : undefined}
                onClick={resizeThis}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line-strong text-csmju-caption font-semibold text-ink hover:bg-surface-muted disabled:opacity-40"
              >
                ปรับขนาดงานนี้
              </button>
              <button
                type="button"
                disabled={targets.length === 0}
                onClick={() => void copyAndResize()}
                className="csmju-gradient-button inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-csmju-caption font-semibold disabled:opacity-40"
              >
                <CopyPlus aria-hidden className="size-4" /> คัดลอกและปรับขนาด{targets.length > 0 ? ` (${targets.length})` : ''}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
