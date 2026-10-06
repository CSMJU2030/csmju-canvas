import { activeEffects, applyEffects, type Pixels } from './image-effects';
import { applyAdjust, applyColorEdits, effectiveAdjust, findFilter, isNeutral } from './image-filters';
import { applyTones, hasTones } from './image-tones';
import type { ImageElement } from './types';

/// ลำดับการประมวลผลพิกเซลของรูปหนึ่งรูป (ที่เดียว ใช้ทั้งบนจอ ภาพย่อ ภาพเทียบก่อน/หลัง และไฟล์ส่งออก)
///
/// 1. ปรับแสงสี + ฟิลเตอร์ (`adjust` `filter` `filterIntensity` — ยกเว้น `blur` ที่วาดด้วย ctx.filter)
/// 2. แก้ไขสีเฉพาะช่วง (`colorEdits`)
/// 3. ระดับสี แล้วเส้นโค้ง (`levels` `curves`)
/// 4. เอฟเฟกต์ภาพตามลำดับ (`effects`)
/// รอยยางลบ (`erase`) และสไตล์เลเยอร์ (`layerStyle`) ทำต่อใน render.ts

export type PipelineSpec = Pick<ImageElement, 'adjust' | 'filter' | 'filterIntensity' | 'colorEdits' | 'levels' | 'curves' | 'effects'>;

function prepared(spec: PipelineSpec) {
  const filter = findFilter(spec.filter);
  const intensity = spec.filterIntensity ?? 100;
  const adjust = { ...effectiveAdjust(spec.adjust, filter, intensity), blur: 0 };
  const colorEdits = (spec.colorEdits ?? []).filter((e) => e.hue || e.saturation || e.lightness);
  const effects = activeEffects(spec.effects);
  const tones = hasTones(spec.levels, spec.curves);

  return { filter, intensity, adjust, colorEdits, effects, tones };
}

/// ต้องอ่านพิกเซลหรือไม่ (false = วาดรูปเดิมได้เลย)
export function needsPixels(spec: PipelineSpec): boolean {
  const p = prepared(spec);

  return !isNeutral(p.adjust, p.filter) || p.colorEdits.length > 0 || p.effects.length > 0 || p.tones;
}

/// คีย์แคชของผลลัพธ์ (ค่าที่ไม่มีผลไม่อยู่ในคีย์ — เปิด/ปิดเอฟเฟกต์ที่ปิดอยู่ไม่ทำให้ประมวลผลใหม่)
export function pipelineKey(spec: PipelineSpec): string {
  const p = prepared(spec);

  return JSON.stringify([
    p.adjust,
    spec.filter ?? '',
    p.intensity,
    p.colorEdits,
    p.tones ? [spec.levels ?? null, spec.curves ?? null] : null,
    p.effects.map((e) => [e.kind, e.params ?? null, e.colors ?? null]),
  ]);
}

export function runPipeline(img: Pixels, spec: PipelineSpec) {
  const p = prepared(spec);

  if (!isNeutral(p.adjust, p.filter)) applyAdjust(img, p.adjust, p.filter, p.intensity);
  if (p.colorEdits.length) applyColorEdits(img, p.colorEdits);
  if (p.tones) applyTones(img, spec.levels, spec.curves);
  if (p.effects.length) applyEffects(img, p.effects);
}
