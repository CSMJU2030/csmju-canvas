'use client';

import { ChevronDown, ChevronUp, GripHorizontal, Inbox, Maximize2, PanelRight, ShieldAlert, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cx } from '@/components/csmju/primitives';
import { IMAGE_SOURCES, INSPIRATION_GROUP_LABEL, INSPIRATION_WARNING, type ImageSourceSite } from '@/lib/editor/image-sources';
import { canEditDoc, useEditor } from '@/lib/editor/store';
import { arrowDelta, useSourcesWindow, type WindowRect } from '@/lib/editor/sources-window';
import { SOURCE_ICONS, useOpenSource } from './image-sources-panel';
import { ReceiveDropZone, useReceiveImport, useReceiveStatus } from './receive-import';
import { ReceiveTrayPortal, TrayLink, trayHint } from './receive-tray';

/// หน้าต่างลอย "แหล่งภาพ" เหนือหน้าแก้ไข (ชุดเครื่องมือส่วนตัว) + ถาดรับภาพ (Picture-in-Picture)
///
/// ลากด้วยหัวหน้าต่าง · ปรับขนาดที่มุมขวาล่าง · ย่อเก็บเหลือแค่หัว · จำตำแหน่ง/ขนาด/การย่อไว้ในเบราว์เซอร์ของผู้ชม
/// คีย์บอร์ด: โฟกัสที่หัวหน้าต่างแล้วกดลูกศรเพื่อย้าย (Shift = ทีละมาก) · ที่มุมปรับขนาดกดลูกศรเพื่อปรับ · Esc = ย่อเก็บ
/// ชั้น z-40: อยู่เหนือผืนผ้าใบและแผงล่างของมือถือ (z-30) แต่อยู่ใต้เมนูลอย/แจ้งเตือน (z-50) และหน้าต่างโต้ตอบ (dialog)

export function SourcesLayer() {
  const readOnly = useEditor((s) => !canEditDoc(s));

  return (
    <>
      {!readOnly && <SourcesWindow />}
      <ReceiveTrayPortal />
    </>
  );
}

function SourcesWindow() {
  const open = useSourcesWindow((s) => s.open);
  const rect = useSourcesWindow((s) => s.rect);
  const minimized = useSourcesWindow((s) => s.minimized);

  // จอเปลี่ยนขนาด → ดึงหน้าต่างกลับเข้าจอ
  useEffect(() => {
    if (!open) return;

    const onResize = () => useSourcesWindow.getState().fit();

    window.addEventListener('resize', onResize);

    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  if (!open || !rect) return null;

  return <FloatingWindow rect={rect} minimized={minimized} />;
}

type DragMode = 'move' | 'resize';

function FloatingWindow({ rect, minimized }: { rect: WindowRect; minimized: boolean }) {
  const titleId = useId();
  const drag = useRef<{ mode: DragMode; startX: number; startY: number; rect: WindowRect } | null>(null);
  /// ลากจริง (ไม่ใช่แค่คลิก) — มุมปรับขนาดใช้แยกคลิกออกจากการลาก
  const moved = useRef(false);
  const store = useSourcesWindow.getState;

  const startDrag = (mode: DragMode, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    // ปุ่มบนหัวหน้าต่าง (ย่อ/ปิด) ไม่เริ่มลาก
    if (mode === 'move' && (event.target as HTMLElement).closest('button')) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode, startX: event.clientX, startY: event.clientY, rect };
    moved.current = false;
  };
  const onDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;

    if (!d) return;

    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;

    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    store().setRect(d.mode === 'move' ? { ...d.rect, x: d.rect.x + dx, y: d.rect.y + dy } : { ...d.rect, width: d.rect.width + dx, height: d.rect.height + dy });
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !minimized) {
          event.stopPropagation();
          store().setMinimized(true);
        }
      }}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: minimized ? undefined : rect.height }}
      className="csmju-pop fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-csmju-lg"
    >
      <header
        tabIndex={0}
        aria-roledescription="แถบย้ายหน้าต่าง"
        aria-label="แหล่งภาพ (หน้าต่างลอย) — กดลูกศรเพื่อย้าย"
        onPointerDown={(event) => startDrag('move', event)}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;

          const delta = arrowDelta(event.key, event.shiftKey);

          if (!delta) return;
          event.preventDefault();
          store().setRect({ ...rect, x: rect.x + delta.dx, y: rect.y + delta.dy });
        }}
        className="flex min-h-13 shrink-0 cursor-move touch-none items-center gap-2 border-b border-line bg-surface-muted px-3 select-none focus-visible:outline-2 focus-visible:outline-primary"
      >
        <GripHorizontal aria-hidden className="size-5 shrink-0 text-muted" />
        <h2 id={titleId} className="flex-1 truncate text-csmju-body font-bold text-ink">
          แหล่งภาพ
        </h2>
        <button
          type="button"
          onClick={() => store().setMinimized(!minimized)}
          aria-label={minimized ? 'ขยายหน้าต่างแหล่งภาพ' : 'ย่อหน้าต่างแหล่งภาพ (Esc)'}
          aria-expanded={!minimized}
          title={minimized ? 'ขยาย' : 'ย่อเก็บ'}
          className="inline-flex size-10 items-center justify-center rounded-xl text-ink hover:bg-surface"
        >
          {minimized ? <ChevronUp aria-hidden className="size-5" /> : <ChevronDown aria-hidden className="size-5" />}
        </button>
        <button
          type="button"
          onClick={() => store().hide()}
          aria-label="ปิดหน้าต่างแหล่งภาพ"
          title="ปิด"
          className="inline-flex size-10 items-center justify-center rounded-xl text-ink hover:bg-surface"
        >
          <X aria-hidden className="size-5" />
        </button>
      </header>

      {!minimized && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <SourcesWindowBody />
          </div>
          <button
            type="button"
            aria-label="ปรับขนาดหน้าต่าง — ลากหรือกดลูกศร · กดเพื่อสลับขนาดเล็ก/ใหญ่"
            title="ปรับขนาด"
            onPointerDown={(event) => startDrag('resize', event)}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={() => {
              // คลิกหรือ Enter (ไม่ได้ลาก) = สลับระหว่างขนาดกะทัดรัดกับขนาดใหญ่
              if (moved.current) {
                moved.current = false;
                return;
              }

              const large = rect.width >= 520;

              store().setRect(large ? { ...rect, width: 360, height: 520 } : { ...rect, width: 560, height: window.innerHeight - rect.y - 16 });
            }}
            onKeyDown={(event) => {
              const delta = arrowDelta(event.key, event.shiftKey);

              if (!delta) return;
              event.preventDefault();
              store().setRect({ ...rect, width: rect.width + delta.dx, height: rect.height + delta.dy });
            }}
            className="absolute right-0 bottom-0 inline-flex size-8 cursor-nwse-resize touch-none items-center justify-center rounded-tl-xl text-muted hover:bg-surface-muted hover:text-ink"
          >
            <Maximize2 aria-hidden className="size-4 rotate-90" />
          </button>
        </>
      )}
    </section>
  );
}

function SourcesWindowBody() {
  const [q, setQ] = useState('');
  const searchId = useId();
  const { fromTransfer, fromClipboard } = useReceiveImport();
  const { busy, result, run } = useReceiveStatus();
  const [over, setOver] = useState(false);
  const inspiration = IMAGE_SOURCES.filter((s) => s.group === 'inspiration');
  const free = IMAGE_SOURCES.filter((s) => s.group === 'free');
  const pinterest = IMAGE_SOURCES.find((s) => s.key === 'pinterest')!;

  return (
    <div className="flex flex-col gap-4">
      <ReceiveDropZone
        interactive
        over={over}
        busy={busy}
        result={result}
        onOver={setOver}
        onTransfer={(data) => void run(() => fromTransfer(data))}
        onClipboard={() => void run(fromClipboard)}
      />

      <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
        <TrayLink
          source={pinterest}
          q={q}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-center text-csmju-caption font-semibold text-on-inverse hover:bg-primary-hover"
        >
          <Inbox aria-hidden className="size-4 shrink-0" /> เปิดถาดรับภาพ แล้วไปที่ Pinterest
        </TrayLink>
        <p className="text-csmju-caption text-body">{trayHint()}</p>
      </div>

      <div>
        <label htmlFor={searchId} className="mb-1 block text-csmju-caption font-semibold text-ink">
          คำค้น (ไม่ใส่ก็ได้ · ส่งไปที่เว็บนั้นโดยตรง)
        </label>
        <input id={searchId} type="search" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} className="min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-csmju-body text-ink focus:border-primary focus:outline-none" />
      </div>

      <section aria-label={INSPIRATION_GROUP_LABEL}>
        <h3 className="mb-1 text-csmju-caption font-bold text-ink">{INSPIRATION_GROUP_LABEL}</h3>
        <p className="mb-2 flex gap-1.5 rounded-lg bg-warning-bg px-2 py-1 text-csmju-caption text-warning">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{INSPIRATION_WARNING}</span>
        </p>
        <ul className="flex flex-col gap-2">
          {inspiration.map((source) => (
            <li key={source.key}>
              <SourceRow source={source} q={q} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="คลังภาพสัญญาอนุญาตเสรี">
        <h3 className="mb-2 text-csmju-caption font-bold text-ink">คลังภาพสัญญาอนุญาตเสรี</h3>
        <ul className="flex flex-col gap-2">
          {free.map((source) => (
            <li key={source.key}>
              <SourceRow source={source} q={q} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SourceRow({ source, q }: { source: ImageSourceSite; q: string }) {
  const open = useOpenSource();
  const Icon = SOURCE_ICONS[source.key];
  const warn = source.group === 'inspiration';

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line p-2">
      <span aria-hidden className={cx('inline-flex size-9 shrink-0 items-center justify-center rounded-lg', warn ? 'bg-warning-bg text-warning' : 'bg-primary-soft text-primary')}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-csmju-caption font-semibold text-ink" title={source.description}>
        {source.name}
      </span>
      <button
        type="button"
        onClick={() => open(source, q)}
        aria-label={`เปิด ${source.name} ข้างจอ`}
        title="เปิดข้างจอ"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface-muted"
      >
        <PanelRight aria-hidden className="size-4" />
      </button>
      <TrayLink
        source={source}
        q={q}
        className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-line-strong px-2 text-csmju-caption font-semibold text-ink hover:bg-surface-muted"
      >
        <Inbox aria-hidden className="size-4" /> ถาด
        <span className="sr-only">: เปิด {source.name} ในแท็บใหม่พร้อมถาดรับภาพ</span>
      </TrayLink>
    </div>
  );
}
