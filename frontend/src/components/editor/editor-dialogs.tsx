'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, Eye, Folder as FolderIcon, MessageCircle, History, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Dialog, Spinner, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { DESIGN_GROUPS, DESIGN_TYPES } from '@/lib/design-types';
import { toInputColor } from '@/lib/editor/color';
import { download, safeFileName } from '@/lib/editor/export';
import { layerLabel } from '@/lib/editor/factory';
import { isGradient } from '@/lib/editor/paint';
import { useEditor } from '@/lib/editor/store';
import type { CanvasElement } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import type { Folder } from '@/lib/types';

/// หน้าต่างของเมนูไฟล์/แถบบน — เปิดตาม `overlay` ใน ui-store
export function EditorDialogs() {
  const overlay = useEditorUi((s) => s.overlay);
  const close = () => useEditorUi.getState().set({ overlay: null });

  return (
    <>
      {overlay === 'resize' && <ResizeDialog onClose={close} />}
      {overlay === 'analytics' && <AnalyticsDialog onClose={close} />}
      {overlay === 'move' && <MoveFolderDialog onClose={close} />}
      {overlay === 'find' && <FindReplaceDialog onClose={close} />}
      {overlay === 'accessibility' && <AccessibilityDialog onClose={close} />}
    </>
  );
}

// ── ปรับขนาด ───────────────────────────────────────────────────────

function ResizeDialog({ onClose }: { onClose: () => void }) {
  const baseWidth = useEditor((s) => s.baseWidth);
  const baseHeight = useEditor((s) => s.baseHeight);
  const [w, setW] = useState(String(baseWidth));
  const [h, setH] = useState(String(baseHeight));
  const [scaleContent, setScaleContent] = useState(true);
  const [q, setQ] = useState('');
  const toast = useToast();
  const width = Math.round(Number(w));
  const height = Math.round(Number(h));
  const valid = width >= 16 && height >= 16 && width <= 8000 && height <= 8000;
  const groups = DESIGN_GROUPS.filter((g) => g.available);
  const types = DESIGN_TYPES.filter((t) => !q.trim() || t.label.includes(q.trim()));

  return (
    <Dialog
      open
      onClose={onClose}
      title="ปรับขนาดดีไซน์"
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              useEditor.getState().resizeDesign(width, height, scaleContent);
              toast(`ปรับขนาดเป็น ${width} × ${height} px แล้ว (ย้อนกลับได้ด้วย Ctrl+Z)`);
              onClose();
            }}
          >
            ปรับขนาด
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-csmju-caption text-ink">
            กว้าง (px)
            <input type="number" value={w} onChange={(e) => setW(e.target.value)} className={cx(inputClass, 'w-32')} />
          </label>
          <label className="flex flex-col gap-1 text-csmju-caption text-ink">
            สูง (px)
            <input type="number" value={h} onChange={(e) => setH(e.target.value)} className={cx(inputClass, 'w-32')} />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-csmju-caption text-ink">
            <input type="checkbox" checked={scaleContent} onChange={(e) => setScaleContent(e.target.checked)} className="size-5 accent-primary" />
            ย่อ/ขยายชิ้นงานให้พอดีขนาดใหม่
          </label>
        </div>
        {!valid && <p className="text-csmju-caption text-danger">ขนาดต้องอยู่ระหว่าง 16–8000 พิกเซล</p>}
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
          <label htmlFor="resize-search" className="sr-only">ค้นหาขนาด</label>
          <input id="resize-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาขนาด เช่น โปสเตอร์ สตอรี่" className={cx(inputClass, 'pl-10')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => {
            const list = types.filter((t) => t.group === group.key);

            if (list.length === 0) return null;

            return (
              <section key={group.key}>
                <h3 className="mb-1 text-csmju-caption font-bold text-ink">{group.label}</h3>
                <ul>
                  {list.map((t) => (
                    <li key={t.key}>
                      <button
                        type="button"
                        aria-pressed={width === t.width && height === t.height}
                        onClick={() => {
                          setW(String(t.width));
                          setH(String(t.height));
                        }}
                        className={cx(
                          'flex min-h-10 w-full items-center justify-between rounded-lg px-2 text-left text-csmju-caption hover:bg-surface-muted',
                          width === t.width && height === t.height ? 'bg-primary-soft font-semibold text-primary' : 'text-ink',
                        )}
                      >
                        {t.label}
                        <span className="text-muted tabular-nums">
                          {t.width}×{t.height}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

// ── การวิเคราะห์ ────────────────────────────────────────────────────

interface Stats {
  uniqueViewers: number;
  totalViews: number;
  lastViewedAt: string | null;
  commentCount: number;
  versionCount: number;
}

function AnalyticsDialog({ onClose }: { onClose: () => void }) {
  const designId = useEditor((s) => s.designId);
  const linkAccess = useEditor((s) => s.linkAccess);
  const title = useEditor((s) => s.title);
  const stats = useQuery({ queryKey: ['design-stats', designId], queryFn: () => api.get<Stats>(`/designs/${designId}/stats`) });
  const cards = stats.data
    ? [
        { icon: <Users aria-hidden className="size-5" />, label: 'จำนวนผู้เข้าชมที่ไม่ซ้ำ', value: stats.data.uniqueViewers },
        { icon: <Eye aria-hidden className="size-5" />, label: 'จำนวนการเข้าชมทั้งหมด', value: stats.data.totalViews },
        { icon: <MessageCircle aria-hidden className="size-5" />, label: 'ความคิดเห็น', value: stats.data.commentCount },
        { icon: <History aria-hidden className="size-5" />, label: 'เวอร์ชันที่เก็บไว้', value: stats.data.versionCount },
      ]
    : [];

  return (
    <Dialog open onClose={onClose} title="การวิเคราะห์" size="lg">
      {stats.isLoading ? (
        <Spinner />
      ) : stats.isError ? (
        <p className="text-csmju-caption text-danger">{errorMessage(stats.error)}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-line p-4">
                <span className="text-primary">{c.icon}</span>
                <p className="mt-2 text-csmju-h2 font-bold text-ink tabular-nums">{c.value}</p>
                <p className="text-csmju-caption text-muted">{c.label}</p>
              </div>
            ))}
          </div>
          <p className="text-csmju-caption text-muted">
            {stats.data?.lastViewedAt ? `เปิดดูล่าสุด ${new Date(stats.data.lastViewedAt).toLocaleString('th-TH')}` : 'ยังไม่มีใครเปิดดูผ่านลิงก์'} · นับเฉพาะคนอื่นที่เข้าสู่ระบบแล้วเปิดงานผ่านลิงก์ ไม่นับเจ้าของ
          </p>
          {linkAccess === 'NONE' && <p className="rounded-xl bg-warning-bg px-3 py-2 text-csmju-caption text-warning">งานนี้ยังเปิดได้เฉพาะคุณ — เปลี่ยนการแชร์เป็น “ทุกคนที่มีลิงก์” ก่อน จึงจะมีผู้เข้าชม</p>}
          <div>
            <Button
              onClick={() => {
                const d = stats.data!;
                const rows = [
                  ['รายการ', 'ค่า'],
                  ['ชื่องาน', title],
                  ['จำนวนผู้เข้าชมที่ไม่ซ้ำ', String(d.uniqueViewers)],
                  ['จำนวนการเข้าชมทั้งหมด', String(d.totalViews)],
                  ['ความคิดเห็น', String(d.commentCount)],
                  ['เวอร์ชันที่เก็บไว้', String(d.versionCount)],
                  ['เปิดดูล่าสุด', d.lastViewedAt ?? ''],
                  ['ดึงข้อมูลเมื่อ', new Date().toISOString()],
                ];
                const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n');

                // BOM ให้ Excel อ่านภาษาไทยถูก
                download(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), `${safeFileName(title)}-analytics.csv`);
              }}
            >
              <Download aria-hidden className="size-4" /> ดาวน์โหลด CSV
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ── ย้ายโฟลเดอร์ ────────────────────────────────────────────────────

function MoveFolderDialog({ onClose }: { onClose: () => void }) {
  const designId = useEditor((s) => s.designId);
  const toast = useToast();
  const queryClient = useQueryClient();
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.list<Folder>('/folders?limit=100') });
  const move = async (folderId: string | null, name: string) => {
    try {
      await api.patch(`/designs/${designId}`, { folderId });
      void queryClient.invalidateQueries({ queryKey: ['designs'] });
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast(folderId ? `ย้ายไป "${name}" แล้ว` : 'เอาออกจากโฟลเดอร์แล้ว');
      onClose();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  return (
    <Dialog open onClose={onClose} title="ย้ายไปที่โฟลเดอร์">
      {folders.isLoading ? (
        <Spinner />
      ) : (
        <ul className="flex flex-col gap-1">
          <li>
            <button type="button" onClick={() => void move(null, '')} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted">
              <FolderIcon aria-hidden className="size-5 text-muted" /> โปรเจกต์ทั้งหมด (ไม่อยู่ในโฟลเดอร์)
            </button>
          </li>
          {(folders.data?.items ?? []).map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => void move(f.id, f.name)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-csmju-caption text-ink hover:bg-surface-muted">
                <FolderIcon aria-hidden className="size-5 text-primary" /> {f.name}
                <span className="ml-auto text-muted">{f.designCount} ดีไซน์</span>
              </button>
            </li>
          ))}
          {folders.data?.items.length === 0 && <li className="px-3 py-2 text-csmju-caption text-muted">ยังไม่มีโฟลเดอร์ — สร้างได้ที่หน้าโปรเจกต์</li>}
        </ul>
      )}
    </Dialog>
  );
}

// ── ค้นหาและแทนที่ ──────────────────────────────────────────────────

function FindReplaceDialog({ onClose }: { onClose: () => void }) {
  const pages = useEditor((s) => s.doc.pages);
  const [find, setFind] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const toast = useToast();
  const matches = useMemo(() => {
    if (!find) return [];

    const needle = matchCase ? find : find.toLowerCase();
    const out: { pageIndex: number; el: CanvasElement; count: number }[] = [];

    pages.forEach((page, pageIndex) => {
      for (const el of page.elements) {
        if (el.type !== 'text') continue;

        const hay = matchCase ? el.text : el.text.toLowerCase();
        const count = hay.split(needle).length - 1;

        if (count > 0) out.push({ pageIndex, el, count });
      }
    });

    return out;
  }, [pages, find, matchCase]);
  const total = matches.reduce((n, m) => n + m.count, 0);

  return (
    <Dialog
      open
      onClose={onClose}
      title="ค้นหาและแทนที่ข้อความ"
      footer={
        <>
          <Button onClick={onClose}>ปิด</Button>
          <Button
            variant="primary"
            disabled={total === 0}
            onClick={() => {
              const n = useEditor.getState().replaceText(find, replacement, matchCase);

              toast(n > 0 ? `แทนที่ ${n} จุดแล้ว (ย้อนกลับได้ด้วย Ctrl+Z)` : 'ข้อความที่พบถูกล็อกไว้ทั้งหมด');
            }}
          >
            แทนที่ทั้งหมด
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-csmju-caption font-medium text-ink">
          ค้นหา
          <input value={find} onChange={(e) => setFind(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-csmju-caption font-medium text-ink">
          แทนที่ด้วย
          <input value={replacement} onChange={(e) => setReplacement(e.target.value)} className={inputClass} />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-csmju-caption text-ink">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} className="size-5 accent-primary" />
          ตรงตามตัวพิมพ์ใหญ่-เล็ก
        </label>
        {find && <p className="text-csmju-caption text-muted">{total > 0 ? `พบ ${total} จุดใน ${matches.length} กล่องข้อความ` : 'ไม่พบข้อความนี้'}</p>}
        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
          {matches.map((m) => (
            <li key={m.el.id}>
              <button
                type="button"
                onClick={() => {
                  const state = useEditor.getState();

                  state.setPageIndex(m.pageIndex);
                  state.select([m.el.id]);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-csmju-caption text-ink hover:bg-surface-muted"
              >
                <span className="shrink-0 rounded bg-surface-muted px-1.5 text-muted">หน้า {m.pageIndex + 1}</span>
                <span className="truncate">{layerLabel(m.el)}</span>
                <span className="ml-auto text-muted">{m.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

// ── ตรวจสอบการเข้าถึง ───────────────────────────────────────────────

function luminance(color: string): number | null {
  const hex = toInputColor(color).replace('#', '');

  if (hex.length !== 6) return null;

  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;

    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);

  if (la === null || lb === null) return null;

  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

interface Issue {
  pageIndex: number;
  elementId: string;
  label: string;
  problem: string;
}

/// ตรวจตามเกณฑ์ WCAG 2.1: ความต่างสีข้อความ (4.5:1 · ตัวใหญ่ 3:1) · ขนาดตัวอักษร · ข้อความทดแทนของรูป
function AccessibilityDialog({ onClose }: { onClose: () => void }) {
  const pages = useEditor((s) => s.doc.pages);
  const baseWidth = useEditor((s) => s.baseWidth);
  const baseHeight = useEditor((s) => s.baseHeight);
  const issues = useMemo(() => {
    const out: Issue[] = [];
    const long = Math.max(baseWidth, baseHeight);

    pages.forEach((page, pageIndex) => {
      const bg = page.background && !isGradient(page.background) ? page.background : 'rgb(255 255 255)';

      for (const el of page.elements) {
        if (el.hidden) continue;

        if (el.type === 'text') {
          // ขนาดเทียบจอ 1920 px — ต่ำกว่า 18 px อ่านยากเมื่อแสดงเต็มจอ
          const onScreen = (el.fontSize / long) * 1920;
          const large = onScreen >= 32 || (onScreen >= 24 && el.fontWeight === 700);
          const ratio = contrast(el.color, bg);

          if (ratio !== null && ratio < (large ? 3 : 4.5)) {
            out.push({ pageIndex, elementId: el.id, label: layerLabel(el), problem: `สีตัวอักษรกับพื้นหลังต่างกันน้อย (${ratio.toFixed(1)}:1 ควรอย่างน้อย ${large ? '3' : '4.5'}:1)` });
          }

          if (onScreen < 18) out.push({ pageIndex, elementId: el.id, label: layerLabel(el), problem: 'ตัวอักษรเล็กเกินไปเมื่อแสดงเต็มจอ' });
        }

        if (el.type === 'image' && (!el.name || /\.(png|jpe?g|webp|gif|svg)$/i.test(el.name))) {
          out.push({ pageIndex, elementId: el.id, label: el.name || 'รูปภาพ', problem: 'รูปยังไม่มีข้อความช่วยอธิบาย (คลิกขวา → ข้อความช่วยอธิบาย)' });
        }
      }
    });

    return out;
  }, [pages, baseWidth, baseHeight]);

  return (
    <Dialog open onClose={onClose} title="ตรวจสอบการเข้าถึงดีไซน์">
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 text-csmju-body text-success">
          <CheckCircle2 aria-hidden className="size-5" /> ไม่พบปัญหาการเข้าถึง
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {issues.map((issue, i) => (
            <li key={`${issue.elementId}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  const state = useEditor.getState();

                  state.setPageIndex(issue.pageIndex);
                  state.select([issue.elementId]);
                  onClose();
                }}
                className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left hover:bg-surface-muted"
              >
                <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
                <span>
                  <span className="block text-csmju-caption font-semibold text-ink">
                    หน้า {issue.pageIndex + 1} · {issue.label}
                  </span>
                  <span className="block text-csmju-caption text-muted">{issue.problem}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
