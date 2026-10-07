import { describe, expect, it } from 'vitest';
import { chartScene, chartSvg, type ChartPrim, type Measure } from './chart';
import { createChart } from './factory';
import type { ChartElement } from './types';

const page = { width: 1000, height: 1000 };
const measure: Measure = (text, size) => text.length * size * 0.5;

function of<K extends ChartPrim['kind']>(prims: ChartPrim[], kind: K) {
  return prims.filter((p): p is Extract<ChartPrim, { kind: K }> => p.kind === kind);
}

describe('chartScene', () => {
  it('กราฟแท่ง: หนึ่งแท่งต่อหนึ่งค่า อยู่ในกรอบของชาร์ต และแท่งที่ค่ามากกว่าสูงกว่า', () => {
    const el = createChart(page, 'column');
    const rects = of(chartScene(el, measure), 'rect');

    expect(rects).toHaveLength(el.labels.length * el.series.length);

    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(el.x);
      expect(r.x + r.w).toBeLessThanOrEqual(el.x + el.width);
      expect(r.y).toBeGreaterThanOrEqual(el.y);
      expect(r.y + r.h).toBeLessThanOrEqual(el.y + el.height);
    }

    // ชุดแรก ค่า [12, 19, 9, 15] → แท่งที่สอง (19) สูงสุด
    const first = rects.filter((r) => r.fill === el.colors[0]);

    expect(first[1].h).toBeGreaterThan(first[0].h);
    expect(first[2].h).toBeLessThan(first[0].h);
  });

  it('แอนิเมชัน: grow = 0 แท่งยังไม่โผล่ · grow = 1 เต็มความสูง', () => {
    const el = createChart(page, 'column');

    expect(of(chartScene(el, measure, 0), 'rect').every((r) => r.h === 0)).toBe(true);
    expect(of(chartScene(el, measure, 1), 'rect').some((r) => r.h > 0)).toBe(true);
  });

  it('กราฟแท่งแนวนอนและค่าติดลบ: แท่งลบอยู่ซ้ายของเส้นศูนย์', () => {
    const el: ChartElement = { ...createChart(page, 'bar'), series: [{ name: 'a', values: [10, -5, 3, 0] }] };
    const rects = of(chartScene(el, measure), 'rect');

    expect(rects).toHaveLength(4);
    expect(rects[1].x).toBeLessThan(rects[0].x);
    expect(rects[1].x + rects[1].w).toBeCloseTo(rects[0].x);
  });

  it('กราฟเส้น/พื้นที่: มีเส้นต่อจุดและจุดครบทุกค่า', () => {
    const line = chartScene(createChart(page, 'line'), measure);
    const area = chartScene(createChart(page, 'area'), measure);

    expect(of(line, 'poly').filter((p) => p.stroke)).toHaveLength(2);
    expect(of(line, 'circle').filter((c) => c.r > 0 && c.stroke === null).length).toBeGreaterThanOrEqual(8);
    expect(of(area, 'poly').filter((p) => p.fill)).toHaveLength(2);
  });

  it('วงกลม: ชิ้นรวมกันเต็มวง และเปอร์เซ็นต์ตรงกับค่า', () => {
    const el = createChart(page, 'pie');
    const prims = chartScene(el, measure);
    const sectors = of(prims, 'sector');
    const total = sectors.reduce((sum, s) => sum + (s.end - s.start), 0);

    expect(sectors).toHaveLength(4);
    expect(total).toBeCloseTo(Math.PI * 2);
    expect(of(prims, 'text').map((t) => t.text)).toEqual(expect.arrayContaining(['40%', '25%', '20%', '15%']));
  });

  it('โดนัทมีรูตรงกลาง · ข้อมูลเป็นศูนย์วาดวงจาง ๆ แทน', () => {
    const donut = of(chartScene(createChart(page, 'donut'), measure), 'sector');
    const empty = of(chartScene({ ...createChart(page, 'pie'), series: [{ name: 'a', values: [0, 0, 0, 0] }] }, measure), 'sector');

    expect(donut.every((s) => s.inner > 0)).toBe(true);
    expect(empty).toHaveLength(1);
  });

  it('วงแหวนความคืบหน้า: ความยาวโค้งตามเปอร์เซ็นต์ และตัดค่าเกิน 100', () => {
    const el = createChart(page, 'progress-ring');
    const arc = of(chartScene(el, measure), 'arc')[0];
    const over = of(chartScene({ ...el, series: [{ name: 'a', values: [250] }] }, measure), 'arc')[0];

    expect(arc.end - arc.start).toBeCloseTo(Math.PI * 2 * 0.7);
    expect(over.end - over.start).toBeCloseTo(Math.PI * 2);
    expect(of(chartScene(el, measure), 'text')[0].text).toBe('70%');
  });
});

describe('chartSvg', () => {
  it('ส่งออกเป็นเวกเตอร์ (ไม่มีรูปฝัง) และไม่มีค่า NaN', () => {
    for (const kind of ['bar', 'column', 'line', 'area', 'pie', 'donut', 'progress-ring'] as const) {
      const svg = chartSvg(createChart(page, kind), measure);

      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('<image');
      expect(svg.length).toBeGreaterThan(50);
    }

    expect(chartSvg(createChart(page, 'pie'), measure)).toContain('<path');
    expect(chartSvg(createChart(page, 'column'), measure)).toContain('รายการ 1');
  });

  it('ข้อความถูก escape', () => {
    const el = { ...createChart(page, 'column'), labels: ['<ก&ข>', 'b', 'c', 'd'] };

    expect(chartSvg(el, measure)).toContain('&lt;ก&amp;ข&gt;');
  });
});
