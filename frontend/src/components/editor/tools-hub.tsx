'use client';

import { Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Dialog, cx } from '@/components/csmju/primitives';
import { notifyAction } from '@/lib/editor/action-toast';
import { formatKeys } from '@/lib/editor/shortcuts';
import { useEditorUi, type VisionSim } from '@/lib/editor/ui-store';
import { TOOLS, TOOL_GROUPS, blockedReason, searchTools, toolContext, type ToolDef } from './tools-registry';

/// ศูนย์รวมเครื่องมือ (กด / หรือเมนูไฟล์ → เครื่องมือทั้งหมด) — ค้นหา เลือกด้วยลูกศร กด Enter เพื่อใช้

const RECENT_KEY = 'csc-recent-tools';
const MAX_RECENT = 8;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');

    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function remember(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((v) => v !== id)].slice(0, MAX_RECENT)));
  } catch {
    // ใช้ได้โดยไม่จำรายการล่าสุด
  }
}

export function ToolsHub() {
  const open = useEditorUi((s) => s.overlay === 'tools-hub');

  if (!open) return null;

  return <ToolsHubDialog />;
}

function ToolsHubDialog() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent] = useState(readRecent);
  // สถานะของงาน ณ ตอนเปิด (เลือกอะไรอยู่) — เครื่องมือที่ทำตอนนี้ไม่ได้แสดงเหตุผล
  const [ctx] = useState(toolContext);
  const list = useRef<HTMLDivElement>(null);
  const sections = useMemo(() => {
    const found = searchTools(query);

    if (query.trim()) return [{ title: `ผลการค้นหา (${found.length})`, tools: found }];

    const recentTools = recent.map((id) => TOOLS.find((t) => t.id === id)).filter((t): t is ToolDef => Boolean(t));

    return [
      ...(recentTools.length ? [{ title: 'ใช้ล่าสุด', tools: recentTools }] : []),
      ...TOOL_GROUPS.map((g) => ({ title: g, tools: found.filter((t) => t.group === g) })),
    ];
  }, [query, recent]);
  const flat = sections.flatMap((s) => s.tools);
  const close = () => useEditorUi.getState().set({ overlay: null });

  const run = (tool: ToolDef) => {
    const reason = blockedReason(tool, ctx);

    if (reason) {
      notifyAction(`${tool.label}: ${reason}`, tool.keys ?? null, true);
      return;
    }

    remember(tool.id);
    close();
    // ปิดหน้าต่างก่อน แผงหรือหน้าต่างที่เครื่องมือเปิดจะได้ไม่ถูกบัง
    setTimeout(() => {
      Promise.resolve(tool.run(toolContext())).catch(() => notifyAction(`${tool.label} ไม่สำเร็จ`, null, true));
    }, 0);
  };

  const move = (delta: number) => {
    const next = (active + delta + flat.length) % Math.max(1, flat.length);

    setActive(next);
    list.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  // ลำดับของรายการแรกในแต่ละหมวด (ใช้กับการเลือกด้วยลูกศร)
  const offsets = sections.map((_, si) => sections.slice(0, si).reduce((n, s) => n + s.tools.length, 0));

  return (
    <Dialog open onClose={close} title={`เครื่องมือทั้งหมด (${TOOLS.length})`} size="lg">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
          <label htmlFor="tools-search" className="sr-only">ค้นหาเครื่องมือ</label>
          <input
            id="tools-search"
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="tools-list"
            aria-activedescendant={flat[active] ? `tool-${flat[active].id}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                move(1);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                move(-1);
              } else if (event.key === 'Enter' && flat[active]) {
                event.preventDefault();
                run(flat[active]);
              }
            }}
            placeholder='พิมพ์ชื่อเครื่องมือ เช่น "QR" "จัดกึ่งกลาง" "ตาบอดสี"'
            className="min-h-11 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-csmju-body text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
        <div ref={list} id="tools-list" role="listbox" aria-label="เครื่องมือ" className="max-h-120 overflow-y-auto pr-1">
          {flat.length === 0 && <p className="py-6 text-center text-csmju-caption text-muted">ไม่พบเครื่องมือที่ค้นหา</p>}
          {sections.map((section, si) =>
            section.tools.length === 0 ? null : (
              <section key={section.title} className="mb-3">
                <h3 className="sticky top-0 z-10 bg-surface py-1 text-csmju-caption font-bold text-muted">{section.title}</h3>
                {section.tools.map((tool, ti) => {
                  const i = offsets[si] + ti;
                  const reason = blockedReason(tool, ctx);
                  const Icon = tool.icon;

                  return (
                    <div
                      key={`${section.title}-${tool.id}`}
                      id={i === active ? `tool-${tool.id}` : undefined}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      aria-disabled={reason ? true : undefined}
                      onMouseMove={() => i !== active && setActive(i)}
                      onClick={() => run(tool)}
                      className={cx(
                        'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-csmju-body',
                        i === active ? 'bg-primary-soft' : 'hover:bg-surface-muted',
                        reason ? 'text-muted' : 'text-ink',
                      )}
                    >
                      <Icon aria-hidden className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{tool.label}</span>
                        {reason && <span className="block truncate text-csmju-caption">{reason}</span>}
                      </span>
                      {tool.keys && <kbd className="shrink-0 rounded-md bg-surface-muted px-2 py-0.5 font-sans text-csmju-caption text-ink">{formatKeys(tool.keys)}</kbd>}
                    </div>
                  );
                })}
              </section>
            ),
          )}
        </div>
        <p className="text-csmju-caption text-muted">↑ ↓ เลือก · Enter ใช้ · Esc ปิด · กด / ในหน้าแก้ไขเพื่อเปิดหน้าต่างนี้</p>
      </div>
    </Dialog>
  );
}

/// ตัวกรองจำลองการมองเห็นสี (เมทริกซ์ของ Machado et al. 2009 ที่ความรุนแรงเต็ม) — ใช้กับผืนผ้าใบด้วย CSS filter
const VISION_MATRICES: Record<VisionSim, string> = {
  protanopia: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
  deuteranopia: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
  tritanopia: '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0',
  achromatopsia: '0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0',
};

export const VISION_LABELS: Record<VisionSim, string> = {
  protanopia: 'จำลองตาบอดสีแดง',
  deuteranopia: 'จำลองตาบอดสีเขียว',
  tritanopia: 'จำลองตาบอดสีน้ำเงิน',
  achromatopsia: 'จำลองมองเห็นแบบขาวดำ',
};

export function VisionFilters() {
  const sim = useEditorUi((s) => s.visionSim);

  return (
    <>
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          {(Object.keys(VISION_MATRICES) as VisionSim[]).map((key) => (
            <filter key={key} id={`csc-vision-${key}`} colorInterpolationFilters="linearRGB">
              <feColorMatrix type="matrix" values={VISION_MATRICES[key]} />
            </filter>
          ))}
        </defs>
      </svg>
      {sim && (
        <div role="status" className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-inverse px-4 py-2 text-csmju-caption text-on-inverse shadow-csmju-lg">
          {VISION_LABELS[sim]} (เฉพาะบนจอ)
          <button type="button" onClick={() => useEditorUi.getState().set({ visionSim: null })} className="min-h-9 rounded-full bg-surface/15 px-3 font-semibold hover:bg-surface/25">
            เลิกจำลอง
          </button>
        </div>
      )}
    </>
  );
}
