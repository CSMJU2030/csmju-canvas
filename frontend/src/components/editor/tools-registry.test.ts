import { beforeEach, describe, expect, it } from 'vitest';
import { createShape, createText } from '@/lib/editor/factory';
import { useEditor } from '@/lib/editor/store';
import { blankDocument } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import { TOOLS, TOOL_GROUPS, blockedReason, searchTools, toolContext } from './tools-registry';

const PAGE = { width: 1920, height: 1080 };

function load(access: 'OWNER' | 'VIEW' = 'OWNER') {
  useEditor.getState().load({ designId: 'd1', title: 'งาน', designType: 'presentation', width: PAGE.width, height: PAGE.height, access, linkAccess: 'NONE' }, blankDocument());
}

const tool = (id: string) => TOOLS.find((t) => t.id === id)!;

describe('ศูนย์รวมเครื่องมือ', () => {
  beforeEach(() => load());

  it('มีเครื่องมืออย่างน้อย 100 รายการ id ไม่ซ้ำ และอยู่ในหมวดที่รู้จัก', () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
    expect(TOOLS.every((t) => TOOL_GROUPS.includes(t.group))).toBe(true);
  });

  it('ค้นหาได้ทั้งชื่อ คำค้น และหลายคำ', () => {
    expect(searchTools('qr').map((t) => t.id)).toContain('qr');
    expect(searchTools('ตาบอดสี').length).toBeGreaterThanOrEqual(4);
    expect(searchTools('จัด กลาง').map((t) => t.id)).toEqual(expect.arrayContaining(['align-center', 'center-page']));
    expect(searchTools('ไม่มีคำนี้แน่ ๆ')).toEqual([]);
  });

  it('บอกเหตุผลเมื่อยังใช้ไม่ได้ · ลิงก์ดูอย่างเดียวแก้งานไม่ได้', () => {
    expect(blockedReason(tool('bold'), toolContext())).toBe('เลือกข้อความก่อน');
    expect(blockedReason(tool('tidy'), toolContext())).toBe('เลือกอย่างน้อย 2 ชิ้น');
    expect(blockedReason(tool('zoom-in'), toolContext())).toBeNull();

    load('VIEW');
    expect(blockedReason(tool('add-rect'), toolContext())).toBe('เปิดแบบดูอย่างเดียว');
    expect(blockedReason(tool('word-count'), toolContext())).toBeNull();
  });

  it('จัดให้เป็นระเบียบ จัดกลางหน้า และขยายเต็มหน้า แก้ตำแหน่งจริง', async () => {
    const a = { ...createShape(PAGE, 'rect'), x: 10, y: 10, width: 100, height: 100 };
    const b = { ...createShape(PAGE, 'rect'), x: 600, y: 30, width: 100, height: 100 };

    useEditor.getState().addElements([a, b]);
    await tool('tidy').run(toolContext());

    const [ta, tb] = useEditor.getState().doc.pages[0].elements;

    expect([ta.x, ta.y, tb.x, tb.y]).toEqual([10, 10, 120, 10]);

    await tool('center-page').run(toolContext());
    expect(useEditor.getState().doc.pages[0].elements[0].x).toBe(Math.round((PAGE.width - 210) / 2));

    useEditor.getState().select([a.id]);
    await tool('fill-page').run(toolContext());
    expect(useEditor.getState().doc.pages[0].elements[0]).toMatchObject({ x: 0, y: 0, width: PAGE.width, height: PAGE.height });
  });

  it('เครื่องมือข้อความแก้ข้อความที่เลือก · ปฏิทินใส่ตารางเดือนปัจจุบัน', async () => {
    const t = { ...createText(PAGE, 'body'), text: 'a    b' };

    useEditor.getState().addElements([t]);
    await tool('clean-spaces').run(toolContext());
    await tool('bold').run(toolContext());

    const after = useEditor.getState().doc.pages[0].elements[0];

    expect(after).toMatchObject({ text: 'a b', fontWeight: 700 });

    await tool('calendar').run(toolContext());

    const table = useEditor.getState().doc.pages[0].elements[1];

    expect(table.type).toBe('table');
    expect(table.type === 'table' && table.cells[0][0].text).toBe('อา.');
  });

  it('เปิดแผงและการจำลองการมองเห็นสี', async () => {
    await tool('qr').run(toolContext());
    expect(useEditorUi.getState().panel).toBe('qr');

    await tool('animate-page').run(toolContext());
    expect(useEditorUi.getState()).toMatchObject({ panel: 'animate', animateTab: 'page' });

    await tool('vision-deuteranopia').run(toolContext());
    expect(useEditorUi.getState().visionSim).toBe('deuteranopia');
    await tool('vision-off').run(toolContext());
    expect(useEditorUi.getState().visionSim).toBeNull();
  });
});
