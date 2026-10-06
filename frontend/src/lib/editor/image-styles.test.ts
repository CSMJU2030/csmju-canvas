import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectDef } from './image-effects';
import { FILTER_GROUPS, FILTER_PRESETS, applyAdjust, effectiveAdjust, findFilter } from './image-filters';
import { IMAGE_STYLES, captureStyle, decorValues, hasImageEdits, loadPersonalStyles, savePersonalStyles, styleToValues } from './image-styles';

describe('ฟิลเตอร์สำเร็จรูป', () => {
  it('มีอย่างน้อย 40 ตัว key ไม่ซ้ำ และทุกตัวอยู่ในกลุ่มที่มีชื่อ', () => {
    expect(FILTER_PRESETS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(FILTER_PRESETS.map((f) => f.key)).size).toBe(FILTER_PRESETS.length);

    const groups = new Set(FILTER_GROUPS.map((g) => g.key));

    for (const f of FILTER_PRESETS) expect(groups.has(f.group)).toBe(true);
  });

  it('key เดิมที่งานของผู้ใช้อ้างถึงยังอยู่ครบ', () => {
    for (const key of ['mono', 'pop', 'duo-violet', 'poster', 'fresh', 'meadow', 'mist', 'stone', 'sunset', 'latte', 'peach', 'ocean', 'frost', 'night', 'film', 'sepia', 'fade']) {
      expect(findFilter(key)).not.toBeNull();
    }
  });

  it('ย้อมสีแยกโทน: เงาเอียงไปทางฟ้า ส่วนสว่างเอียงไปทางส้ม (ฟ้าส้มฮอลลีวูด)', () => {
    const filter = findFilter('teal-orange')!;
    const px = { data: new Uint8ClampedArray([40, 40, 40, 255, 220, 220, 220, 255]), width: 2, height: 1 };

    applyAdjust(px, { ...effectiveAdjust(null, filter, 100), contrast: 0, saturation: 0 }, filter, 100);
    expect(px.data[2]).toBeGreaterThan(px.data[0]);
    expect(px.data[4]).toBeGreaterThan(px.data[6]);
  });

  it('ขาวดำฟิลเตอร์แดงใช้น้ำหนักสีแดงมากกว่า', () => {
    const red = { data: new Uint8ClampedArray([255, 0, 0, 255]), width: 1, height: 1 };
    const std = { data: new Uint8ClampedArray([255, 0, 0, 255]), width: 1, height: 1 };

    applyAdjust(red, { ...effectiveAdjust(null, null, 100) }, findFilter('red-filter'), 100);
    applyAdjust(std, { ...effectiveAdjust(null, null, 100) }, findFilter('mono'), 100);
    expect(red.data[0]).toBeGreaterThan(std.data[0]);
    expect(red.data[0]).toBe(red.data[1]);
  });
});

describe('สไตล์ภาพ', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('สไตล์สำเร็จรูปใช้ฟิลเตอร์และเอฟเฟกต์ที่มีอยู่จริง', () => {
    expect(IMAGE_STYLES.length).toBeGreaterThanOrEqual(10);

    for (const s of IMAGE_STYLES) {
      if (s.values.filter) expect(findFilter(s.values.filter)).not.toBeNull();
      for (const e of s.values.effects ?? []) expect(effectDef(e.kind)).not.toBeNull();
    }
  });

  it('ล้างค่าที่สไตล์ไม่ได้กำหนด · รูปในกรอบไม่ได้สไตล์เลเยอร์', () => {
    const sticker = IMAGE_STYLES.find((s) => s.key === 'sticker')!;

    expect(styleToValues(sticker.values, true)).toMatchObject({ filter: null, effects: null, curves: null, layerStyle: sticker.values.layerStyle });
    expect('layerStyle' in styleToValues(sticker.values, false)).toBe(false);
  });

  it('ขอบโพลารอยด์และเงาคิดตามขนาดรูป', () => {
    const polaroid = IMAGE_STYLES.find((s) => s.key === 'polaroid-card')!;
    const decor = decorValues(polaroid, { width: 400, height: 300 });

    expect(decor.border?.width).toBe(15);
    expect(decor.shadow).toBeTruthy();
  });

  it('บันทึกและอ่านสไตล์ของผู้ใช้ · ข้อมูลเสียคืนรายการว่าง', () => {
    const values = captureStyle({ filter: 'mono', adjust: { contrast: 10 } });

    expect(hasImageEdits(values)).toBe(true);
    expect(hasImageEdits({})).toBe(false);
    expect(savePersonalStyles([{ key: 'mine-1', label: 'ของฉัน', values }])).toBe(true);
    expect(loadPersonalStyles()).toEqual([{ key: 'mine-1', label: 'ของฉัน', values }]);

    window.localStorage.setItem('csmju-canvas.image-styles.v1', '{bad json');
    expect(loadPersonalStyles()).toEqual([]);
  });

  it('localStorage ใช้ไม่ได้ (โหมดส่วนตัว) ไม่ทำให้พัง', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(savePersonalStyles([])).toBe(false);
    expect(loadPersonalStyles()).toEqual([]);
  });
});
