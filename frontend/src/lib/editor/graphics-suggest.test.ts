import { describe, expect, it } from 'vitest';
import {
  designTerms, designWords, gradientItems, graphicColor, GRAPHIC_COLORS, parseGradientId, recommendedGraphics, RECOMMENDED_GRAPHICS,
  scoreIcon, suggestGraphics, tokenize,
} from './graphics-suggest';
import { DEFAULT_GRADIENTS } from './paint';
import type { DesignDocument, TextElement } from './types';

const text = (value: string): TextElement => ({
  id: value, type: 'text', name: '', x: 0, y: 0, width: 100, height: 20, rotation: 0, opacity: 1, locked: false, hidden: false, groupId: null,
  text: value, fontFamily: 'x', fontSize: 12, fontWeight: 400, italic: false, underline: false, align: 'left', lineHeight: 1.4, letterSpacing: 0, color: 'rgb(0 0 0)',
});

const doc = (...texts: string[]): DesignDocument => ({ version: 1, pages: [{ id: 'p', background: null, elements: texts.map(text) }] });

const icon = (n: string, t = '') => ({ n, c: 'Nature', t: `${t} ${n.replace(/-/g, ' ')}`, d: '' });

describe('tokenize / designWords', () => {
  it('ตัดคำไทยและอังกฤษ ทิ้งคำตั้งต้นของกล่องข้อความและตัวเลข', () => {
    const words = tokenize('เพิ่มหัวเรื่อง Coffee Shop 2026');

    expect(words).toContain('coffee');
    expect(words).toContain('shop');
    expect(words).not.toContain('2026');
    expect(words).not.toContain('เพิ่ม');
  });

  it('เรียงคำที่พบบ่อยก่อน และให้น้ำหนักชื่องาน', () => {
    const words = designWords(doc('music festival', 'music night'), 'Concert poster');

    expect(words[0]).toBe('concert');
    expect(words).toContain('music');
    expect(words.indexOf('music')).toBeLessThan(words.indexOf('festival'));
  });

  it('งานว่างไม่มีคำ', () => {
    expect(designWords(doc(), '')).toEqual([]);
  });
});

describe('designTerms', () => {
  it('แปลคำไทยที่รู้จักเป็นแท็กอังกฤษ และเติมหัวข้อของประเภทงาน', () => {
    const terms = designTerms(['ดอกไม้', 'กาแฟ'], 'certificate');

    expect(terms).toEqual(expect.arrayContaining(['flower', 'coffee', 'award']));
    // คำไทยเองไม่อยู่ในแท็กของกราฟิก จึงไม่ใส่
    expect(terms).not.toContain('ดอกไม้');
  });

  it('ไม่มีคำและประเภทงานไม่รู้จัก = ว่าง (ไม่แสดงหัวข้อ)', () => {
    expect(designTerms([], 'unknown')).toEqual([]);
  });

  it('ไม่ใส่คำซ้ำ', () => {
    const terms = designTerms(['heart', 'heart', 'หัวใจ'], '');

    expect(terms.filter((t) => t === 'heart')).toHaveLength(1);
  });
});

describe('suggestGraphics', () => {
  const icons = [icon('coffee', 'drink cup'), icon('coffee-off', 'drink'), icon('cup', 'coffee drink'), icon('car', 'vehicle'), icon('flower', 'plant')];

  it('ชื่อตรงคำได้คะแนนสูงสุด แท็กตรงรองลงมา แบบ -off ถูกลดคะแนน', () => {
    const result = suggestGraphics(icons, ['coffee']).map((i) => i.n);

    expect(result[0]).toBe('coffee');
    expect(result.indexOf('cup')).toBeLessThan(result.indexOf('coffee-off'));
    expect(result).not.toContain('car');
  });

  it('คำที่มาก่อนมีน้ำหนักกว่า', () => {
    expect(scoreIcon(icon('flower'), ['flower', 'coffee'])).toBeGreaterThan(scoreIcon(icon('coffee'), ['flower', 'coffee']));
  });

  it('ไม่มีคำ = ไม่มีคำแนะนำ · ผลคงที่ทุกครั้ง', () => {
    expect(suggestGraphics(icons, [])).toEqual([]);
    expect(suggestGraphics(icons, ['drink'])).toEqual(suggestGraphics([...icons].reverse(), ['drink']));
  });
});

describe('recommended / colours / gradients', () => {
  it('ชุดแนะนำเรียงตามที่คัดไว้ และข้ามชื่อที่ไม่มีในคลัง', () => {
    const result = recommendedGraphics([icon('star'), icon('heart'), icon('not-in-list')]).map((i) => i.n);

    expect(result).toEqual(['heart', 'star']);
    expect(new Set(RECOMMENDED_GRAPHICS).size).toBe(RECOMMENDED_GRAPHICS.length);
  });

  it('สีของกราฟิกคงที่ตามชื่อและเป็น rgb()', () => {
    expect(graphicColor('heart')).toBe(graphicColor('heart'));
    expect(GRAPHIC_COLORS).toContain(graphicColor('rocket'));
    expect(graphicColor('rocket')).toMatch(/^rgb\(/);
  });

  it('กราฟิกไล่เฉดสี: id อ่านกลับได้ และชุดเต็มไม่ซ้ำ', () => {
    const all = gradientItems();
    const featured = gradientItems(true);

    expect(new Set(all.map((g) => g.id)).size).toBe(all.length);
    expect(featured).toHaveLength(DEFAULT_GRADIENTS.length - 2);
    expect(all.length).toBeGreaterThan(featured.length);

    for (const item of all) expect(parseGradientId(item.id)).toEqual({ paint: item.paint, shape: item.shape });

    expect(parseGradientId('gradient:999:star')).toBeNull();
    expect(parseGradientId('gradient:3:blob')).toBeNull();
  });
});
