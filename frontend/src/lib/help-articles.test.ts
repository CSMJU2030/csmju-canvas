import { describe, expect, it } from 'vitest';
import { searchHelp } from './help-articles';

describe('searchHelp', () => {
  it('หาคู่มือการส่งออกจากคำว่า png', () => {
    expect(searchHelp('png')[0]?.slug).toBe('export');
  });

  it('หาคู่มือถังขยะจากคำว่า กู้คืน', () => {
    expect(searchHelp('กู้คืน').map((a) => a.slug)).toContain('projects-trash');
  });

  it('คำค้นว่างไม่คืนอะไร', () => {
    expect(searchHelp('   ')).toEqual([]);
  });

  it('คำที่ไม่เกี่ยวกับระบบไม่คืนผลลัพธ์', () => {
    expect(searchHelp('ราคาทองคำวันนี้')).toEqual([]);
  });
});
