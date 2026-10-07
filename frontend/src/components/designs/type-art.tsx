import type { DesignType } from '@/lib/design-types';

/// ภาพประกอบของประเภทงาน (ไทล์ "ใช้บ่อย" "ยอดนิยม" และป๊อปอัปสร้างดีไซน์) แบบ Canva
///
/// วาดเป็น SVG ล้วนด้วยสีจาก token — กระดาษจำลองมีสัดส่วนเท่าผืนผ้าใบจริงของประเภทนั้น
/// แล้วแต่งลายตามกลุ่ม (กราฟสำหรับสไลด์ ดอกไม้สำหรับโปสเตอร์ ตราสำหรับเกียรติบัตร ฯลฯ)

const V = (name: string) => `var(--csmju-${name})`;

export function TypeArt({ type, className }: { type: Pick<DesignType, 'key' | 'width' | 'height' | 'group'>; className?: string }) {
  // กล่องวาด 120 × 90 · กระดาษสูงไม่เกิน 70 กว้างไม่เกิน 92
  const ratio = type.width / type.height;
  const w = ratio >= 92 / 70 ? 92 : 70 * ratio;
  const h = ratio >= 92 / 70 ? 92 / ratio : 70;
  const x = (120 - w) / 2;
  const y = (90 - h) / 2;

  return (
    <svg viewBox="0 0 120 90" aria-hidden className={className} role="presentation">
      {/* เงาและกระดาษ */}
      <rect x={x + 3} y={y + 3} width={w} height={h} rx={3} fill={V('color-border-strong')} opacity={0.6} />
      <rect x={x} y={y} width={w} height={h} rx={3} fill={paperFill(type)} />
      <Decoration type={type} x={x} y={y} w={w} h={h} />
    </svg>
  );
}

function paperFill(type: Pick<DesignType, 'key' | 'group'>): string {
  if (type.key === 'poster' || type.key === 'flyer' || type.key === 'infographic') return V('type-purple');
  if (type.key === 'story' || type.key === 'instagram-post') return V('color-surface');
  if (type.group === 'whiteboard') return V('color-surface');

  return V('color-surface');
}

function Lines({ x, y, w, count, gap = 5, color = V('color-border-strong') }: { x: number; y: number; w: number; count: number; gap?: number; color?: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <rect key={i} x={x} y={y + i * gap} width={i === count - 1 ? w * 0.6 : w} height={2.2} rx={1.1} fill={color} />
      ))}
    </>
  );
}

function Decoration({ type, x, y, w, h }: { type: Pick<DesignType, 'key' | 'group'>; x: number; y: number; w: number; h: number }) {
  const pad = Math.min(w, h) * 0.12;

  switch (type.key) {
    case 'presentation':
    case 'presentation-4x3':
      return (
        <>
          <rect x={x + pad} y={y + pad} width={w * 0.35} height={3} rx={1.5} fill={V('color-border-strong')} />
          <rect x={x + pad} y={y + pad + 6} width={w * 0.22} height={3} rx={1.5} fill={V('color-border-strong')} />
          <path
            d={`M${x + pad} ${y + h - pad} L${x + w * 0.35} ${y + h * 0.62} L${x + w * 0.55} ${y + h * 0.72} L${x + w - pad} ${y + h * 0.38} L${x + w - pad} ${y + h - pad} Z`}
            fill={V('type-orange')}
          />
        </>
      );
    case 'certificate':
      return (
        <>
          <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx={2} fill="none" stroke={V('chart-5')} strokeWidth={1.2} />
          <rect x={x + w * 0.3} y={y + h * 0.25} width={w * 0.4} height={3.5} rx={1.7} fill={V('type-purple')} />
          <Lines x={x + w * 0.25} y={y + h * 0.45} w={w * 0.5} count={2} />
          <circle cx={x + w * 0.5} cy={y + h * 0.78} r={5} fill={V('chart-5')} />
        </>
      );
    case 'business-card':
      return (
        <>
          <rect x={x} y={y} width={w * 0.38} height={h} rx={3} fill={V('type-indigo')} />
          <Lines x={x + w * 0.48} y={y + h * 0.35} w={w * 0.4} count={3} />
        </>
      );
    case 'invitation':
      return (
        <>
          <rect x={x + 4} y={y + 4} width={w - 8} height={h - 8} rx={6} fill={V('type-purple')} />
          <Lines x={x + w * 0.25} y={y + h * 0.42} w={w * 0.5} count={2} color={V('color-surface')} />
        </>
      );
    case 'sticker':
      return <circle cx={x + w / 2} cy={y + h / 2} r={w * 0.42} fill={V('pastel-lilac')} stroke={V('type-purple')} strokeWidth={4} />;
    case 'poster':
    case 'flyer':
      return (
        <>
          <rect x={x + pad} y={y + pad} width={w * 0.45} height={h * 0.32} rx={2} fill={V('pastel-lilac')} />
          <circle cx={x + w * 0.62} cy={y + h * 0.3} r={w * 0.16} fill={V('type-pink')} />
          <Lines x={x + pad} y={y + h * 0.62} w={w - pad * 2} count={3} color={V('pastel-lilac')} />
        </>
      );
    case 'infographic':
      return (
        <>
          <rect x={x + pad} y={y + pad} width={w - pad * 2} height={h * 0.12} rx={2} fill={V('pastel-lilac')} />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={x + pad + i * ((w - pad * 2) / 3)} y={y + h * (0.75 - i * 0.12)} width={(w - pad * 2) / 3 - 2} height={h * (0.15 + i * 0.12)} fill={V('pastel-violet')} />
          ))}
        </>
      );
    case 'resume':
      return (
        <>
          <rect x={x} y={y} width={w * 0.34} height={h} rx={3} fill={V('pastel-lilac')} />
          <circle cx={x + w * 0.17} cy={y + h * 0.16} r={w * 0.09} fill={V('type-purple')} />
          <Lines x={x + w * 0.42} y={y + h * 0.12} w={w * 0.48} count={6} gap={6} />
        </>
      );
    case 'report-cover':
      return (
        <>
          <rect x={x} y={y} width={w} height={h * 0.32} rx={3} fill={V('type-teal')} />
          <rect x={x + w * 0.2} y={y + h * 0.45} width={w * 0.6} height={3.5} rx={1.7} fill={V('color-text')} />
          <Lines x={x + w * 0.3} y={y + h * 0.62} w={w * 0.4} count={3} />
        </>
      );
    case 'document-a4':
      return <Lines x={x + pad} y={y + pad} w={w - pad * 2} count={Math.max(4, Math.floor((h - pad * 2) / 6))} gap={6} />;
    case 'instagram-post':
    case 'social-square':
      return (
        <>
          <rect x={x + 3} y={y + 3} width={w - 6} height={h * 0.62} rx={2} fill={V('type-red')} />
          <circle cx={x + w * 0.5} cy={y + h * 0.33} r={w * 0.14} fill={V('pastel-pink')} />
          <Lines x={x + 4} y={y + h * 0.75} w={w - 8} count={2} />
        </>
      );
    case 'story':
      return (
        <>
          <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={3} fill={V('type-pink')} />
          <circle cx={x + w / 2} cy={y + h * 0.42} r={w * 0.22} fill={V('pastel-pink')} />
          <rect x={x + w * 0.2} y={y + h * 0.78} width={w * 0.6} height={3} rx={1.5} fill={V('color-surface')} />
        </>
      );
    case 'facebook-post':
    case 'youtube-thumbnail':
      return (
        <>
          <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={2} fill={V('type-magenta')} />
          <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) * 0.18} fill={V('color-surface')} />
          <path d={`M${x + w / 2 - 3} ${y + h / 2 - 4.5} L${x + w / 2 + 5} ${y + h / 2} L${x + w / 2 - 3} ${y + h / 2 + 4.5} Z`} fill={V('type-magenta')} />
        </>
      );
    case 'photo-edit':
      return (
        <>
          <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={2} fill={V('pastel-sky')} />
          <circle cx={x + w * 0.7} cy={y + h * 0.3} r={w * 0.08} fill={V('chart-5')} />
          <path d={`M${x + 2} ${y + h - 2} L${x + w * 0.35} ${y + h * 0.45} L${x + w * 0.6} ${y + h * 0.75} L${x + w * 0.75} ${y + h * 0.6} L${x + w - 2} ${y + h - 2} Z`} fill={V('type-teal')} />
        </>
      );
    case 'whiteboard':
      return (
        <>
          <rect x={x} y={y} width={w} height={h * 0.16} rx={3} fill={V('type-green')} />
          <rect x={x + w * 0.1} y={y + h * 0.32} width={w * 0.22} height={h * 0.3} rx={2} fill={V('pastel-mint')} />
          <rect x={x + w * 0.4} y={y + h * 0.4} width={w * 0.22} height={h * 0.3} rx={2} fill={V('pastel-butter')} />
          <rect x={x + w * 0.7} y={y + h * 0.3} width={w * 0.2} height={h * 0.3} rx={2} fill={V('pastel-sky')} />
        </>
      );
    default:
      return <Lines x={x + pad} y={y + pad} w={w - pad * 2} count={3} />;
  }
}
