import type { Rect } from './geometry';

/// เส้น guide ที่วาดเมื่อ snap ติด (พิกัดหน้า)
export interface Guide {
  axis: 'x' | 'y';
  /// ตำแหน่งของเส้น
  at: number;
  /// ช่วงที่เส้นพาด (จากกล่องที่ขยับถึงเป้าหมาย)
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

/// จุดที่ใช้ snap ของกล่อง: ขอบซ้าย/กลาง/ขวา และขอบบน/กลาง/ล่าง
function stops(rect: Rect) {
  return {
    x: [rect.x, rect.x + rect.width / 2, rect.x + rect.width],
    y: [rect.y, rect.y + rect.height / 2, rect.y + rect.height],
  };
}

/// หาระยะที่ต้องเลื่อนเพิ่มให้กล่องที่กำลังลากชิดขอบหน้า กึ่งกลางหน้า หรือ element อื่น
///
/// `threshold` เป็นพิกเซลของหน้า (คิดจากระยะบนจอหารด้วยซูมแล้ว)
/// แต่ละแกน snap กับเป้าที่ใกล้ที่สุดเพียงจุดเดียว
export function snapRect(moving: Rect, targets: Rect[], page: Rect, threshold: number): SnapResult {
  const own = stops(moving);
  const candidates = [page, ...targets];

  let best = { x: { delta: 0, dist: threshold + 1, at: 0 }, y: { delta: 0, dist: threshold + 1, at: 0 } };

  for (const target of candidates) {
    const t = stops(target);

    for (const axis of ['x', 'y'] as const) {
      for (const a of own[axis]) {
        for (const b of t[axis]) {
          const dist = Math.abs(b - a);

          if (dist < best[axis].dist) {
            best = { ...best, [axis]: { delta: b - a, dist, at: b } };
          }
        }
      }
    }
  }

  const dx = best.x.dist <= threshold ? best.x.delta : 0;
  const dy = best.y.dist <= threshold ? best.y.delta : 0;
  const snapped = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];

  if (best.x.dist <= threshold) {
    guides.push(guideFor('x', best.x.at, snapped, candidates));
  }

  if (best.y.dist <= threshold) {
    guides.push(guideFor('y', best.y.at, snapped, candidates));
  }

  return { dx, dy, guides };
}

function guideFor(axis: 'x' | 'y', at: number, moving: Rect, candidates: Rect[]): Guide {
  // เส้นพาดครอบทุกกล่องที่มีจุดตรงตำแหน่งนี้ เพื่อให้เห็นว่าชิดกับอะไร
  const aligned = candidates.filter((rect) => stops(rect)[axis].some((value) => Math.abs(value - at) < 0.5));
  const spans = [moving, ...aligned].map((rect) =>
    axis === 'x' ? [rect.y, rect.y + rect.height] : [rect.x, rect.x + rect.width],
  );

  return {
    axis,
    at,
    from: Math.min(...spans.map((s) => s[0])),
    to: Math.max(...spans.map((s) => s[1])),
  };
}
