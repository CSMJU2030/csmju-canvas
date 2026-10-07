/// ลบพื้นหลังรูปด้วยสี (ไม่ใช้ AI · ทำในเครื่องผู้ใช้ ไม่ส่งรูปไปไหน)
///
/// 1. หาสีพื้นหลังจากขอบรูป (จัดกลุ่มสีที่ขอบด้วย k-means ไม่เกิน 3 กลุ่ม) หรือใช้สีที่ผู้ใช้จิ้มเอง
/// 2. วัดความต่างของสีแบบที่ตาคนเห็น (ΔE ใน CIELAB)
/// 3. โหมด `edges`: ไล่จากขอบรูปเข้าไปเฉพาะพิกเซลที่สีใกล้พื้นหลังและต่อกัน (ตัวแบบที่มีสีคล้ายพื้นแต่ไม่แตะขอบรอด)
///    โหมด `color`: ลบทุกพิกเซลที่สีใกล้พื้นหลังทั้งรูป (ใช้กับช่องในตัวอักษร/โลโก้)
/// 4. ขอบนุ่ม: เบลอหน้ากากเฉพาะแนวขอบ แล้วล้างสีพื้นหลังที่ติดขอบออก (decontaminate)
///
/// ได้ผลดีกับพื้นหลังสีเรียบหรือไล่สีอ่อน ๆ (รูปสินค้าบนพื้นขาว โลโก้ ภาพบนฉาก) · พื้นหลังซับซ้อนต้องเก็บต่อด้วยยางลบ

export type BgRemoveMode = 'edges' | 'color';

export interface BgRemoveOptions {
  mode: BgRemoveMode;
  /// ความไวต่อสี 0–100 (มาก = ลบสีที่ต่างจากพื้นหลังมากขึ้น)
  tolerance: number;
  /// ความนุ่มของขอบ 0–10 (พิกเซลของรูปที่ประมวลผล)
  softness: number;
  /// สีพื้นหลังที่ผู้ใช้เลือกเอง [r, g, b] · ไม่มี = หาจากขอบรูป
  sample?: [number, number, number] | null;
}

export const DEFAULT_BG_OPTIONS: BgRemoveOptions = { mode: 'edges', tolerance: 40, softness: 2, sample: null };

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

type Lab = [number, number, number];

const srgbToLinear = (c: number) => {
  const v = c / 255;

  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const LINEAR = Array.from({ length: 256 }, (_, i) => srgbToLinear(i));

const labF = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = LINEAR[r];
  const G = LINEAR[g];
  const B = LINEAR[b];
  const x = labF((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = labF(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = labF((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);

  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const dist2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/// ความไว 0–100 → ระยะสี ΔE ที่ยังนับเป็นพื้นหลัง
export function toleranceToDelta(tolerance: number): number {
  const t = Math.max(0, Math.min(100, tolerance)) / 100;

  return 2 + t * t * 58;
}

/// สีที่ขอบรูป → กลุ่มสีพื้นหลัง (k-means · ตัดกลุ่มที่มีไม่ถึง 8% ของขอบทิ้ง)
export function backgroundClusters(px: Pixels, labs: Float32Array): { centers: Lab[]; rgb: [number, number, number][] } {
  const { width: w, height: h } = px;
  const ring = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const samples: number[] = [];
  const step = Math.max(1, Math.floor((2 * (w + h) * ring) / 4000));
  let count = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
      if (count++ % step !== 0) continue;
      if (px.data[(y * w + x) * 4 + 3] < 128) continue;
      samples.push(y * w + x);
    }
  }

  if (samples.length === 0) return { centers: [], rgb: [] };

  const lab = (i: number): Lab => [labs[i * 3], labs[i * 3 + 1], labs[i * 3 + 2]];
  const k = Math.min(3, samples.length);
  let centers: Lab[] = Array.from({ length: k }, (_, j) => lab(samples[Math.floor(((j + 0.5) * samples.length) / k)]));
  let assign = new Int32Array(samples.length);

  for (let iter = 0; iter < 8; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);

    samples.forEach((s, n) => {
      const p = lab(s);
      let best = 0;

      for (let c = 1; c < centers.length; c++) if (dist2(p, centers[c]) < dist2(p, centers[best])) best = c;
      assign[n] = best;
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      sums[best][3]++;
    });
    centers = sums.map((s, c) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[c]) as Lab);
  }

  const keep: number[] = [];
  const counts = centers.map((_, c) => assign.filter((a) => a === c).length);

  counts.forEach((n, c) => {
    if (n >= samples.length * 0.08) keep.push(c);
  });

  const rgb = keep.map((c) => {
    const sum = [0, 0, 0];
    let n = 0;

    samples.forEach((s, i) => {
      if (assign[i] !== c) return;
      sum[0] += px.data[s * 4];
      sum[1] += px.data[s * 4 + 1];
      sum[2] += px.data[s * 4 + 2];
      n++;
    });

    return sum.map((v) => Math.round(v / Math.max(1, n))) as [number, number, number];
  });

  assign = new Int32Array(0);

  return { centers: keep.map((c) => centers[c]), rgb };
}

/// หน้ากากความทึบ 0–255 ต่อพิกเซล (0 = พื้นหลัง) และสีพื้นหลังหลักที่ใช้ล้างขอบ
export function backgroundMask(px: Pixels, options: BgRemoveOptions): { alpha: Uint8ClampedArray; background: [number, number, number] | null } {
  const { width: w, height: h, data } = px;
  const n = w * h;
  const labs = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    const [L, A, B] = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);

    labs[i * 3] = L;
    labs[i * 3 + 1] = A;
    labs[i * 3 + 2] = B;
  }

  const model = options.sample
    ? { centers: [rgbToLab(...options.sample)], rgb: [options.sample] }
    : backgroundClusters(px, labs);
  const alpha = new Uint8ClampedArray(n).fill(255);

  if (model.centers.length === 0) return { alpha, background: null };

  const limit = toleranceToDelta(options.tolerance) ** 2;
  const isBg = new Uint8Array(n);
  const near = (i: number) => {
    if (data[i * 4 + 3] < 8) return true;

    const p: Lab = [labs[i * 3], labs[i * 3 + 1], labs[i * 3 + 2]];

    return model.centers.some((c) => dist2(p, c) <= limit);
  };

  if (options.mode === 'color') {
    for (let i = 0; i < n; i++) if (near(i)) isBg[i] = 1;
  } else {
    // ไล่จากขอบรูปเข้าไป (BFS 4 ทิศ) เฉพาะพิกเซลที่สีใกล้พื้นหลัง
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    const push = (i: number) => {
      if (isBg[i] || !near(i)) return;
      isBg[i] = 1;
      queue[tail++] = i;
    };

    for (let x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }

    for (let y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }

    while (head < tail) {
      const i = queue[head++];
      const x = i % w;

      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < n - w) push(i + w);
    }
  }

  for (let i = 0; i < n; i++) if (isBg[i]) alpha[i] = 0;

  const radius = Math.round(Math.max(0, Math.min(10, options.softness)));

  if (radius > 0) softenEdges(alpha, w, h, radius);

  return { alpha, background: model.rgb[0] ?? null };
}

/// เบลอหน้ากากแบบกล่อง (แยกแนวนอน/ตั้ง) แล้วใช้ค่าที่เบลอเฉพาะแนวขอบ — พื้นที่ทึบเต็มและว่างเต็มคงเดิม
function softenEdges(alpha: Uint8ClampedArray, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const size = r * 2 + 1;

  for (let y = 0; y < h; y++) {
    let sum = 0;

    for (let x = -r; x <= r; x++) sum += alpha[y * w + Math.min(w - 1, Math.max(0, x))];

    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / size;
      sum += alpha[y * w + Math.min(w - 1, x + r + 1)] - alpha[y * w + Math.max(0, x - r)];
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0;

    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];

    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / size;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }

  // ไล่ความทึบเข้าด้านในของตัวแบบเท่านั้น — พื้นหลังคงโปร่งใสเต็ม (ไม่มีขอบสีพื้นหลังเป็นเงารอบตัวแบบ)
  // ขอบนอกสุดของตัวแบบเหลือราวหนึ่งในสาม แล้วทึบเต็มเมื่อลึกเข้าไป r พิกเซล
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] === 0) continue;

    alpha[i] = Math.round(Math.max(0, Math.min(1, (out[i] / 255 - 0.25) / 0.75)) * 255);
  }
}

/// ใส่หน้ากากลงพิกเซล (ในที่) และล้างสีพื้นหลังที่ติดตามขอบโปร่งแสง
export function applyMask(px: Pixels, alpha: Uint8ClampedArray, background: [number, number, number] | null) {
  const { data } = px;

  for (let i = 0; i < alpha.length; i++) {
    const a = (alpha[i] / 255) * (data[i * 4 + 3] / 255);

    if (background && a > 0.05 && a < 0.98) {
      for (let c = 0; c < 3; c++) {
        const v = (data[i * 4 + c] - (1 - a) * background[c]) / a;

        data[i * 4 + c] = Math.max(0, Math.min(255, v));
      }
    }

    data[i * 4 + 3] = Math.round(a * 255);
  }
}

/// สัดส่วนพิกเซลที่ถูกลบ (0–1) — ใช้เตือนเมื่อแทบไม่ได้ลบอะไรหรือลบเกือบหมด
export function removedRatio(alpha: Uint8ClampedArray): number {
  let removed = 0;

  for (let i = 0; i < alpha.length; i++) if (alpha[i] < 128) removed++;

  return alpha.length ? removed / alpha.length : 0;
}
