/// ลบพื้นหลังแบบอัจฉริยะ — แยก "วัตถุ" ออกจากพื้นหลังด้วย GrabCut (Rother, Kolmogorov, Blake 2004)
///
/// ไม่ใช้ AI/โมเดลจากภายนอกและไม่ส่งรูปออกนอกเครื่อง (ARC-02 · ข้อมูลผู้ใช้ไม่ออกนอกระบบ) — ทุกขั้นเขียนเองในไฟล์นี้:
///
///   1. เริ่มต้น: เดาพื้นหลังจากสีที่ขอบรูป (หรือกรอบที่ผู้ใช้ลาก) · พิกเซลที่สีต่างจากพื้นหลังมากเป็น "น่าจะวัตถุ"
///   2. โมเดลสีวัตถุ/พื้นหลังอย่างละ 5 กลุ่ม (Gaussian Mixture ใน RGB)
///   3. ตัดภาพด้วย min-cut ของกราฟพิกเซล 8 ทิศ (Boykov–Kolmogorov max-flow) — คิดทั้งสีและความต่อเนื่องของขอบ
///   4. วนข้อ 2–3 สี่รอบ · แปรง "เก็บ"/"ลบ" ของผู้ใช้เป็นข้อบังคับที่ห้ามตัดผิด
///   5. แยกวัตถุเป็นชิ้น (connected components) ให้ผู้ใช้เลือกเก็บ/ตัดทีละชิ้น · อุดรูเล็ก ๆ ในเนื้อวัตถุ
///   6. ขยายกลับขนาดจริงด้วย guided filter (He, Sun, Tang 2010) ให้ขอบตามเส้นในรูปจริงระดับพิกเซล
///      แล้วล้างสีพื้นหลังที่ติดขอบโปร่งแสงด้วยสีพื้นหลังเฉพาะจุด
///
/// คำนวณบนรูปย่อ (ด้านยาว ≤ WORK_MAX) จึงใช้เวลาราววินาทีเดียว แล้วค่อยขยายหน้ากากด้วยข้อ 6

export const WORK_MAX = 320;

export interface CutoutPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/// พิกัดทั้งหมดเป็นสัดส่วน 0–1 ของรูป — ใช้ได้ทั้งรูปย่อ ตัวอย่าง และรูปจริง
export interface CutoutStroke {
  mode: 'keep' | 'remove';
  /// รัศมีแปรงเป็นสัดส่วนของด้านกว้างของรูป
  radius: number;
  points: { x: number; y: number }[];
}

export interface CutoutHints {
  rect: { x0: number; y0: number; x1: number; y1: number } | null;
  strokes: CutoutStroke[];
}

export interface CutoutObject {
  id: number;
  /// สัดส่วนพื้นที่เทียบทั้งรูป
  area: number;
  /// กรอบของวัตถุ (สัดส่วน 0–1)
  box: { x0: number; y0: number; x1: number; y1: number };
}

export interface CutoutResult {
  width: number;
  height: number;
  /// 1 = วัตถุ · 0 = พื้นหลัง (ก่อนตัดชิ้นที่ผู้ใช้ไม่เอา)
  mask: Uint8Array;
  /// เลขชิ้นวัตถุของแต่ละพิกเซล (-1 = พื้นหลัง) · ตรงกับ `objects[].id`
  labels: Int32Array;
  objects: CutoutObject[];
}

export const EMPTY_HINTS: CutoutHints = { rect: null, strokes: [] };

/// ค่าในแผนที่เริ่มต้น (trimap)
const BG = 0;
const FG = 1;
const PR_BG = 2;
const PR_FG = 3;

const GAMMA = 50;
const HARD = 1e9;
const ITERATIONS = 4;
const COMPONENTS = 5;
/// ชิ้นที่เล็กกว่านี้ (สัดส่วนของรูป) ถือเป็นเศษ — ตัดทิ้ง/อุดรู
const SPECK = 0.002;

// ───────────────────────────── Gaussian Mixture Model ─────────────────────────────

class Gmm {
  readonly weight = new Float64Array(COMPONENTS);
  readonly mean = new Float64Array(COMPONENTS * 3);
  readonly inverse = new Float64Array(COMPONENTS * 9);
  readonly norm = new Float64Array(COMPONENTS);

  /// เรียนรู้จากพิกเซลที่ถูกจัดกลุ่มแล้ว (`assign[i]` = กลุ่ม · -1 = ไม่ใช่ของโมเดลนี้)
  learn(rgb: Float64Array, assign: Int8Array): void {
    const sum = new Float64Array(COMPONENTS * 3);
    const prod = new Float64Array(COMPONENTS * 9);
    const count = new Float64Array(COMPONENTS);
    let total = 0;

    for (let i = 0; i < assign.length; i++) {
      const k = assign[i];

      if (k < 0) continue;

      const r = rgb[i * 3];
      const g = rgb[i * 3 + 1];
      const b = rgb[i * 3 + 2];

      count[k]++;
      total++;
      sum[k * 3] += r;
      sum[k * 3 + 1] += g;
      sum[k * 3 + 2] += b;

      const o = k * 9;

      prod[o] += r * r;
      prod[o + 1] += r * g;
      prod[o + 2] += r * b;
      prod[o + 4] += g * g;
      prod[o + 5] += g * b;
      prod[o + 8] += b * b;
    }

    for (let k = 0; k < COMPONENTS; k++) {
      const n = count[k];

      if (n === 0 || total === 0) {
        this.weight[k] = 0;
        continue;
      }

      this.weight[k] = n / total;

      const mr = sum[k * 3] / n;
      const mg = sum[k * 3 + 1] / n;
      const mb = sum[k * 3 + 2] / n;

      this.mean[k * 3] = mr;
      this.mean[k * 3 + 1] = mg;
      this.mean[k * 3 + 2] = mb;

      const o = k * 9;
      // ความแปรปรวนขั้นต่ำกันเมทริกซ์เอกฐาน (กลุ่มที่สีเดียวเป๊ะ เช่นพื้นขาวล้วน)
      const c00 = prod[o] / n - mr * mr + 1;
      const c01 = prod[o + 1] / n - mr * mg;
      const c02 = prod[o + 2] / n - mr * mb;
      const c11 = prod[o + 4] / n - mg * mg + 1;
      const c12 = prod[o + 5] / n - mg * mb;
      const c22 = prod[o + 8] / n - mb * mb + 1;
      const det =
        c00 * (c11 * c22 - c12 * c12) - c01 * (c01 * c22 - c12 * c02) + c02 * (c01 * c12 - c11 * c02);
      const safe = det > 1e-9 ? det : 1e-9;

      this.inverse[o] = (c11 * c22 - c12 * c12) / safe;
      this.inverse[o + 1] = (c02 * c12 - c01 * c22) / safe;
      this.inverse[o + 2] = (c01 * c12 - c02 * c11) / safe;
      this.inverse[o + 3] = this.inverse[o + 1];
      this.inverse[o + 4] = (c00 * c22 - c02 * c02) / safe;
      this.inverse[o + 5] = (c02 * c01 - c00 * c12) / safe;
      this.inverse[o + 6] = this.inverse[o + 2];
      this.inverse[o + 7] = this.inverse[o + 5];
      this.inverse[o + 8] = (c00 * c11 - c01 * c01) / safe;
      this.norm[k] = 1 / Math.sqrt(safe);
    }
  }

  /// ความน่าจะเป็นของสีในกลุ่ม k (ไม่รวมค่าคงที่ 2π ที่ตัดกันเองตอนเทียบ)
  component(k: number, r: number, g: number, b: number): number {
    if (this.weight[k] === 0) return 0;

    const dr = r - this.mean[k * 3];
    const dg = g - this.mean[k * 3 + 1];
    const db = b - this.mean[k * 3 + 2];
    const o = k * 9;
    const m = this.inverse;
    const q =
      dr * (dr * m[o] + dg * m[o + 3] + db * m[o + 6]) +
      dg * (dr * m[o + 1] + dg * m[o + 4] + db * m[o + 7]) +
      db * (dr * m[o + 2] + dg * m[o + 5] + db * m[o + 8]);

    return this.norm[k] * Math.exp(-0.5 * q);
  }

  /// -log ความน่าจะเป็นของสี (ค่ามาก = สีนี้ไม่น่าจะเป็นของโมเดลนี้)
  cost(r: number, g: number, b: number): number {
    let p = 0;

    for (let k = 0; k < COMPONENTS; k++) p += this.weight[k] * this.component(k, r, g, b);

    return -Math.log(p + 1e-300);
  }

  best(r: number, g: number, b: number): number {
    let best = 0;
    let bestP = -1;

    for (let k = 0; k < COMPONENTS; k++) {
      const p = this.component(k, r, g, b);

      if (p > bestP) {
        bestP = p;
        best = k;
      }
    }

    return best;
  }
}

/// จัดกลุ่มเริ่มต้นด้วย k-means (เริ่มจากจุดที่ห่างกันที่สุด — ผลเหมือนเดิมทุกครั้ง ไม่สุ่ม)
function kmeansAssign(rgb: Float64Array, members: number[], assign: Int8Array): void {
  if (members.length === 0) return;

  const step = Math.max(1, Math.floor(members.length / 4000));
  const sample = members.filter((_, index) => index % step === 0);
  const centers: number[][] = [];
  const first = sample[0];

  centers.push([rgb[first * 3], rgb[first * 3 + 1], rgb[first * 3 + 2]]);

  const dist2 = (i: number, c: number[]) =>
    (rgb[i * 3] - c[0]) ** 2 + (rgb[i * 3 + 1] - c[1]) ** 2 + (rgb[i * 3 + 2] - c[2]) ** 2;

  while (centers.length < COMPONENTS) {
    let far = sample[0];
    let farD = -1;

    for (const i of sample) {
      let d = Infinity;

      for (const c of centers) d = Math.min(d, dist2(i, c));
      if (d > farD) {
        farD = d;
        far = i;
      }
    }

    centers.push([rgb[far * 3], rgb[far * 3 + 1], rgb[far * 3 + 2]]);
  }

  const nearest = (i: number) => {
    let best = 0;
    let bestD = Infinity;

    for (let k = 0; k < centers.length; k++) {
      const d = dist2(i, centers[k]);

      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }

    return best;
  };

  for (let round = 0; round < 6; round++) {
    const acc = centers.map(() => [0, 0, 0, 0]);

    for (const i of sample) {
      const k = nearest(i);

      acc[k][0] += rgb[i * 3];
      acc[k][1] += rgb[i * 3 + 1];
      acc[k][2] += rgb[i * 3 + 2];
      acc[k][3]++;
    }

    acc.forEach((a, k) => {
      if (a[3] > 0) centers[k] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
    });
  }

  for (const i of members) assign[i] = nearest(i);
}

// ───────────────────────────── กราฟและ max-flow ─────────────────────────────

/// ทิศ 0–3 เป็นทิศ "ไปข้างหน้า" ที่เก็บความจุ · 4–7 เป็นทิศกลับของ 0–3 ตามลำดับ
const DX = [1, 0, 1, -1, -1, 0, -1, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

const NONE = -1;
const TERMINAL = -2;
const ORPHAN = -3;
const FREE = 0;
const SOURCE = 1;
const SINK = 2;

/// Boykov–Kolmogorov max-flow บนกริด 8 ทิศ (ตามโค้ด maxflow-v3 ของ Kolmogorov แบบย่อ)
/// คืน true ที่พิกเซลฝั่ง source (= วัตถุ)
export function gridMinCut(
  width: number,
  height: number,
  terminal: Float64Array,
  forward: Float64Array,
  backward: Float64Array,
): Uint8Array {
  const n = width * height;
  const tree = new Uint8Array(n);
  const parent = new Int8Array(n).fill(NONE);
  const ts = new Int32Array(n);
  const dist = new Int32Array(n);
  const active = new Int32Array(n * 2 + 8);
  const inQueue = new Uint8Array(n);
  let head = 0;
  let tail = 0;
  const cap = active.length;
  // คิวโหนดกำพร้า (ใช้ตัวชี้หัวคิวแทน shift() ที่ช้าเมื่อคิวยาว)
  let orphans: number[] = [];
  let orphanHead = 0;
  let time = 0;

  const neighbor = (p: number, d: number): number => {
    const x = (p % width) + DX[d];
    const y = ((p / width) | 0) + DY[d];

    return x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x;
  };

  // ความจุคงเหลือจาก p ไปเพื่อนบ้านทิศ d (q คือเพื่อนบ้านนั้น)
  const residual = (p: number, d: number, q: number): number =>
    d < 4 ? forward[d * n + p] : backward[(d - 4) * n + q];
  const addResidual = (p: number, d: number, q: number, delta: number): void => {
    if (d < 4) forward[d * n + p] += delta;
    else backward[(d - 4) * n + q] += delta;
  };
  // ฝั่งกลับ: จาก q มา p (q อยู่ทิศ d ของ p) = จาก q ไปทิศตรงข้าม
  const residualBack = (p: number, d: number, q: number): number => residual(q, (d + 4) % 8, p);
  const addResidualBack = (p: number, d: number, q: number, delta: number): void =>
    addResidual(q, (d + 4) % 8, p, delta);

  const push = (p: number) => {
    if (inQueue[p]) return;
    inQueue[p] = 1;
    active[tail] = p;
    tail = (tail + 1) % cap;
  };

  for (let p = 0; p < n; p++) {
    if (terminal[p] > 0) {
      tree[p] = SOURCE;
      parent[p] = TERMINAL;
      dist[p] = 1;
      push(p);
    } else if (terminal[p] < 0) {
      tree[p] = SINK;
      parent[p] = TERMINAL;
      dist[p] = 1;
      push(p);
    }
  }

  const parentOf = (p: number): number => neighbor(p, parent[p]);

  for (;;) {
    // ── โต: หาเส้นทาง source → sink ──
    let from = -1;
    let to = -1;
    let via = -1;

    while (head !== tail) {
      const p = active[head];

      if (parent[p] === NONE) {
        inQueue[p] = 0;
        head = (head + 1) % cap;
        continue;
      }

      for (let d = 0; d < 8; d++) {
        const q = neighbor(p, d);

        if (q < 0) continue;

        if (tree[p] === SOURCE) {
          if (residual(p, d, q) <= 0) continue;

          if (parent[q] === NONE) {
            tree[q] = SOURCE;
            parent[q] = (d + 4) % 8;
            ts[q] = ts[p];
            dist[q] = dist[p] + 1;
            push(q);
          } else if (tree[q] === SINK) {
            from = p;
            to = q;
            via = d;
            break;
          } else if (ts[q] <= ts[p] && dist[q] > dist[p]) {
            parent[q] = (d + 4) % 8;
            ts[q] = ts[p];
            dist[q] = dist[p] + 1;
          }
        } else {
          if (residualBack(p, d, q) <= 0) continue;

          if (parent[q] === NONE) {
            tree[q] = SINK;
            parent[q] = (d + 4) % 8;
            ts[q] = ts[p];
            dist[q] = dist[p] + 1;
            push(q);
          } else if (tree[q] === SOURCE) {
            from = q;
            to = p;
            via = (d + 4) % 8;
            break;
          } else if (ts[q] <= ts[p] && dist[q] > dist[p]) {
            parent[q] = (d + 4) % 8;
            ts[q] = ts[p];
            dist[q] = dist[p] + 1;
          }
        }
      }

      if (from >= 0) break;

      inQueue[p] = 0;
      head = (head + 1) % cap;
    }

    if (from < 0) break;

    // ── เพิ่มการไหลตามเส้นทาง ──
    time++;

    let bottleneck = residual(from, via, to);

    for (let p = from; parent[p] !== TERMINAL; ) {
      const d = parent[p];
      const up = neighbor(p, d);

      bottleneck = Math.min(bottleneck, residualBack(p, d, up));
      p = up;
      if (parent[p] === TERMINAL) bottleneck = Math.min(bottleneck, terminal[p]);
    }
    if (parent[from] === TERMINAL) bottleneck = Math.min(bottleneck, terminal[from]);

    for (let p = to; parent[p] !== TERMINAL; ) {
      const d = parent[p];
      const up = neighbor(p, d);

      bottleneck = Math.min(bottleneck, residual(p, d, up));
      p = up;
      if (parent[p] === TERMINAL) bottleneck = Math.min(bottleneck, -terminal[p]);
    }
    if (parent[to] === TERMINAL) bottleneck = Math.min(bottleneck, -terminal[to]);

    addResidual(from, via, to, -bottleneck);
    addResidualBack(from, via, to, bottleneck);

    for (let p = from; ; ) {
      if (parent[p] === TERMINAL) {
        terminal[p] -= bottleneck;
        if (terminal[p] <= 0) {
          parent[p] = ORPHAN;
          orphans.push(p);
        }
        break;
      }

      const d = parent[p];
      const up = neighbor(p, d);

      addResidualBack(p, d, up, -bottleneck);
      addResidual(p, d, up, bottleneck);
      if (residualBack(p, d, up) <= 0) {
        parent[p] = ORPHAN;
        orphans.push(p);
      }
      p = up;
    }

    for (let p = to; ; ) {
      if (parent[p] === TERMINAL) {
        terminal[p] += bottleneck;
        if (terminal[p] >= 0) {
          parent[p] = ORPHAN;
          orphans.push(p);
        }
        break;
      }

      const d = parent[p];
      const up = neighbor(p, d);

      addResidual(p, d, up, -bottleneck);
      addResidualBack(p, d, up, bottleneck);
      if (residual(p, d, up) <= 0) {
        parent[p] = ORPHAN;
        orphans.push(p);
      }
      p = up;
    }

    // ── รับเลี้ยงโหนดกำพร้า ──
    while (orphanHead < orphans.length) {
      const p = orphans[orphanHead++];
      const side = tree[p];
      let bestDir = -1;
      let bestDist = Infinity;

      for (let d = 0; d < 8; d++) {
        const q = neighbor(p, d);

        if (q < 0 || tree[q] !== side || parent[q] === NONE) continue;

        const open = side === SOURCE ? residualBack(p, d, q) > 0 : residual(p, d, q) > 0;

        if (!open) continue;

        // ไล่ขึ้นไปหา terminal (จำผลด้วย ts/dist ไม่ต้องไล่ซ้ำ)
        let k = q;
        let depth = 0;
        let ok = true;

        for (;;) {
          if (ts[k] === time) {
            depth += dist[k];
            break;
          }

          const a = parent[k];

          depth++;
          if (a === TERMINAL) {
            ts[k] = time;
            dist[k] = 1;
            break;
          }
          if (a === ORPHAN || a === NONE) {
            ok = false;
            break;
          }
          k = parentOf(k);
        }

        if (!ok) continue;

        if (depth < bestDist) {
          bestDist = depth;
          bestDir = d;
        }

        for (let m = q; ts[m] !== time; m = parentOf(m)) {
          ts[m] = time;
          dist[m] = depth;
          depth--;
        }
      }

      if (bestDir >= 0) {
        parent[p] = bestDir;
        ts[p] = time;
        dist[p] = bestDist + 1;
        continue;
      }

      // ไม่มีพ่อแม่ใหม่ → กลายเป็นโหนดอิสระ · ลูก ๆ กำพร้าตาม · เพื่อนบ้านที่ยังต่อได้กลับมาโต
      tree[p] = FREE;
      parent[p] = NONE;

      for (let d = 0; d < 8; d++) {
        const q = neighbor(p, d);

        if (q < 0 || tree[q] !== side || parent[q] === NONE) continue;

        const open = side === SOURCE ? residualBack(p, d, q) > 0 : residual(p, d, q) > 0;

        if (open) push(q);
        if (parent[q] !== TERMINAL && parent[q] !== ORPHAN && parentOf(q) === p) {
          parent[q] = ORPHAN;
          orphans.push(q);
        }
      }
    }

    orphans = [];
    orphanHead = 0;
  }

  const result = new Uint8Array(n);

  for (let p = 0; p < n; p++) result[p] = tree[p] === SOURCE && parent[p] !== NONE ? 1 : 0;

  return result;
}

// ───────────────────────────── GrabCut ─────────────────────────────

/// ทาแปรงของผู้ใช้ลงแผนที่ · คืนว่าพิกเซลไหนถูกทา (ไม่เอาไปสอนโมเดลสี — ทาลบทับวัตถุสีแดงบางส่วน
/// ต้องลบแค่ที่ทา ไม่ใช่สอนให้ "สีแดงทั้งรูปเป็นพื้นหลัง")
function paintStrokes(trimap: Uint8Array, width: number, height: number, strokes: readonly CutoutStroke[]): Uint8Array {
  const painted = new Uint8Array(width * height);

  for (const stroke of strokes) {
    const r = Math.max(1, stroke.radius * width);
    const value = stroke.mode === 'keep' ? FG : BG;
    const points = stroke.points;

    for (let s = 0; s < points.length; s++) {
      const a = points[s];
      const b = points[Math.min(points.length - 1, s + 1)];
      const ax = a.x * width;
      const ay = a.y * height;
      const bx = b.x * width;
      const by = b.y * height;
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(1, r / 2)));

      for (let t = 0; t <= steps; t++) {
        const cx = ax + ((bx - ax) * t) / steps;
        const cy = ay + ((by - ay) * t) / steps;

        for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(height - 1, Math.ceil(cy + r)); y++) {
          for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(width - 1, Math.ceil(cx + r)); x++) {
            if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
              trimap[y * width + x] = value;
              painted[y * width + x] = 1;
            }
          }
        }
      }
    }
  }

  return painted;
}

/// ระยะ "ขอบรวม" ที่ต้องข้ามก่อนนับเป็นวัตถุ (หน่วยความต่างสี RGB หลังหักสัญญาณรบกวน)
const GEODESIC_EDGE = 18;

/// ระยะทางสั้นสุดจากจุดเริ่ม โดยแต่ละก้าวเสีย "ความต่างสีที่เกินระดับสัญญาณรบกวน" (Dijkstra บนกริด 8 ทิศ)
///
/// พื้นที่สีไล่เฉดหรือมีเกรนเสียแทบศูนย์ · การข้ามขอบวัตถุที่ชัดเสียมาก — ใช้แยก "ฉาก" ออกจาก "ของ"
export function geodesicFromSeeds(rgb: Float64Array, width: number, height: number, seeds: readonly number[]): Float32Array {
  const n = width * height;
  const step = (p: number, q: number) =>
    Math.sqrt((rgb[p * 3] - rgb[q * 3]) ** 2 + (rgb[p * 3 + 1] - rgb[q * 3 + 1]) ** 2 + (rgb[p * 3 + 2] - rgb[q * 3 + 2]) ** 2);

  // ระดับสัญญาณรบกวน = ความต่างของพิกเซลติดกันที่พบบ่อย (มัธยฐาน) — ไม่ขึ้นกับว่าเป็นรูปเกรนมากหรือน้อย
  const sample: number[] = [];
  const stride = Math.max(1, Math.floor(n / 20000));

  for (let p = 0; p < n - 1; p += stride) if ((p + 1) % width !== 0) sample.push(step(p, p + 1));
  sample.sort((a, b) => a - b);

  // ฉากไล่เฉดชัน ๆ (พื้นโต๊ะใต้ไฟ) เปลี่ยนทีละ 2–4 ระดับต่อพิกเซลตลอดแนว — ใช้ระดับที่ 70% ของภาพเป็นเพดานด้วย
  const noise = Math.max((sample[Math.floor(sample.length / 2)] ?? 0) * 1.5 + 1, sample[Math.floor(sample.length * 0.7)] ?? 0);
  const dist = new Float32Array(n).fill(Infinity);
  // binary heap ของ (ระยะ, พิกเซล)
  const heapDist = new Float32Array(n * 8 + seeds.length + 8);
  const heapNode = new Int32Array(heapDist.length);
  let size = 0;

  const push = (d: number, p: number) => {
    let i = size++;

    while (i > 0) {
      const up = (i - 1) >> 1;

      if (heapDist[up] <= d) break;
      heapDist[i] = heapDist[up];
      heapNode[i] = heapNode[up];
      i = up;
    }
    heapDist[i] = d;
    heapNode[i] = p;
  };

  const pop = (): number => {
    const top = heapNode[0];
    const lastD = heapDist[--size];
    const lastN = heapNode[size];
    let i = 0;

    for (;;) {
      let child = i * 2 + 1;

      if (child >= size) break;
      if (child + 1 < size && heapDist[child + 1] < heapDist[child]) child++;
      if (heapDist[child] >= lastD) break;
      heapDist[i] = heapDist[child];
      heapNode[i] = heapNode[child];
      i = child;
    }
    heapDist[i] = lastD;
    heapNode[i] = lastN;

    return top;
  };

  for (const s of seeds) {
    dist[s] = 0;
    push(0, s);
  }

  const done = new Uint8Array(n);

  while (size > 0) {
    const p = pop();

    if (done[p]) continue;
    done[p] = 1;

    const x = p % width;
    const y = (p / width) | 0;

    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];

      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

      const q = ny * width + nx;

      if (done[q]) continue;

      const next = dist[p] + Math.max(0, step(p, q) - noise);

      if (next < dist[q]) {
        dist[q] = next;
        if (size < heapDist.length) push(next, q);
      }
    }
  }

  return dist;
}

/// แผนที่เริ่มต้น: กรอบของผู้ใช้ (นอกกรอบ = พื้นหลังแน่นอน) หรือเดาจากสีที่ขอบรูป
function initialTrimap(
  rgb: Float64Array,
  width: number,
  height: number,
  hints: CutoutHints,
): { trimap: Uint8Array; painted: Uint8Array } {
  const n = width * height;
  const trimap = new Uint8Array(n);

  if (hints.rect) {
    const x0 = Math.floor(Math.min(hints.rect.x0, hints.rect.x1) * width);
    const x1 = Math.ceil(Math.max(hints.rect.x0, hints.rect.x1) * width);
    const y0 = Math.floor(Math.min(hints.rect.y0, hints.rect.y1) * height);
    const y1 = Math.ceil(Math.max(hints.rect.y0, hints.rect.y1) * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) trimap[y * width + x] = x >= x0 && x < x1 && y >= y0 && y < y1 ? PR_FG : BG;
    }
  } else {
    // สีพื้นหลัง = กลุ่มสีที่ขอบรูปซึ่งพบ "อย่างน้อยสองด้าน" — ตัวแบบที่ล้นขอบด้านเดียว (คนครึ่งตัว
    // ที่ตัวยาวถึงขอบล่าง) ไม่ถูกนับเป็นพื้นหลัง จึงไม่ถูกตัดตรงขอบรูป
    const band = Math.max(2, Math.round(Math.min(width, height) * 0.03));
    const border: number[] = [];
    const side = new Int8Array(n).fill(-1);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = y < band ? 0 : y >= height - band ? 1 : x < band ? 2 : x >= width - band ? 3 : -1;

        if (s >= 0) {
          border.push(y * width + x);
          side[y * width + x] = s;
        }
      }
    }

    const cluster = new Int8Array(n).fill(-1);

    kmeansAssign(rgb, border, cluster);

    // รวมกลุ่มสีที่ใกล้กันเป็นก้อนเดียว — ฉากไล่เฉดถูก k-means หั่นเป็นหลายกลุ่ม แต่ยังเป็นฉากเดียวกัน
    const mean = Array.from({ length: COMPONENTS }, () => [0, 0, 0, 0]);

    for (const i of border) {
      const m = mean[cluster[i]];

      m[0] += rgb[i * 3];
      m[1] += rgb[i * 3 + 1];
      m[2] += rgb[i * 3 + 2];
      m[3]++;
    }

    const group = Array.from({ length: COMPONENTS }, (_, k) => k);
    const root = (k: number): number => (group[k] === k ? k : (group[k] = root(group[k])));

    for (let a = 0; a < COMPONENTS; a++) {
      for (let b = a + 1; b < COMPONENTS; b++) {
        const ma = mean[a];
        const mb = mean[b];

        if (!ma[3] || !mb[3]) continue;

        const gap = Math.hypot(ma[0] / ma[3] - mb[0] / mb[3], ma[1] / ma[3] - mb[1] / mb[3], ma[2] / ma[3] - mb[2] / mb[3]);

        if (gap < 45) group[root(a)] = root(b);
      }
    }

    const perSide = Array.from({ length: COMPONENTS }, () => [0, 0, 0, 0]);
    const sideTotal = [0, 0, 0, 0];
    const clusterTotal = new Array<number>(COMPONENTS).fill(0);

    for (const i of border) {
      perSide[root(cluster[i])][side[i]]++;
      sideTotal[side[i]]++;
      clusterTotal[root(cluster[i])]++;
    }

    // พื้นหลัง = ครองอย่างน้อยสองด้าน หรือคลุมด้านใดด้านหนึ่งเกือบทั้งแนว (พื้นโต๊ะ/พื้นห้องที่ขอบล่าง)
    const groupBackground = perSide.map(
      (counts) =>
        counts.filter((c, s) => sideTotal[s] > 0 && c / sideTotal[s] >= 0.35).length >= 2 ||
        counts.some((c, s) => sideTotal[s] > 0 && c / sideTotal[s] >= 0.85),
    );
    let background = group.map((_, k) => groupBackground[root(k)]);

    if (!background.some(Boolean)) {
      // ขอบรกมาก (ไม่มีสีไหนครองสองด้าน) — ใช้กลุ่มที่ใหญ่ ≥ 30% ของขอบ ไม่มีอีกก็ใช้ทั้งขอบ
      background = group.map((_, k) => clusterTotal[root(k)] / border.length >= 0.3);
      if (!background.some(Boolean)) background = background.map(() => true);
    }

    const assign = new Int8Array(n).fill(-1);
    const backgroundBorder: number[] = [];

    for (const i of border) {
      if (background[cluster[i]]) {
        assign[i] = cluster[i];
        backgroundBorder.push(i);
      }
    }

    // ไล่จากขอบที่เป็นพื้นหลังเข้าไปตามทางที่สีเปลี่ยนนุ่ม ๆ (geodesic) — ฉากสตูดิโอที่ไล่เฉดจากเทาเข้มถึงขาว
    // ทั้งฉากจึงนับเป็นพื้นหลัง ส่วนวัตถุที่มีขอบชัดคั่นอยู่ไปถึงไม่ได้ = น่าจะเป็นวัตถุ
    const reach = geodesicFromSeeds(rgb, width, height, backgroundBorder);

    for (let i = 0; i < n; i++) {
      if (assign[i] >= 0) trimap[i] = BG;
      else trimap[i] = reach[i] > GEODESIC_EDGE ? PR_FG : PR_BG;
    }
  }

  const painted = paintStrokes(trimap, width, height, hints.strokes);

  return { trimap, painted };
}

/// ตัดวัตถุออกจากพื้นหลัง (รูปที่ส่งมาควรย่อไว้แล้ว ด้านยาว ≤ WORK_MAX)
export function grabCut(pixels: CutoutPixels, hints: CutoutHints = EMPTY_HINTS): CutoutResult {
  const { width, height, data } = pixels;
  const n = width * height;
  const rgb = new Float64Array(n * 3);

  for (let i = 0; i < n; i++) {
    // พิกเซลโปร่งใสอยู่แล้ว (PNG) ถือเป็นสีขาว — ไม่ให้สีดำที่ซ่อนอยู่ใต้ช่องโปร่งหลอกโมเดล
    const a = data[i * 4 + 3] / 255;

    rgb[i * 3] = data[i * 4] * a + 255 * (1 - a);
    rgb[i * 3 + 1] = data[i * 4 + 1] * a + 255 * (1 - a);
    rgb[i * 3 + 2] = data[i * 4 + 2] * a + 255 * (1 - a);
  }

  const { trimap, painted } = initialTrimap(rgb, width, height, hints);

  // พิกเซลที่โปร่งใสในรูปต้นฉบับเป็นพื้นหลังแน่นอน
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 16) trimap[i] = BG;

  // น้ำหนักความต่อเนื่องของขอบ (n-link) — คำนวณครั้งเดียว ใช้ทุกรอบ
  let diffSum = 0;
  let diffCount = 0;

  for (let p = 0; p < n; p++) {
    for (let d = 0; d < 4; d++) {
      const x = (p % width) + DX[d];
      const y = ((p / width) | 0) + DY[d];

      if (x < 0 || y < 0 || x >= width || y >= height) continue;

      const q = y * width + x;

      diffSum +=
        (rgb[p * 3] - rgb[q * 3]) ** 2 + (rgb[p * 3 + 1] - rgb[q * 3 + 1]) ** 2 + (rgb[p * 3 + 2] - rgb[q * 3 + 2]) ** 2;
      diffCount++;
    }
  }

  const beta = diffSum > 0 ? 1 / ((2 * diffSum) / diffCount) : 0;
  const links = new Float64Array(n * 4);

  for (let p = 0; p < n; p++) {
    for (let d = 0; d < 4; d++) {
      const x = (p % width) + DX[d];
      const y = ((p / width) | 0) + DY[d];

      if (x < 0 || y < 0 || x >= width || y >= height) continue;

      const q = y * width + x;
      const diff =
        (rgb[p * 3] - rgb[q * 3]) ** 2 + (rgb[p * 3 + 1] - rgb[q * 3 + 1]) ** 2 + (rgb[p * 3 + 2] - rgb[q * 3 + 2]) ** 2;

      links[d * n + p] = (GAMMA * Math.exp(-beta * diff)) / (d < 2 ? 1 : Math.SQRT2);
    }
  }

  const fgModel = new Gmm();
  const bgModel = new Gmm();
  const fgAssign = new Int8Array(n);
  const bgAssign = new Int8Array(n);
  let segment: Uint8Array = new Uint8Array(n);

  for (let i = 0; i < n; i++) segment[i] = trimap[i] === FG || trimap[i] === PR_FG ? 1 : 0;

  for (let round = 0; round < ITERATIONS; round++) {
    fgAssign.fill(-1);
    bgAssign.fill(-1);

    if (round === 0) {
      const fgMembers: number[] = [];
      const bgMembers: number[] = [];

      for (let i = 0; i < n; i++) if (!painted[i]) (segment[i] ? fgMembers : bgMembers).push(i);
      // ทาแปรงทั้งหมดจนไม่เหลือส่วนอื่นให้สอน — ใช้ส่วนที่ทาแทน
      if (fgMembers.length === 0) for (let i = 0; i < n; i++) if (segment[i]) fgMembers.push(i);
      if (bgMembers.length === 0) for (let i = 0; i < n; i++) if (!segment[i]) bgMembers.push(i);
      // ไม่มีวัตถุเลย (เช่นรูปสีเดียวทั้งรูป) — ไม่มีอะไรให้ตัด
      if (fgMembers.length === 0) break;
      kmeansAssign(rgb, fgMembers, fgAssign);
      kmeansAssign(rgb, bgMembers, bgAssign);
    } else {
      for (let i = 0; i < n; i++) {
        if (painted[i]) continue;

        const r = rgb[i * 3];
        const g = rgb[i * 3 + 1];
        const b = rgb[i * 3 + 2];

        if (segment[i]) fgAssign[i] = fgModel.best(r, g, b);
        else bgAssign[i] = bgModel.best(r, g, b);
      }
    }

    fgModel.learn(rgb, fgAssign);
    bgModel.learn(rgb, bgAssign);

    const terminal = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      if (trimap[i] === FG) terminal[i] = HARD;
      else if (trimap[i] === BG) terminal[i] = -HARD;
      else {
        const r = rgb[i * 3];
        const g = rgb[i * 3 + 1];
        const b = rgb[i * 3 + 2];

        // ตัดเส้น source (ให้เป็นพื้นหลัง) เสีย -log P(พื้นหลัง) · ตัดเส้น sink (ให้เป็นวัตถุ) เสีย -log P(วัตถุ)
        terminal[i] = bgModel.cost(r, g, b) - fgModel.cost(r, g, b);
      }
    }

    segment = gridMinCut(width, height, terminal, Float64Array.from(links), Float64Array.from(links));
  }

  return finishSegments(segment, trimap, width, height);
}

/// แยกชิ้นวัตถุ · ตัดเศษ · อุดรูเล็ก ๆ ในเนื้อวัตถุ
function finishSegments(segment: Uint8Array, trimap: Uint8Array, width: number, height: number): CutoutResult {
  const n = width * height;
  const speck = Math.max(4, Math.round(n * SPECK));
  const mask = Uint8Array.from(segment);

  // อุดรู: เฉพาะจุดพื้นหลังเล็กจิ๋วที่ไม่แตะขอบรูป (สัญญาณรบกวน) — ช่องจริงที่เล็ก เช่นระหว่างขาสัตว์ ต้องยังโปร่ง
  const pinhole = Math.max(3, Math.round(n * 0.0004));
  const holes = components(mask, width, height, 0);

  for (const part of holes.parts) {
    if (!part.touchesEdge && part.pixels.length < pinhole && !part.pixels.some((i) => trimap[i] === BG)) {
      for (const i of part.pixels) mask[i] = 1;
    }
  }

  const found = components(mask, width, height, 1);
  const labels = new Int32Array(n).fill(-1);
  const objects: CutoutObject[] = [];

  for (const part of found.parts) {
    const kept = part.pixels.length >= speck || part.pixels.some((i) => trimap[i] === FG);

    if (!kept) {
      for (const i of part.pixels) mask[i] = 0;
      continue;
    }

    const id = objects.length;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;

    for (const i of part.pixels) {
      const x = i % width;
      const y = (i / width) | 0;

      labels[i] = id;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }

    objects.push({
      id,
      area: part.pixels.length / n,
      box: { x0: x0 / width, y0: y0 / height, x1: x1 / width, y1: y1 / height },
    });
  }

  // ชิ้นใหญ่สุดก่อน แล้วเลขชิ้นใหม่ให้ตรงลำดับ
  const order = objects.map((o) => o.id).sort((a, b) => objects[b].area - objects[a].area);
  const remap = new Int32Array(objects.length);

  order.forEach((old, index) => (remap[old] = index));
  for (let i = 0; i < n; i++) if (labels[i] >= 0) labels[i] = remap[labels[i]];

  return {
    width,
    height,
    mask,
    labels,
    objects: order.map((old, index) => ({ ...objects[old], id: index })),
  };
}

function components(mask: Uint8Array, width: number, height: number, value: 0 | 1) {
  const n = width * height;
  const seen = new Uint8Array(n);
  const parts: { pixels: number[]; touchesEdge: boolean }[] = [];
  const stack: number[] = [];

  for (let start = 0; start < n; start++) {
    if (seen[start] || mask[start] !== value) continue;

    const pixels: number[] = [];
    let touchesEdge = false;

    seen[start] = 1;
    stack.push(start);

    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p / width) | 0;

      pixels.push(p);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;

      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];

        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

        const q = ny * width + nx;

        if (!seen[q] && mask[q] === value) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }

    parts.push({ pixels, touchesEdge });
  }

  return { parts };
}

/// หน้ากากหลังตัดชิ้นที่ผู้ใช้ไม่เอา (0/1 ที่ความละเอียดของ `result`)
export function keptMask(result: CutoutResult, excluded: ReadonlySet<number>): Uint8Array {
  const out = new Uint8Array(result.mask.length);

  for (let i = 0; i < out.length; i++) {
    const label = result.labels[i];

    out[i] = result.mask[i] && (label < 0 || !excluded.has(label)) ? 1 : 0;
  }

  return out;
}

/// เลขชิ้นวัตถุที่ตำแหน่ง (สัดส่วน 0–1) · -1 = พื้นหลัง
export function objectAt(result: CutoutResult, x: number, y: number): number {
  const px = Math.min(result.width - 1, Math.max(0, Math.floor(x * result.width)));
  const py = Math.min(result.height - 1, Math.max(0, Math.floor(y * result.height)));

  return result.labels[py * result.width + px];
}

// ───────────────────────────── ขยายหน้ากาก + ขอบละเอียด ─────────────────────────────

/// ค่าเฉลี่ยในกล่อง (2r+1)² แบบ O(n) — ใช้ใน guided filter
function boxMean(src: Float32Array, width: number, height: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;

    for (let x = -r; x <= r; x++) sum += src[row + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / (2 * r + 1);
      sum += src[row + Math.min(width - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;

    for (let y = -r; y <= r; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / (2 * r + 1);
      sum += tmp[Math.min(height - 1, y + r + 1) * width + x] - tmp[Math.max(0, y - r) * width + x];
    }
  }

  return out;
}

/// ขยายภาพค่าเดียว (0–1) แบบ bilinear
function upsample(src: Float32Array, sw: number, sh: number, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    const fy = Math.min(sh - 1, Math.max(0, ((y + 0.5) * sh) / height - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;

    for (let x = 0; x < width; x++) {
      const fx = Math.min(sw - 1, Math.max(0, ((x + 0.5) * sw) / width - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const top = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx;
      const bottom = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx;

      out[y * width + x] = top * (1 - ty) + bottom * ty;
    }
  }

  return out;
}

/// หน้ากากขนาดจริงที่ขอบตามเส้นในรูป (guided filter บนภาพขาวดำของรูปจริง)
///
/// `softness` 0–10: 0 = ขอบคมที่สุด (เหมาะกับสินค้า โลโก้) · 10 = นุ่ม (เหมาะกับขนสัตว์ ผม)
export function refineAlpha(
  target: CutoutPixels,
  coarse: Uint8Array,
  coarseWidth: number,
  coarseHeight: number,
  softness: number,
): Uint8ClampedArray {
  const { width, height, data } = target;
  const n = width * height;
  const guide = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    guide[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  }

  const p = upsample(Float32Array.from(coarse), coarseWidth, coarseHeight, width, height);
  const scale = width / coarseWidth;
  const r = Math.max(2, Math.round(scale * 1.5));
  const eps = 1e-4 * (1 + softness * 3);
  const ii = new Float32Array(n);
  const ip = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    ii[i] = guide[i] * guide[i];
    ip[i] = guide[i] * p[i];
  }

  const meanI = boxMean(guide, width, height, r);
  const meanP = boxMean(p, width, height, r);
  const corrI = boxMean(ii, width, height, r);
  const corrIp = boxMean(ip, width, height, r);
  const a = ii; // ใช้ที่เดิมซ้ำ ลดหน่วยความจำ
  const b = ip;

  for (let i = 0; i < n; i++) {
    const varI = corrI[i] - meanI[i] * meanI[i];
    const cov = corrIp[i] - meanI[i] * meanP[i];

    a[i] = cov / (varI + eps);
    b[i] = meanP[i] - a[i] * meanI[i];
  }

  const meanA = boxMean(a, width, height, r);
  const meanB = boxMean(b, width, height, r);
  // ขอบคม = ดึงค่ากลาง ๆ ให้ไปทาง 0/1 มากขึ้น
  const contrast = 4 - softness * 0.3;
  const alpha = new Uint8ClampedArray(n);

  for (let i = 0; i < n; i++) {
    const q = meanA[i] * guide[i] + meanB[i];
    const v = Math.min(1, Math.max(0, (q - 0.5) * contrast + 0.5));

    alpha[i] = Math.round(v * 255 * (data[i * 4 + 3] / 255));
  }

  return alpha;
}

/// ใส่หน้ากากและล้างสีพื้นหลังที่ติดขอบโปร่งแสง ด้วยสีพื้นหลัง "เฉพาะจุด" รอบ ๆ (ไม่ใช่สีเดียวทั้งรูป)
export function applyCutout(target: CutoutPixels, alpha: Uint8ClampedArray): void {
  const { width, height, data } = target;
  const n = width * height;
  // สีพื้นหลังเฉพาะจุด = ค่าเฉลี่ยถ่วงน้ำหนักของพิกเซลที่เป็นพื้นหลังรอบ ๆ (normalized convolution)
  const weight = new Float32Array(n);
  const channels = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];

  for (let i = 0; i < n; i++) {
    const w = 1 - alpha[i] / 255;

    weight[i] = w;
    for (let c = 0; c < 3; c++) channels[c][i] = data[i * 4 + c] * w;
  }

  const r = Math.max(3, Math.round(Math.max(width, height) / 120));
  const wBlur = boxMean(weight, width, height, r);
  const cBlur = channels.map((channel) => boxMean(channel, width, height, r));

  for (let i = 0; i < n; i++) {
    const a = alpha[i] / 255;

    if (a > 0.02 && a < 0.98 && wBlur[i] > 1e-3) {
      for (let c = 0; c < 3; c++) {
        const background = cBlur[c][i] / wBlur[i];
        const v = (data[i * 4 + c] - (1 - a) * background) / a;

        data[i * 4 + c] = Math.max(0, Math.min(255, v));
      }
    }

    data[i * 4 + 3] = alpha[i];
  }
}
