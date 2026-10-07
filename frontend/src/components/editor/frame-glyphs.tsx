import { frameArea, frameDecor, frameMaskPath, frameShapeSpec, gridCellRects, roundRectPath } from '@/lib/editor/frames';
import type { FrameShape, GridLayout } from '@/lib/editor/types';

/// ภาพตัวอย่างของกรอบและเค้าโครงกริดสำหรับปุ่มในแผงองค์ประกอบ (สีตาม `currentColor`)
///
/// ใช้ path ชุดเดียวกับตัววาดบนผืนผ้าใบ จึงหน้าตาตรงกับของที่ได้จริง

const VIEW = 48;
const PAD = 4;

/// กล่องขนาดพอดี 40×40 ตรงกลาง ตามสัดส่วนที่ให้
function fitBox(aspect: number) {
  const size = VIEW - PAD * 2;
  const width = aspect >= 1 ? size : size * aspect;
  const height = aspect >= 1 ? size / aspect : size;

  return { x: (VIEW - width) / 2, y: (VIEW - height) / 2, width, height };
}

export function FrameShapeGlyph({ shape, className = 'size-10' }: { shape: FrameShape; className?: string }) {
  const box = fitBox(frameShapeSpec(shape).aspect);
  const decor = frameDecor(shape, box);

  return (
    <svg aria-hidden viewBox={`0 0 ${VIEW} ${VIEW}`} className={className}>
      {decor.back.map((layer, i) => (
        <path key={i} d={layer.d} fill="currentColor" fillOpacity={i === 0 ? 0.85 : 0.5} stroke="currentColor" strokeWidth={1} />
      ))}
      <path d={frameMaskPath(shape, frameArea(shape, box))} fill="currentColor" fillOpacity={decor.back.length > 0 ? 0.25 : 0.35} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

export function GridLayoutGlyph({ layout, className = 'size-10' }: { layout: GridLayout; className?: string }) {
  const box = { x: PAD, y: PAD, width: VIEW - PAD * 2, height: VIEW - PAD * 2 };

  return (
    <svg aria-hidden viewBox={`0 0 ${VIEW} ${VIEW}`} className={className}>
      {gridCellRects({ ...box, layout, gap: 2.5 }).map((cell, i) => (
        <path key={i} d={roundRectPath(cell, 2)} fill="currentColor" fillOpacity={0.35} stroke="currentColor" strokeWidth={1} />
      ))}
    </svg>
  );
}
