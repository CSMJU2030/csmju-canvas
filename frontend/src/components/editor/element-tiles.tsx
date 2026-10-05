import { cx } from '@/components/csmju/primitives';

/// ไทล์หมวดของแผงองค์ประกอบแบบ Canva (ภาพบรีฟ 245/246): การ์ดสีไล่เฉดมีภาพประกอบ ซ้อนบนการ์ดเอียงสีอ่อน
///
/// สีทั้งหมดมาจาก token ของระบบ (type-* · pastel-* · on-inverse · ink) จึงตามธีมสว่าง/มืดได้

export type TileKind =
  | 'shapes' | 'graphics' | 'photos' | 'videos' | 'audio' | 'stickers' | 'tables' | 'charts' | 'frames' | 'grids' | 'lines' | 'icons' | 'sticky';

/// สีของการ์ดหน้า (ไล่เฉด) และการ์ดหลัง — เขียนเต็มชื่อคลาสเพื่อให้ Tailwind สร้างครบ
const TONES: Record<TileKind, { front: string; back: string }> = {
  shapes: { front: 'from-type-teal to-type-blue', back: 'bg-type-teal/40' },
  graphics: { front: 'from-type-orange to-type-red', back: 'bg-type-orange/40' },
  photos: { front: 'from-type-blue to-type-indigo', back: 'bg-type-blue/40' },
  videos: { front: 'from-type-magenta to-type-pink', back: 'bg-type-pink/40' },
  audio: { front: 'from-type-red to-type-pink', back: 'bg-type-red/40' },
  stickers: { front: 'from-type-green to-type-teal', back: 'bg-type-green/40' },
  tables: { front: 'from-type-orange to-type-red', back: 'bg-type-orange/40' },
  charts: { front: 'from-type-teal to-type-green', back: 'bg-type-teal/40' },
  frames: { front: 'from-type-green to-type-teal', back: 'bg-type-green/40' },
  grids: { front: 'from-type-purple to-type-magenta', back: 'bg-type-purple/40' },
  lines: { front: 'from-type-indigo to-type-purple', back: 'bg-type-indigo/40' },
  icons: { front: 'from-type-purple to-type-indigo', back: 'bg-type-purple/40' },
  sticky: { front: 'from-type-magenta to-type-orange', back: 'bg-type-magenta/40' },
};

export function CategoryTile({ kind, className }: { kind: TileKind; className?: string }) {
  const tone = TONES[kind];

  return (
    <span aria-hidden className={cx('relative flex size-18 items-center justify-center', className)}>
      <span className={cx('absolute inset-1 translate-x-1.5 -translate-y-1 rotate-6 rounded-2xl', tone.back)} />
      <span
        className={cx(
          'relative flex size-16 items-center justify-center rounded-2xl bg-linear-to-br shadow-csmju-md ring-1 ring-on-inverse/25 transition-transform group-hover:-translate-y-0.5',
          tone.front,
        )}
      >
        <svg viewBox="0 0 48 48" className="csmju-wiggle size-12">
          <TileArt kind={kind} />
        </svg>
      </span>
    </span>
  );
}

const PETALS = [0, 45, 90, 135, 180, 225, 270, 315];
const SCALLOPS = [0, 45, 90, 135, 180, 225, 270, 315];

function TileArt({ kind }: { kind: TileKind }) {
  switch (kind) {
    case 'shapes':
      return (
        <>
          <path d="M17 7 27.5 14.5 23.5 27H10.5L6.5 14.5Z" className="fill-on-inverse/90" />
          <path d="M32 14 43 34H21Z" className="fill-pastel-pink" />
          {[12, 18, 24, 30, 36].map((x) => (
            <circle key={x} cx={x} cy={41} r={1.8} className="fill-on-inverse" />
          ))}
        </>
      );
    case 'graphics':
      return (
        <>
          <path d="M24 30v14" strokeWidth={3} strokeLinecap="round" className="stroke-type-green" />
          <ellipse cx={30} cy={38} rx={5} ry={2.5} transform="rotate(-30 30 38)" className="fill-type-green" />
          {PETALS.map((angle) => (
            <ellipse key={angle} cx={24} cy={12} rx={3.6} ry={7} transform={`rotate(${angle} 24 20)`} className="fill-pastel-butter" />
          ))}
          <circle cx={24} cy={20} r={6.5} className="fill-type-red" />
          <circle cx={24} cy={20} r={3} className="fill-ink/40" />
        </>
      );
    case 'photos':
      return (
        <>
          <rect x={7} y={9} width={34} height={30} rx={3} className="fill-on-inverse" />
          <rect x={10} y={12} width={28} height={24} rx={1.5} className="fill-pastel-sky" />
          <circle cx={31} cy={18} r={3.2} className="fill-pastel-butter" />
          <path d="M10 36 19 24l6 7 4-4 9 9Z" className="fill-type-blue" />
        </>
      );
    case 'videos':
      return (
        <>
          <circle cx={24} cy={24} r={16} strokeWidth={2.5} className="fill-on-inverse/25 stroke-on-inverse" />
          <path d="M20 16.5v15l12-7.5Z" className="fill-on-inverse" />
        </>
      );
    case 'audio':
      return (
        <>
          <path d="M19 35V14l17-4v20" fill="none" strokeWidth={3.5} strokeLinejoin="round" className="stroke-on-inverse" />
          <circle cx={14.5} cy={35} r={5} className="fill-on-inverse" />
          <circle cx={31.5} cy={30} r={5} className="fill-on-inverse" />
        </>
      );
    case 'stickers':
      return (
        <>
          <circle cx={24} cy={24} r={15} strokeWidth={2.5} className="fill-pastel-butter stroke-on-inverse" />
          <circle cx={19} cy={21} r={2} className="fill-ink" />
          <circle cx={29} cy={21} r={2} className="fill-ink" />
          <path d="M17.5 27.5q6.5 7 13 0" fill="none" strokeWidth={2.2} strokeLinecap="round" className="stroke-ink" />
          <path d="M39 26a15 15 0 0 1-8 11.5l-1-8.5Z" className="fill-on-inverse/90" />
        </>
      );
    case 'tables':
      return (
        <>
          <rect x={7} y={10} width={34} height={28} rx={3} className="fill-on-inverse" />
          <rect x={7} y={10} width={34} height={7} rx={3} className="fill-pastel-peach" />
          <path d="M7 24h34M7 31h34M18 17v21M30 17v21" strokeWidth={1.6} className="stroke-type-orange" />
        </>
      );
    case 'charts':
      return (
        <>
          <rect x={7} y={9} width={34} height={30} rx={3} className="fill-on-inverse/20" />
          <path d="M9 37V29l8-8 8 6 14-13v23Z" className="fill-on-inverse/45" />
          <path d="M9 29l8-8 8 6 14-13" fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className="stroke-on-inverse" />
          <path d="M25 12v26" strokeWidth={1.2} strokeDasharray="2 2" className="stroke-on-inverse" />
        </>
      );
    case 'frames':
      return (
        <>
          {SCALLOPS.map((angle) => (
            <circle key={angle} cx={24} cy={10} r={6} transform={`rotate(${angle} 24 24)`} className="fill-on-inverse" />
          ))}
          <circle cx={24} cy={24} r={14} className="fill-on-inverse" />
          <circle cx={24} cy={24} r={11} className="fill-pastel-sky" />
          <path d="M13 28q6-6 11-1t11-2a11 11 0 0 1-22 3Z" className="fill-type-green" />
        </>
      );
    case 'grids':
      return (
        <>
          <rect x={6} y={9} width={17} height={30} rx={2} className="fill-on-inverse" />
          <rect x={25} y={9} width={17} height={14} rx={2} className="fill-on-inverse" />
          <rect x={25} y={25} width={17} height={14} rx={2} className="fill-on-inverse" />
          <rect x={8} y={11} width={13} height={26} rx={1} className="fill-pastel-sky" />
          <path d="M8 37v-8l6-5 7 6v7Z" className="fill-type-green" />
          <rect x={27} y={11} width={13} height={10} rx={1} className="fill-pastel-butter" />
          <rect x={27} y={27} width={13} height={10} rx={1} className="fill-pastel-pink" />
        </>
      );
    case 'lines':
      return (
        <>
          <path d="M8 34c8-22 18 6 32-20" fill="none" strokeWidth={3.5} strokeLinecap="round" className="stroke-on-inverse" />
          <path d="M8 40h32" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="4 4" className="stroke-on-inverse/70" />
        </>
      );
    case 'icons':
      return <path d="m24 7 5 10.6 11.6 1.5-8.5 8 2.2 11.5L24 33l-10.3 5.6 2.2-11.5-8.5-8 11.6-1.5Z" className="fill-on-inverse" />;
    case 'sticky':
      return (
        <>
          <path d="M9 11a2 2 0 0 1 2-2h26a2 2 0 0 1 2 2v18L29 39H11a2 2 0 0 1-2-2Z" className="fill-pastel-butter" />
          <path d="M29 39v-8a2 2 0 0 1 2-2h8Z" className="fill-type-orange/60" />
          <path d="M14 17h18M14 23h14" strokeWidth={2} strokeLinecap="round" className="stroke-ink/40" />
        </>
      );
  }
}
