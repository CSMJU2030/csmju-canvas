'use client';

import { useRef, useState } from 'react';
import { useEditor } from '@/lib/editor/store';
import { useEditorUi } from '@/lib/editor/ui-store';

/// ไม้บรรทัด เส้นไกด์ ขอบหน้ากระดาษ และระยะตัดตก (เมนูไฟล์ → ไม้บรรทัดและเส้นแนวทาง)
///
/// ลากจากไม้บรรทัดเพื่อสร้างเส้นไกด์ · ลากเส้นไกด์กลับไปที่ไม้บรรทัดเพื่อลบ · ชิ้นงานดูดเข้าหาเส้นไกด์ตอนลาก
/// เส้นไกด์เป็นของหน้าจอเท่านั้น ไม่บันทึกลงงานและไม่ออกในไฟล์ที่ดาวน์โหลด

const SIZE = 24;
/// ระยะตัดตก 3 มม. ที่ 96 dpi
export const BLEED_PX = (3 / 25.4) * 96;

function step(zoom: number): number {
  const targets = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];

  return targets.find((t) => t * zoom >= 60) ?? 5000;
}

export function Rulers() {
  const rulers = useEditorUi((s) => s.rulers);
  const margins = useEditorUi((s) => s.margins);
  const bleed = useEditorUi((s) => s.bleed);
  const grid = useEditorUi((s) => s.gridSnap);
  const guides = useEditorUi((s) => s.guideLines);
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);
  const width = useEditor((s) => s.width);
  const height = useEditor((s) => s.height);
  const wrap = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ index: number; axis: 'x' | 'y' } | null>(null);

  if (!rulers && !margins && !bleed && !grid) return null;

  const toPage = (clientX: number, clientY: number) => {
    const rect = wrap.current!.getBoundingClientRect();

    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom, sx: clientX - rect.left, sy: clientY - rect.top };
  };

  const startGuide = (axis: 'x' | 'y', event: React.PointerEvent) => {
    event.preventDefault();

    const ui = useEditorUi.getState();
    const p = toPage(event.clientX, event.clientY);

    ui.addGuide({ axis, at: Math.round(axis === 'x' ? p.x : p.y) });
    setDragging({ index: useEditorUi.getState().guideLines.length - 1, axis });
    wrap.current?.setPointerCapture(event.pointerId);
  };

  const s = step(zoom);
  const ticks = (length: number, offset: number) => {
    const out: number[] = [];
    const first = Math.floor(-offset / zoom / s) * s;

    for (let v = first; v * zoom + offset < length; v += s) out.push(v);

    return out;
  };
  const margin = Math.round(Math.min(width, height) * 0.05);

  return (
    <div
      ref={wrap}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      onPointerMove={(event) => {
        if (!dragging) return;

        const p = toPage(event.clientX, event.clientY);

        useEditorUi.getState().moveGuide(dragging.index, Math.round(dragging.axis === 'x' ? p.x : p.y));
      }}
      onPointerUp={(event) => {
        if (!dragging) return;

        const p = toPage(event.clientX, event.clientY);

        // ปล่อยบนไม้บรรทัด = ลบเส้นไกด์
        if ((dragging.axis === 'x' && p.sy < SIZE) || (dragging.axis === 'y' && p.sx < SIZE)) useEditorUi.getState().moveGuide(dragging.index, null);
        setDragging(null);
      }}
      style={{ pointerEvents: dragging ? 'auto' : 'none' }}
    >
      {grid && (
        // ตารางกริดบนหน้า (โหมดล็อกลงกริด) — เส้นจาง ๆ ไม่บังงาน
        <div
          aria-hidden
          className="absolute"
          style={{
            left: pan.x,
            top: pan.y,
            width: width * zoom,
            height: height * zoom,
            backgroundImage:
              'linear-gradient(to right, var(--csmju-color-focus-ring) 1px, transparent 1px), linear-gradient(to bottom, var(--csmju-color-focus-ring) 1px, transparent 1px)',
            backgroundSize: `${grid * zoom}px ${grid * zoom}px`,
            opacity: 0.35,
          }}
        />
      )}
      {margins && (
        <div
          aria-hidden
          className="absolute border border-dashed border-type-teal"
          style={{ left: pan.x + margin * zoom, top: pan.y + margin * zoom, width: (width - margin * 2) * zoom, height: (height - margin * 2) * zoom }}
        />
      )}
      {bleed && (
        <div
          aria-hidden
          className="absolute border border-dashed border-danger"
          style={{ left: pan.x - BLEED_PX * zoom, top: pan.y - BLEED_PX * zoom, width: (width + BLEED_PX * 2) * zoom, height: (height + BLEED_PX * 2) * zoom }}
        />
      )}
      {rulers &&
        guides.map((g, index) => (
          <div
            key={index}
            role="separator"
            aria-orientation={g.axis === 'x' ? 'vertical' : 'horizontal'}
            aria-label={`เส้นไกด์ที่ ${g.at} px — ลากกลับไปที่ไม้บรรทัดเพื่อลบ`}
            onPointerDown={(event) => {
              event.stopPropagation();
              setDragging({ index, axis: g.axis });
              wrap.current?.setPointerCapture(event.pointerId);
            }}
            className="pointer-events-auto absolute bg-type-magenta"
            style={
              g.axis === 'x'
                ? { left: pan.x + g.at * zoom - 1, top: 0, width: 2, height: '100%', cursor: 'col-resize' }
                : { top: pan.y + g.at * zoom - 1, left: 0, height: 2, width: '100%', cursor: 'row-resize' }
            }
          />
        ))}
      {rulers && (
        <>
          <div
            aria-label="ไม้บรรทัดแนวนอน — ลากลงเพื่อสร้างเส้นไกด์แนวตั้ง"
            role="slider"
            aria-valuenow={0}
            tabIndex={-1}
            onPointerDown={(event) => startGuide('x', event)}
            className="pointer-events-auto absolute top-0 right-0 left-0 cursor-col-resize border-b border-line bg-surface/95"
            style={{ height: SIZE, paddingLeft: SIZE }}
          >
            {ticks(4000, pan.x).map((v) => (
              <span key={v} className="absolute top-0 h-full border-l border-line-strong pl-0.5 text-csmju-caption leading-none text-muted" style={{ left: pan.x + v * zoom }}>
                {v}
              </span>
            ))}
          </div>
          <div
            aria-label="ไม้บรรทัดแนวตั้ง — ลากไปทางขวาเพื่อสร้างเส้นไกด์แนวนอน"
            role="slider"
            aria-valuenow={0}
            tabIndex={-1}
            onPointerDown={(event) => startGuide('y', event)}
            className="pointer-events-auto absolute top-0 bottom-0 left-0 cursor-row-resize border-r border-line bg-surface/95"
            style={{ width: SIZE }}
          >
            {ticks(4000, pan.y).map((v) => (
              <span key={v} className="absolute left-0 w-full border-t border-line-strong text-center text-csmju-caption leading-none text-muted" style={{ top: pan.y + v * zoom, writingMode: 'vertical-rl' }}>
                {v}
              </span>
            ))}
          </div>
          <div aria-hidden className="absolute top-0 left-0 bg-surface" style={{ width: SIZE, height: SIZE }} />
        </>
      )}
    </div>
  );
}
