'use client';

import { Brush, Eraser, Loader2, MousePointerClick, RotateCcw, SquareDashed } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cx } from '@/components/csmju/primitives';
import {
  applyCutout,
  grabCut,
  keptMask,
  objectAt,
  refineAlpha,
  WORK_MAX,
  type CutoutHints,
  type CutoutPixels,
  type CutoutResult,
  type CutoutStroke,
} from '@/lib/editor/smart-cutout';
import { RangeField } from './controls';

/// ลบพื้นหลังแบบอัจฉริยะ (แผง "ลบพื้นหลัง" โหมดแรก) — ระบบหาวัตถุเอง แล้วให้ผู้ใช้ชี้แก้ได้ทุกจุด
///
///   เลือกวัตถุ  คลิกวัตถุที่พบ (มีเส้นรอบสี) เพื่อสลับ เก็บ ↔ ตัดทิ้ง
///   ตีกรอบ      ลากกรอบรอบวัตถุที่ต้องการ — นอกกรอบเป็นพื้นหลังแน่นอน
///   แปรงเก็บ    ทาส่วนของวัตถุที่หายไป (เช่นเสื้อสีขาวบนพื้นขาว)
///   แปรงลบ      ทาส่วนพื้นหลังที่ยังติดอยู่
///
/// ทุกครั้งที่ตีกรอบ/ทาแปรงเสร็จ ระบบคำนวณใหม่ทั้งภาพ (~0.5 วินาที) · ขอบละเอียดระดับพิกเซลของรูปจริงตอนกดใช้

type Tool = 'select' | 'rect' | 'keep' | 'remove';

/// สีเส้นรอบวัตถุแต่ละชิ้น (วนซ้ำเมื่อเกิน) — rgb แยกช่องสำหรับเขียนลง ImageData
const OBJECT_COLORS: [number, number, number][] = [
  [33, 84, 217],
  [16, 185, 129],
  [245, 158, 11],
  [236, 72, 153],
  [139, 92, 246],
  [20, 184, 166],
];

const rgb = ([r, g, b]: [number, number, number], alpha = 1) => `rgb(${r} ${g} ${b} / ${alpha})`;

export interface SmartCutoutHandle {
  /// สร้างรูปผลลัพธ์จากรูปขนาดจริง (คืน null ถ้ายังไม่พบวัตถุ)
  render: (full: CutoutPixels) => CutoutPixels | null;
}

/// ย่อพิกเซลของรูปให้ด้านยาวไม่เกิน max
export function pixelsAt(img: HTMLImageElement, max: number): CutoutPixels {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');

  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return { data: image.data, width: image.width, height: image.height };
}

export function SmartCutoutView({
  image,
  previewMax,
  softness,
  onSoftness,
  handleRef,
  onStatus,
}: {
  image: HTMLImageElement;
  previewMax: number;
  softness: number;
  onSoftness: (value: number) => void;
  handleRef: React.RefObject<SmartCutoutHandle | null>;
  /// แจ้งแผงว่าพบวัตถุกี่ชิ้น (null = กำลังคำนวณ)
  onStatus: (objects: number | null) => void;
}) {
  const work = useMemo(() => pixelsAt(image, WORK_MAX), [image]);
  const preview = useMemo(() => pixelsAt(image, previewMax), [image, previewMax]);
  const [hints, setHints] = useState<CutoutHints>({ rect: null, strokes: [] });
  const [result, setResult] = useState<CutoutResult | null>(null);
  const [busy, setBusy] = useState(true);
  /// วัตถุที่ผู้ใช้สั่งตัด — เก็บเป็นจุดบนรูป เพราะเลขชิ้นเปลี่ยนทุกครั้งที่คำนวณใหม่
  const [excludedPoints, setExcludedPoints] = useState<{ x: number; y: number }[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [brush, setBrush] = useState(4);
  const [hover, setHover] = useState(-1);
  const [draft, setDraft] = useState<{ rect?: CutoutHints['rect']; stroke?: CutoutStroke } | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // คำนวณใหม่เมื่อกรอบ/แปรงเปลี่ยน — ปล่อยให้ตัวหมุนขึ้นจอก่อน แล้วค่อยคำนวณ
  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setBusy(true);
        onStatus(null);
      }
    });

    const timer = window.setTimeout(() => {
      if (cancelled) return;

      const next = grabCut(work, hints);

      setResult(next);
      setBusy(false);
      onStatus(next.objects.length);
    }, 40);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [work, hints, onStatus]);

  const excluded = useMemo(() => {
    const ids = new Set<number>();

    if (!result) return ids;

    for (const point of excludedPoints) {
      const id = objectAt(result, point.x, point.y);

      if (id >= 0) ids.add(id);
    }

    return ids;
  }, [result, excludedPoints]);

  const render = useCallback(
    (target: CutoutPixels): CutoutPixels | null => {
      if (!result || result.objects.length === 0) return null;

      const out: CutoutPixels = { data: new Uint8ClampedArray(target.data), width: target.width, height: target.height };
      const alpha = refineAlpha(out, keptMask(result, excluded), result.width, result.height, softness);

      applyCutout(out, alpha);

      return out;
    },
    [result, excluded, softness],
  );

  useEffect(() => {
    handleRef.current = { render };
  }, [handleRef, render]);

  // ตัวอย่างผลลัพธ์
  useEffect(() => {
    const canvas = previewRef.current;

    if (!canvas) return;

    canvas.width = preview.width;
    canvas.height = preview.height;

    const out = render(preview) ?? preview;

    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(out.data), out.width, out.height), 0, 0);
  }, [preview, render]);

  // ชั้นบน: เส้นรอบวัตถุ · วัตถุที่ตัดทิ้ง (แดงจาง) · ชิ้นที่ชี้อยู่ · กรอบ/แปรงที่กำลังลาก
  useEffect(() => {
    const canvas = overlayRef.current;

    if (!canvas) return;

    canvas.width = preview.width;
    canvas.height = preview.height;

    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (result && result.objects.length > 0) {
      const { width, height, labels } = result;
      const layer = new ImageData(width, height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          const id = labels[i];

          if (id < 0) continue;

          const edge =
            x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
            labels[i - 1] !== id || labels[i + 1] !== id || labels[i - width] !== id || labels[i + width] !== id;
          const color = excluded.has(id) ? ([220, 38, 38] as [number, number, number]) : OBJECT_COLORS[id % OBJECT_COLORS.length];
          const fill = excluded.has(id) ? 90 : id === hover ? 70 : 0;
          const a = edge ? 255 : fill;

          if (a === 0) continue;

          layer.data[i * 4] = color[0];
          layer.data[i * 4 + 1] = color[1];
          layer.data[i * 4 + 2] = color[2];
          layer.data[i * 4 + 3] = a;
        }
      }

      const scratch = document.createElement('canvas');

      scratch.width = width;
      scratch.height = height;
      scratch.getContext('2d')!.putImageData(layer, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
    }

    const drawStroke = (stroke: CutoutStroke) => {
      ctx.strokeStyle = stroke.mode === 'keep' ? 'rgb(16 185 129 / 0.55)' : 'rgb(220 38 38 / 0.55)';
      ctx.lineWidth = stroke.radius * 2 * canvas.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      stroke.points.forEach((point, index) => {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;

        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x * canvas.width + 0.1, stroke.points[0].y * canvas.height);
      ctx.stroke();
    };

    hints.strokes.forEach(drawStroke);
    if (draft?.stroke) drawStroke(draft.stroke);

    const rect = draft?.rect ?? hints.rect;

    if (rect) {
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgb(33 84 217)';
      ctx.strokeRect(
        Math.min(rect.x0, rect.x1) * canvas.width,
        Math.min(rect.y0, rect.y1) * canvas.height,
        Math.abs(rect.x1 - rect.x0) * canvas.width,
        Math.abs(rect.y1 - rect.y0) * canvas.height,
      );
      ctx.setLineDash([]);
    }
  }, [preview, result, excluded, hover, hints, draft]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();

    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  };

  const onDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (busy) return;

    const p = point(event);

    if (tool === 'select') {
      if (!result) return;

      const id = objectAt(result, p.x, p.y);

      if (id < 0) return;

      // สลับ: ชิ้นที่ตัดอยู่แล้ว → เอาจุดที่ชี้ชิ้นนั้นออก · ชิ้นที่เก็บอยู่ → จำจุดนี้ไว้ว่าตัด
      setExcludedPoints((current) =>
        excluded.has(id) ? current.filter((q) => objectAt(result, q.x, q.y) !== id) : [...current, p],
      );
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === 'rect') setDraft({ rect: { x0: p.x, y0: p.y, x1: p.x, y1: p.y } });
    else setDraft({ stroke: { mode: tool, radius: brush / 100, points: [p] } });
  };

  const onMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = point(event);

    if (tool === 'select') {
      setHover(result ? objectAt(result, p.x, p.y) : -1);
      return;
    }

    setDraft((current) => {
      if (!current) return current;
      if (current.rect) return { rect: { ...current.rect, x1: p.x, y1: p.y } };
      if (current.stroke) return { stroke: { ...current.stroke, points: [...current.stroke.points, p] } };

      return current;
    });
  };

  const onUp = () => {
    const current = draft;

    setDraft(null);

    if (!current) return;

    if (current.rect) {
      const { x0, y0, x1, y1 } = current.rect;

      // กรอบเล็กมาก = คลิกพลาด ไม่ใช่ตั้งใจตีกรอบ
      if (Math.abs(x1 - x0) < 0.03 || Math.abs(y1 - y0) < 0.03) return;
      setHints((h) => ({ ...h, rect: current.rect ?? null }));
    } else if (current.stroke) {
      const stroke = current.stroke;

      setHints((h) => ({ ...h, strokes: [...h.strokes, stroke] }));
    }
  };

  const edited = hints.rect !== null || hints.strokes.length > 0 || excludedPoints.length > 0;

  const TOOLS: { key: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
    { key: 'select', label: 'เลือกวัตถุ', icon: <MousePointerClick aria-hidden className="size-4" />, hint: 'คลิกวัตถุที่มีเส้นรอบเพื่อสลับ เก็บ/ตัดทิ้ง (สีแดง = ตัดทิ้ง)' },
    { key: 'rect', label: 'ตีกรอบ', icon: <SquareDashed aria-hidden className="size-4" />, hint: 'ลากกรอบรอบวัตถุที่ต้องการ — นอกกรอบจะถูกลบทั้งหมด' },
    { key: 'keep', label: 'แปรงเก็บ', icon: <Brush aria-hidden className="size-4" />, hint: 'ทาส่วนของวัตถุที่หายไป ระบบจะคำนวณใหม่ให้ติดกับวัตถุ' },
    { key: 'remove', label: 'แปรงลบ', icon: <Eraser aria-hidden className="size-4" />, hint: 'ทาพื้นหลังที่ยังติดอยู่ ระบบจะตัดออกให้' },
  ];

  return (
    <div>
      <div className="csmju-checker relative overflow-hidden rounded-xl border border-line">
        <div className="relative mx-auto w-fit">
          <canvas ref={previewRef} aria-label="ตัวอย่างรูปหลังลบพื้นหลัง" className="block max-h-72 w-auto max-w-full" />
          <canvas
            ref={overlayRef}
            aria-label={TOOLS.find((t) => t.key === tool)?.hint}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => setHover(-1)}
            className={cx(
              'absolute inset-0 size-full touch-none',
              tool === 'select' ? (hover >= 0 ? 'cursor-pointer' : 'cursor-default') : 'cursor-crosshair',
            )}
          />
        </div>
        {busy && (
          <span role="status" className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/60 text-csmju-caption font-semibold text-ink">
            <Loader2 aria-hidden className="size-5 animate-spin" /> กำลังวิเคราะห์ภาพ…
          </span>
        )}
      </div>

      {result && !busy && (
        <p className="mt-2 text-csmju-caption text-muted">
          {result.objects.length === 0
            ? 'ไม่พบวัตถุที่เด่นจากพื้นหลัง — ลองตีกรอบรอบวัตถุ หรือใช้แปรงเก็บทาบนวัตถุ'
            : `พบวัตถุ ${result.objects.length} ชิ้น · เก็บ ${result.objects.length - excluded.size} ชิ้น`}
        </p>
      )}

      {result && result.objects.length > 1 && (
        <div role="group" aria-label="วัตถุที่พบ" className="mt-2 flex flex-wrap gap-1.5">
          {result.objects.slice(0, 12).map((object) => {
            const off = excluded.has(object.id);
            const color = OBJECT_COLORS[object.id % OBJECT_COLORS.length];

            return (
              <button
                key={object.id}
                type="button"
                aria-pressed={!off}
                onMouseEnter={() => setHover(object.id)}
                onMouseLeave={() => setHover(-1)}
                onClick={() =>
                  setExcludedPoints((current) => {
                    if (off) return current.filter((q) => objectAt(result, q.x, q.y) !== object.id);

                    // จุดตัวแทนของชิ้น = พิกเซลแรกของชิ้นนั้น (ต้องอยู่บนชิ้นจริง ไม่ใช่กลางกรอบที่อาจเป็นรู)
                    const index = result.labels.indexOf(object.id);
                    const x = ((index % result.width) + 0.5) / result.width;
                    const y = (Math.floor(index / result.width) + 0.5) / result.height;

                    return [...current, { x, y }];
                  })
                }
                className={cx(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-csmju-caption',
                  off ? 'border-danger-line text-danger line-through' : 'border-line-strong text-ink hover:bg-surface-muted',
                )}
              >
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: rgb(off ? [220, 38, 38] : color) }} />
                ชิ้นที่ {object.id + 1} · {Math.max(1, Math.round(object.area * 100))}%
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-4 mb-2 text-csmju-caption font-semibold text-ink">แก้ด้วยมือ</p>
      <div role="radiogroup" aria-label="เครื่องมือแก้การลบพื้นหลัง" className="grid grid-cols-4 gap-1 rounded-xl bg-surface-muted p-1">
        {TOOLS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="radio"
            aria-checked={tool === item.key}
            onClick={() => setTool(item.key)}
            className={cx(
              'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-csmju-caption',
              tool === item.key ? 'bg-surface font-semibold text-ink shadow-csmju-sm' : 'text-body',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-csmju-caption text-muted">{TOOLS.find((t) => t.key === tool)?.hint}</p>

      <div className="mt-4 flex flex-col gap-4">
        {(tool === 'keep' || tool === 'remove') && (
          <RangeField label="ขนาดแปรง" value={brush} min={1} max={15} onChange={setBrush} />
        )}
        <RangeField label="ขอบนุ่ม (0 = คมเหมือนตัดด้วยมีด · สูง = เหมาะกับผม/ขนสัตว์)" value={softness} min={0} max={10} onChange={onSoftness} />
      </div>

      {edited && (
        <button
          type="button"
          onClick={() => {
            setHints({ rect: null, strokes: [] });
            setExcludedPoints([]);
          }}
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-csmju-caption font-semibold text-primary hover:bg-primary-soft"
        >
          <RotateCcw aria-hidden className="size-4" /> ล้างที่แก้ทั้งหมด
        </button>
      )}
    </div>
  );
}
