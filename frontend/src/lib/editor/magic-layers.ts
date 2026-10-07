import { applyCutout, refineAlpha, type CutoutPixels, type CutoutResult } from './smart-cutout';

/// "แยกเลเยอร์" (Magic Layers แบบ Canva) — แตกรูปแบน ๆ หนึ่งรูปเป็นหลายเลเยอร์ที่ขยับ/แก้ได้อิสระ
///
///   วัตถุ      ชิ้นที่ smart-cutout พบ → รูป PNG โปร่งใสแยกชิ้น วางตรงตำแหน่งเดิม
///   พื้นหลัง   รูปเดิมที่อุดตรงที่วัตถุ/ข้อความเคยอยู่ (push-pull inpainting) — ย้ายวัตถุแล้วไม่เหลือรู
///   ข้อความ    กรอบที่ผู้ใช้ลากรอบข้อความในรูป → ลบออกจากพื้นหลัง แล้ววางกล่องข้อความที่แก้ได้
///              สีและขนาดตามของเดิม (ระบบอ่านตัวอักษรในรูปไม่ได้ — ไม่มี OCR · ผู้ใช้พิมพ์ข้อความใหม่เอง)
///
/// ทำในเครื่องทั้งหมด ไม่ใช้ AI/บริการภายนอก

export interface NormRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ObjectLayer {
  pixels: CutoutPixels;
  /// ตำแหน่งในรูป (สัดส่วน 0–1)
  box: NormRect;
}

export interface TextLayer {
  box: NormRect;
  /// สีตัวอักษร (กลุ่มสีส่วนน้อยในกรอบ)
  color: [number, number, number];
  /// ความสูงตัวอักษรโดยประมาณ (สัดส่วนของความสูงรูป)
  fontHeight: number;
}

export interface LayerSplit {
  background: CutoutPixels;
  objects: ObjectLayer[];
  texts: TextLayer[];
}

/// อุดพื้นที่ `mask[i] = 1` ด้วยสีจากรอบ ๆ (push-pull: เฉลี่ยลงพีระมิดแล้วเติมกลับจากชั้นหยาบ) · แก้ในที่
export function inpaint(target: CutoutPixels, mask: Uint8Array): void {
  const { data } = target;
  type Level = { w: number; h: number; c: Float32Array; a: Float32Array };
  const levels: Level[] = [];
  let w = target.width;
  let h = target.height;
  const c0 = new Float32Array(w * h * 3);
  const a0 = new Float32Array(w * h);

  for (let i = 0; i < w * h; i++) {
    if (mask[i]) continue;
    a0[i] = 1;
    c0[i * 3] = data[i * 4];
    c0[i * 3 + 1] = data[i * 4 + 1];
    c0[i * 3 + 2] = data[i * 4 + 2];
  }

  levels.push({ w, h, c: c0, a: a0 });

  // ลง: ชั้นละครึ่ง · สีคือค่าเฉลี่ยถ่วงด้วยความ "รู้ค่า" ของลูก 2×2
  while (w > 1 || h > 1) {
    const prev = levels[levels.length - 1];
    const nw = Math.max(1, Math.ceil(w / 2));
    const nh = Math.max(1, Math.ceil(h / 2));
    const c = new Float32Array(nw * nh * 3);
    const a = new Float32Array(nw * nh);

    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let sum = 0;
        let r = 0;
        let g = 0;
        let b = 0;

        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(prev.w - 1, x * 2 + dx);
            const sy = Math.min(prev.h - 1, y * 2 + dy);
            const j = sy * prev.w + sx;
            const weight = prev.a[j];

            sum += weight;
            r += prev.c[j * 3] * weight;
            g += prev.c[j * 3 + 1] * weight;
            b += prev.c[j * 3 + 2] * weight;
          }
        }

        const i = y * nw + x;

        if (sum > 0) {
          c[i * 3] = r / sum;
          c[i * 3 + 1] = g / sum;
          c[i * 3 + 2] = b / sum;
        }
        a[i] = Math.min(1, sum);
      }
    }

    levels.push({ w: nw, h: nh, c, a });
    w = nw;
    h = nh;
  }

  // ขึ้น: ช่องที่รู้ค่าไม่เต็มรับสีจากชั้นหยาบกว่า (bilinear) ตามสัดส่วนที่ขาด
  for (let l = levels.length - 2; l >= 0; l--) {
    const fine = levels[l];
    const coarse = levels[l + 1];

    for (let y = 0; y < fine.h; y++) {
      const fy = Math.min(coarse.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
      const y0 = Math.floor(fy);
      const y1 = Math.min(coarse.h - 1, y0 + 1);
      const ty = fy - y0;

      for (let x = 0; x < fine.w; x++) {
        const i = y * fine.w + x;
        const known = fine.a[i];

        if (known >= 1) continue;

        const fx = Math.min(coarse.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
        const x0 = Math.floor(fx);
        const x1 = Math.min(coarse.w - 1, x0 + 1);
        const tx = fx - x0;

        for (let ch = 0; ch < 3; ch++) {
          const top = coarse.c[(y0 * coarse.w + x0) * 3 + ch] * (1 - tx) + coarse.c[(y0 * coarse.w + x1) * 3 + ch] * tx;
          const bottom = coarse.c[(y1 * coarse.w + x0) * 3 + ch] * (1 - tx) + coarse.c[(y1 * coarse.w + x1) * 3 + ch] * tx;
          const up = top * (1 - ty) + bottom * ty;

          fine.c[i * 3 + ch] = fine.c[i * 3 + ch] * known + up * (1 - known);
        }
        fine.a[i] = 1;
      }
    }
  }

  const out = levels[0];

  for (let i = 0; i < target.width * target.height; i++) {
    if (!mask[i]) continue;
    data[i * 4] = out.c[i * 3];
    data[i * 4 + 1] = out.c[i * 3 + 1];
    data[i * 4 + 2] = out.c[i * 3 + 2];
    data[i * 4 + 3] = 255;
  }
}

/// ขยายพื้นที่ออกไป r พิกเซล (กันขอบเงาของวัตถุ/ตัวอักษรค้างบนพื้นหลัง)
export function dilate(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  let current = mask;

  for (let step = 0; step < r; step++) {
    const next = Uint8Array.from(current);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;

        if (current[i]) continue;
        if ((x > 0 && current[i - 1]) || (x < width - 1 && current[i + 1]) || (y > 0 && current[i - width]) || (y < height - 1 && current[i + width])) next[i] = 1;
      }
    }

    current = next;
  }

  return current;
}

/// สีตัวอักษรในกรอบ: แบ่งพิกเซลเป็นสองกลุ่มตามความสว่าง (Otsu) แล้วเอากลุ่มที่น้อยกว่า (ตัวอักษรกินที่น้อยกว่าพื้น)
export function textColorIn(target: CutoutPixels, box: NormRect): { color: [number, number, number]; ink: Uint8Array; x0: number; y0: number; w: number; h: number } {
  const x0 = Math.max(0, Math.floor(box.x0 * target.width));
  const y0 = Math.max(0, Math.floor(box.y0 * target.height));
  const x1 = Math.min(target.width, Math.ceil(box.x1 * target.width));
  const y1 = Math.min(target.height, Math.ceil(box.y1 * target.height));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const lum = new Float32Array(w * h);
  const histogram = new Array<number>(256).fill(0);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * target.width + x0 + x) * 4;
      const v = 0.299 * target.data[i] + 0.587 * target.data[i + 1] + 0.114 * target.data[i + 2];

      lum[y * w + x] = v;
      histogram[Math.min(255, Math.round(v))]++;
    }
  }

  // Otsu
  const total = w * h;
  let sumAll = 0;

  for (let t = 0; t < 256; t++) sumAll += t * histogram[t];

  let best = 0;
  let threshold = 128;
  let weightB = 0;
  let sumB = 0;

  for (let t = 0; t < 256; t++) {
    weightB += histogram[t];
    if (!weightB) continue;

    const weightF = total - weightB;

    if (!weightF) break;
    sumB += t * histogram[t];

    const between = weightB * weightF * (sumB / weightB - (sumAll - sumB) / weightF) ** 2;

    if (between > best) {
      best = between;
      threshold = t;
    }
  }

  const dark = lum.filter((v) => Math.round(v) <= threshold).length;
  const inkIsDark = dark <= total / 2;
  const ink = new Uint8Array(total);
  const acc = [0, 0, 0, 0];

  for (let k = 0; k < total; k++) {
    const level = Math.round(lum[k]);
    const isInk = inkIsDark ? level <= threshold : level > threshold;

    if (!isInk) continue;
    ink[k] = 1;

    const i = ((y0 + Math.floor(k / w)) * target.width + x0 + (k % w)) * 4;

    acc[0] += target.data[i];
    acc[1] += target.data[i + 1];
    acc[2] += target.data[i + 2];
    acc[3]++;
  }

  const n = Math.max(1, acc[3]);

  return { color: [Math.round(acc[0] / n), Math.round(acc[1] / n), Math.round(acc[2] / n)], ink, x0, y0, w, h };
}

/// แตกรูปเป็นเลเยอร์ · `full` = พิกเซลรูปที่จะใช้จริง · `result` = ผลของ grabCut บนรูปย่อ
export function splitLayers(
  full: CutoutPixels,
  result: CutoutResult,
  excluded: ReadonlySet<number>,
  textBoxes: readonly NormRect[],
  softness: number,
): LayerSplit {
  const { width, height } = full;
  const fillMask = new Uint8Array(width * height);
  const objects: ObjectLayer[] = [];

  for (const object of result.objects) {
    if (excluded.has(object.id)) continue;

    const coarse = new Uint8Array(result.mask.length);

    for (let i = 0; i < coarse.length; i++) coarse[i] = result.labels[i] === object.id ? 1 : 0;

    const alpha = refineAlpha(full, coarse, result.width, result.height, softness);
    // กรอบของชิ้นนี้ (ขยายเผื่อขอบนุ่ม)
    const pad = 4;
    const bx0 = Math.max(0, Math.floor(object.box.x0 * width) - pad);
    const by0 = Math.max(0, Math.floor(object.box.y0 * height) - pad);
    const bx1 = Math.min(width, Math.ceil(object.box.x1 * width) + pad);
    const by1 = Math.min(height, Math.ceil(object.box.y1 * height) + pad);
    const bw = Math.max(1, bx1 - bx0);
    const bh = Math.max(1, by1 - by0);
    const piece: CutoutPixels = { data: new Uint8ClampedArray(bw * bh * 4), width: bw, height: bh };
    const pieceAlpha = new Uint8ClampedArray(bw * bh);

    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const src = (by0 + y) * width + bx0 + x;
        const dst = y * bw + x;

        piece.data.set(full.data.subarray(src * 4, src * 4 + 4), dst * 4);
        pieceAlpha[dst] = alpha[src];
        if (alpha[src] > 16) fillMask[src] = 1;
      }
    }

    applyCutout(piece, pieceAlpha);
    objects.push({ pixels: piece, box: { x0: bx0 / width, y0: by0 / height, x1: bx1 / width, y1: by1 / height } });
  }

  const texts: TextLayer[] = [];

  for (const box of textBoxes) {
    const found = textColorIn(full, box);

    // ลบเฉพาะเส้นตัวอักษร (ขยายเล็กน้อย) ไม่ใช่ทั้งกรอบ — พื้นรอบตัวอักษรยังเป็นของเดิม
    const ink = dilate(found.ink, found.w, found.h, 2);

    for (let y = 0; y < found.h; y++) {
      for (let x = 0; x < found.w; x++) {
        if (ink[y * found.w + x]) fillMask[(found.y0 + y) * width + found.x0 + x] = 1;
      }
    }

    texts.push({ box, color: found.color, fontHeight: ((box.y1 - box.y0) * 0.72) });
  }

  const background: CutoutPixels = { data: new Uint8ClampedArray(full.data), width, height };

  inpaint(background, dilate(fillMask, width, height, 2));

  return { background, objects, texts };
}
