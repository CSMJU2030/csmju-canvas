import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHART_COLORS,
  addRow,
  addSeries,
  formatTick,
  formatValue,
  isTabular,
  niceScale,
  normalizeChart,
  parseNumber,
  parseTabular,
  piePercentages,
  removeRow,
  removeSeries,
  tableToChart,
  writeCells,
} from './chart-data';
import { createChart } from './factory';
import { normalizeDocument, type ChartElement } from './types';

const page = { width: 1000, height: 1000 };

describe('normalizeChart', () => {
  it('เติมค่าที่ขาดและทำให้ค่าทุกชุดยาวเท่าจำนวนรายการ', () => {
    const el = normalizeChart({
      type: 'chart',
      chart: 'ไม่รู้จัก',
      labels: ['ก', 'ข', 'ค'],
      series: [{ name: 'ยอดขาย', values: [1, '2,000', 'x'] }, { values: [5] }],
    } as unknown as ChartElement);

    expect(el.chart).toBe('column');
    expect(el.series[0].values).toEqual([1, 2000, 0]);
    expect(el.series[1]).toEqual({ name: 'ชุดข้อมูล 2', values: [5, 0, 0] });
    expect(el.colors).toEqual(DEFAULT_CHART_COLORS);
    expect(el.showLegend).toBe(true);
    expect(el.fontSize).toBeGreaterThan(0);
  });

  it('ค่ายาวกว่าชื่อรายการ = เติมชื่อรายการให้ · ไม่มีชุดข้อมูล = สร้างหนึ่งชุด', () => {
    const longer = normalizeChart({ type: 'chart', labels: ['ก'], series: [{ name: 'a', values: [1, 2, 3] }] } as unknown as ChartElement);
    const empty = normalizeChart({ type: 'chart' } as unknown as ChartElement);

    expect(longer.labels).toEqual(['ก', 'รายการ 2', 'รายการ 3']);
    expect(empty.labels).toEqual(['รายการ 1']);
    expect(empty.series).toEqual([{ name: 'ชุดข้อมูล 1', values: [0] }]);
  });

  it('normalizeDocument รับ element ชาร์ตและ normalize ให้', () => {
    const doc = normalizeDocument({
      pages: [{ id: 'p', background: null, elements: [{ id: 'c', type: 'chart', x: 0, y: 0, width: 10, height: 10, labels: ['ก'], series: [{ name: 'a', values: [Infinity] }] }] }],
    });
    const el = doc.pages[0].elements[0] as ChartElement;

    expect(el.type).toBe('chart');
    expect(el.series[0].values).toEqual([0]);
    expect(el.locked).toBe(false);
  });

  it('createChart ได้ข้อมูลตัวอย่างที่แก้ได้ และผ่าน normalize โดยไม่เปลี่ยน', () => {
    for (const kind of ['bar', 'column', 'line', 'area', 'pie', 'donut', 'progress-ring'] as const) {
      const el = createChart(page, kind);

      expect(el.chart).toBe(kind);
      expect(normalizeChart(el)).toEqual(el);
      expect(el.series.every((s) => s.values.length === el.labels.length)).toBe(true);
    }

    expect(createChart(page, 'column').labels[0]).toBe('รายการ 1');
  });
});

describe('niceScale', () => {
  it('ได้เส้นแบ่งที่ค่าสวยและเริ่มที่ศูนย์', () => {
    expect(niceScale(0, 19).ticks).toEqual([0, 5, 10, 15, 20]);
    expect(niceScale(3, 87)).toMatchObject({ min: 0, max: 100, step: 20 });
  });

  it('ค่าติดลบ: ครอบทั้งช่วงและมีศูนย์อยู่ในเส้นแบ่ง', () => {
    const scale = niceScale(-7, 23);

    expect(scale.min).toBeLessThanOrEqual(-7);
    expect(scale.max).toBeGreaterThanOrEqual(23);
    expect(scale.ticks).toContain(0);
  });

  it('ข้อมูลเป็นศูนย์ทั้งหมด หรือทศนิยมเล็ก ไม่พัง', () => {
    expect(niceScale(0, 0)).toMatchObject({ min: 0, max: 1 });
    expect(niceScale(0, 0.3).ticks).toEqual([0, 0.1, 0.2, 0.3]);
    expect(niceScale(Number.NaN, 5).max).toBeGreaterThan(0);
  });
});

describe('piePercentages', () => {
  it('ปัดแล้วรวมได้ 100 พอดี', () => {
    expect(piePercentages([40, 25, 20, 15])).toEqual([40, 25, 20, 15]);
    expect(piePercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(piePercentages([2, 3, 5, 7]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('ค่าติดลบนับเป็นศูนย์ · รวมเป็นศูนย์ได้ศูนย์ทุกชิ้น', () => {
    expect(piePercentages([-5, 10, 10])).toEqual([0, 50, 50]);
    expect(piePercentages([0, 0])).toEqual([0, 0]);
  });
});

describe('ตัวเลข', () => {
  it('parseNumber รับรูปแบบจากสเปรดชีตและภาษาไทย', () => {
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber(' ๑๒ ')).toBe(12);
    expect(parseNumber('45%')).toBe(45);
    expect(parseNumber('฿ 1,000')).toBe(1000);
    expect(parseNumber('−3')).toBe(-3);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });

  it('formatValue/formatTick', () => {
    expect(formatValue(1234.567)).toBe('1,234.57');
    expect(formatValue(-0)).toBe('0');
    expect(formatTick(25000)).toBe('25K');
    expect(formatTick(1500000)).toBe('1.5M');
    expect(formatTick(500)).toBe('500');
  });
});

describe('วางข้อมูลจากสเปรดชีต', () => {
  it('parseTabular แยกแถวด้วยขึ้นบรรทัดและคอลัมน์ด้วย Tab', () => {
    expect(parseTabular('เดือน\tยอดขาย\r\nม.ค.\t1,200\n"ก.พ."\t900\n\n')).toEqual([
      ['เดือน', 'ยอดขาย'],
      ['ม.ค.', '1,200'],
      ['ก.พ.', '900'],
    ]);
    expect(isTabular('12')).toBe(false);
    expect(isTabular('12\t13')).toBe(true);
  });

  it('tableToChart เดาหัวคอลัมน์และชื่อรายการ', () => {
    const parsed = tableToChart(parseTabular('เดือน\tปี 66\tปี 67\nม.ค.\t10\t12\nก.พ.\t8\t15'));

    expect(parsed).toEqual({
      labels: ['ม.ค.', 'ก.พ.'],
      series: [
        { name: 'ปี 66', values: [10, 8] },
        { name: 'ปี 67', values: [12, 15] },
      ],
    });
  });

  it('tableToChart ตัวเลขล้วนไม่มีหัว = ตั้งชื่อให้เอง · ตารางว่าง = null', () => {
    expect(tableToChart([['5', '6'], ['7', '8']])).toEqual({
      labels: ['รายการ 1', 'รายการ 2'],
      series: [
        { name: 'ชุดข้อมูล 1', values: [5, 7] },
        { name: 'ชุดข้อมูล 2', values: [6, 8] },
      ],
    });
    expect(tableToChart([['', ''], []])).toBeNull();
  });

  it('writeCells วางตารางที่ช่องค่าแล้วขยายแถวและชุดข้อมูลให้เอง', () => {
    const el = createChart(page, 'column');
    const out = writeCells(el, 4, 2, [
      ['1', '2'],
      ['3', '4'],
    ]);

    expect(out.labels).toHaveLength(5);
    expect(out.labels[4]).toBe('รายการ 5');
    expect(out.series).toHaveLength(3);
    expect(out.series[1].values.slice(3)).toEqual([1, 3]);
    expect(out.series[2]).toEqual({ name: 'ชุดข้อมูล 3', values: [0, 0, 0, 2, 4] });
    expect(out.colors.length).toBeGreaterThanOrEqual(3);
  });

  it('writeCells แถว 0 = ชื่อชุด · คอลัมน์ 0 = ชื่อรายการ · ช่องมุมไม่ใช้', () => {
    const el = createChart(page, 'column');
    const out = writeCells(el, 0, 0, [
      ['มุม', 'ปีนี้'],
      ['ม.ค.', 'abc'],
    ]);

    expect(out.series[0].name).toBe('ปีนี้');
    expect(out.labels[0]).toBe('ม.ค.');
    expect(out.series[0].values[0]).toBe(0);
  });
});

describe('เพิ่ม/ลบแถวและชุดข้อมูล', () => {
  it('เพิ่มและลบแถวให้ค่าทุกชุดยาวเท่ากัน · เหลือแถวสุดท้ายลบไม่ได้', () => {
    const el = createChart(page, 'column');
    const added = { ...el, ...addRow(el) };

    expect(added.labels).toHaveLength(5);
    expect(added.series.every((s) => s.values.length === 5)).toBe(true);

    const removed = { ...added, ...removeRow(added, 0) };

    expect(removed.labels[0]).toBe('รายการ 2');
    expect(removeRow({ ...el, labels: ['ก'], series: [{ name: 'a', values: [1] }] }, 0).labels).toEqual(['ก']);
  });

  it('ลบชุดข้อมูลแล้วสีของชุดที่เหลือไม่เลื่อนผิด (แท่ง) · วงกลมลบแถวพร้อมสีของชิ้นนั้น', () => {
    const bar = createChart(page, 'column');
    const withThird = { ...bar, ...addSeries(bar) };
    const afterRemove = removeSeries(withThird, 0);

    expect(afterRemove.series.map((s) => s.name)).toEqual(['ชุดข้อมูล 2', 'ชุดข้อมูล 3']);
    expect(afterRemove.colors[0]).toBe(withThird.colors[1]);

    const pie = createChart(page, 'pie');

    expect(removeRow(pie, 1).colors[1]).toBe(pie.colors[2]);
  });
});
