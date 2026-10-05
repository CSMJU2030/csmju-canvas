import { describe, expect, it } from 'vitest';
import { createTable } from './factory';
import {
  TABLE_LINE_HEIGHT,
  TABLE_PRESETS,
  cellAtPoint,
  cellColor,
  cellFill,
  fitTable,
  insertColumn,
  insertRow,
  mapTableColors,
  nextCell,
  normalizeFractions,
  removeColumn,
  removeRow,
  rowHeightFor,
  setCell,
  tableLayout,
  type LineCounter,
} from './table';
import { tableSvg } from './table-render';
import { normalizeDocument, type TableElement } from './types';

const PAGE = { width: 1000, height: 1000 };

/// ตัวนับบรรทัดจำลอง: ตัวอักษรละ 10px (ไม่ต้องมี canvas)
const counter: LineCounter = (text, width) => Math.max(1, Math.ceil((text.length * 10) / width));

function table(rows = 3, cols = 3, preset?: Parameters<typeof createTable>[3]): TableElement {
  return createTable(PAGE, rows, cols, preset);
}

describe('createTable', () => {
  it('สร้างตารางว่างกลางหน้า สัดส่วนแถว/คอลัมน์เท่ากัน', () => {
    const t = table(2, 4);

    expect(t.type).toBe('table');
    expect(t.cells).toHaveLength(2);
    expect(t.cells.every((row) => row.length === 4 && row.every((c) => c.text === ''))).toBe(true);
    expect(t.columns).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(t.rows).toEqual([0.5, 0.5]);
    expect(t.x).toBe(Math.round((PAGE.width - t.width) / 2));
    expect(t.height).toBe(Math.round(rowHeightFor(t, 1) * 2));
  });

  it('รูปแบบสำเร็จรูปทุกแบบใช้สี rgb() และสร้างได้', () => {
    for (const preset of TABLE_PRESETS) {
      const t = table(3, 3, preset.key);

      expect(t.header).toBe(preset.header);
      expect(t.borderColor.startsWith('rgb(')).toBe(true);
    }
  });

  it('รูปแบบ "พื้นอ่อนเส้นขาว" ใส่สีพื้นเฉพาะช่องเนื้อหา ไม่ใส่หัวตาราง', () => {
    const t = table(3, 2, 'soft');

    expect(t.cells[0][0].fill).toBeUndefined();
    expect(t.cells[1][0].fill).toBe(t.cells[2][1].fill);
    expect(cellFill(t, 0, 0)).toBe(t.headerFill);
  });
});

describe('สีของช่อง', () => {
  it('สีของช่องทับหัวตาราง ทับแถวสลับ', () => {
    const t = table(4, 2, 'striped');

    expect(cellFill(t, 0, 0)).toBe(t.headerFill);
    expect(cellFill(t, 1, 0)).toBeNull();
    expect(cellFill(t, 2, 0)).toBe(t.stripeFill);

    const painted = { ...t, ...setCell(t, { row: 0, col: 1 }, { fill: 'rgb(1 2 3)', color: 'rgb(4 5 6)' }) };

    expect(cellFill(painted, 0, 1)).toBe('rgb(1 2 3)');
    expect(cellColor(painted, 0, 1)).toBe('rgb(4 5 6)');
    expect(cellColor(painted, 0, 0)).toBe(t.headerColor);
  });

  it('แทนที่สีเปลี่ยนทุกสีของตาราง', () => {
    const t = table(2, 2, 'header');
    const swapped = mapTableColors(t, (c) => (c === t.headerFill ? 'rgb(9 9 9)' : c));

    expect(swapped.headerFill).toBe('rgb(9 9 9)');
    expect(swapped.color).toBe(t.color);
  });
});

describe('เพิ่ม/ลบแถวและคอลัมน์', () => {
  it('แทรกแถวกลางตาราง: แถวเดิมสูงเท่าเดิม กล่องสูงขึ้น', () => {
    const t = { ...table(2, 2), height: 200, rows: [0.5, 0.5] };
    const patch = insertRow(t, 1);

    expect(patch.cells).toHaveLength(3);
    expect(patch.cells[1].every((c) => c.text === '')).toBe(true);
    expect(patch.height).toBeCloseTo(300);
    expect(patch.rows.map((f) => f * patch.height)).toEqual([100, 100, 100].map((v) => expect.closeTo(v, 1)));
  });

  it('ลบแถว: กล่องเตี้ยลง และต้องเหลืออย่างน้อยหนึ่งแถว', () => {
    const t = { ...table(2, 2), height: 300, rows: [2 / 3, 1 / 3] };
    const withText = { ...t, ...setCell(t, { row: 1, col: 0 }, { text: 'คงอยู่' }) };
    const patch = removeRow(withText, 0);

    expect(patch.cells).toHaveLength(1);
    expect(patch.cells[0][0].text).toBe('คงอยู่');
    expect(patch.height).toBeCloseTo(100);
    expect(patch.rows).toEqual([1]);

    const single = { ...withText, ...patch };

    expect(removeRow(single, 0).cells).toHaveLength(1);
  });

  it('แทรกคอลัมน์: ความกว้างตารางคงเดิม สัดส่วนรวมกันได้ 1', () => {
    const t = table(2, 2);
    const patch = insertColumn(t, 0);

    expect(patch.cells.every((row) => row.length === 3 && row[0].text === '')).toBe(true);
    expect(patch.columns.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(patch.columns[0]).toBeCloseTo(1 / 3);
  });

  it('ลบคอลัมน์: คอลัมน์ที่เหลือขยายเต็ม และต้องเหลืออย่างน้อยหนึ่งคอลัมน์', () => {
    const t = { ...table(1, 3), columns: [0.5, 0.25, 0.25] };
    const patch = removeColumn(t, 0);

    expect(patch.cells[0]).toHaveLength(2);
    expect(patch.columns).toEqual([0.5, 0.5]);
    expect(removeColumn({ ...table(1, 1) }, 0).cells[0]).toHaveLength(1);
  });

  it('Tab ไปช่องถัดไปตามลำดับการอ่าน และหยุดที่สุดตาราง', () => {
    const t = table(2, 2);

    expect(nextCell(t, { row: 0, col: 1 }, 1)).toEqual({ row: 1, col: 0 });
    expect(nextCell(t, { row: 1, col: 0 }, -1)).toEqual({ row: 0, col: 1 });
    expect(nextCell(t, { row: 1, col: 1 }, 1)).toBeNull();
    expect(nextCell(t, { row: 0, col: 0 }, -1)).toBeNull();
  });
});

describe('การจัดวาง', () => {
  it('คอลัมน์ตามสัดส่วนความกว้าง · แถวขยายเมื่อข้อความยาว', () => {
    const base = { ...table(2, 2), x: 0, y: 0, width: 200, columns: [0.75, 0.25], fontSize: 10 };
    const minRow = rowHeightFor(base, 1);
    const t = { ...base, height: minRow * 2, rows: [0.5, 0.5] };
    const long = { ...t, ...setCell(t, { row: 1, col: 1 }, { text: 'x'.repeat(12) }) };
    const layout = tableLayout(long, counter);

    expect(layout.cols).toEqual([{ x: 0, width: 150 }, { x: 150, width: 50 }]);
    // ช่องกว้าง 50 หักขอบ 2 × 5 = 40px → 120px ของข้อความ = 3 บรรทัด
    expect(layout.rows[1].height).toBeCloseTo(3 * 10 * TABLE_LINE_HEIGHT + 10);
    expect(layout.rows[0].height).toBeCloseTo(minRow);
    expect(layout.height).toBeCloseTo(minRow + layout.rows[1].height);
  });

  it('fitTable ขยายกล่องให้พอดีข้อความ แล้วคำนวณสัดส่วนแถวใหม่ · พอดีอยู่แล้วคืนตัวเดิม', () => {
    const base = { ...table(2, 1), x: 0, y: 0, width: 60, fontSize: 10 };
    const t = { ...base, height: rowHeightFor(base, 1) * 2, rows: [0.5, 0.5] };

    expect(fitTable(t, counter)).toBe(t);

    const long = { ...t, ...setCell(t, { row: 0, col: 0 }, { text: 'x'.repeat(10) }) };
    const fitted = fitTable(long, counter);

    expect(fitted.height).toBeGreaterThan(t.height);
    expect(fitted.rows[0]).toBeGreaterThan(fitted.rows[1]);
    expect(fitted.rows[0] + fitted.rows[1]).toBeCloseTo(1, 3);
    expect(fitTable(fitted, counter).height).toBeCloseTo(fitted.height, 1);
  });

  it('หาช่องจากจุดบนหน้า รวมตารางที่หมุน', () => {
    const t = { ...table(2, 2), x: 0, y: 0, width: 200, height: 100, rows: [0.5, 0.5], columns: [0.5, 0.5], fontSize: 10 };
    const layout = tableLayout(t, counter);

    expect(cellAtPoint(t, layout, { x: 150, y: 20 })).toEqual({ row: 0, col: 1 });
    expect(cellAtPoint(t, layout, { x: 300, y: 20 })).toBeNull();

    // หมุน 180° — มุมบนขวาบนจอคือช่องล่างซ้ายของตาราง
    const flipped = { ...t, rotation: 180 };

    expect(cellAtPoint(flipped, tableLayout(flipped, counter), { x: 150, y: 20 })).toEqual({ row: 1, col: 0 });
  });

  it('normalizeFractions ซ่อมสัดส่วนที่ผิดหรือจำนวนไม่ตรง', () => {
    expect(normalizeFractions([1, 3], 2)).toEqual([0.25, 0.75]);
    expect(normalizeFractions([1, 2, 3], 2)).toEqual([0.5, 0.5]);
    expect(normalizeFractions([0.5, -1], 2)).toEqual([0.5, 0.5]);
    expect(normalizeFractions('x', 3)).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });
});

describe('normalizeDocument กับตาราง', () => {
  it('ซ่อมตารางที่บันทึกไว้: แถวยาวไม่เท่ากัน ค่าขาด ข้อความไม่ใช่สตริง', () => {
    const doc = normalizeDocument({
      version: 1,
      pages: [
        {
          id: 'p1',
          background: null,
          elements: [
            {
              id: 't1',
              type: 'table',
              x: 10,
              y: 20,
              width: 300,
              height: 90,
              cells: [[{ text: 'หัว' }, { text: 7 }], [{ text: 'แถวสั้น', fill: 'rgb(1 2 3)' }]],
              columns: [2, 2],
              lines: 'zigzag',
            },
          ],
        },
      ],
    });
    const t = doc.pages[0].elements[0] as TableElement;

    expect(t.cells).toEqual([[{ text: 'หัว' }, { text: '7' }], [{ text: 'แถวสั้น', fill: 'rgb(1 2 3)' }, { text: '' }]]);
    expect(t.columns).toEqual([0.5, 0.5]);
    expect(t.rows).toEqual([0.5, 0.5]);
    expect(t.lines).toBe('all');
    expect(t.align).toBe('left');
    expect(t.header).toBe(false);
    expect(t.fontSize).toBeGreaterThan(0);
    expect(t).toMatchObject({ rotation: 0, opacity: 1, locked: false, hidden: false, groupId: null });
  });

  it('ตารางที่ไม่มีช่องถูกข้ามเหมือนชนิดที่ไม่รู้จัก', () => {
    const doc = normalizeDocument({
      pages: [{ id: 'p', background: null, elements: [{ id: 'a', type: 'table', cells: [] }, { id: 'b', type: 'table' }] }],
    });

    expect(doc.pages[0].elements).toHaveLength(0);
  });
});

describe('tableSvg', () => {
  it('ส่งออกเป็นเวกเตอร์: สีพื้นหัวตาราง เส้นตาราง และข้อความที่ escape แล้ว', () => {
    const t = table(2, 2, 'header');
    const svg = tableSvg({ ...t, ...setCell(t, { row: 1, col: 0 }, { text: 'A < B & "C"' }) });

    expect(svg).toContain(`fill="${t.headerFill}"`);
    expect(svg).toContain(`stroke="${t.borderColor}"`);
    expect(svg).toContain('A &lt; B &amp; &quot;C&quot;');
  });

  it('ไม่มีเส้นและไม่มีข้อความ = ไม่มี path และ text', () => {
    const t = { ...table(2, 2, 'grid'), lines: 'none' as const };

    expect(tableSvg(t)).not.toContain('<path');
    expect(tableSvg(t)).not.toContain('<text');
  });
});
