import { describe, expect, it } from 'vitest';
import { iconMarkup, matchIcon, matchPhoto, matchSticker, searchTerms } from './library';

describe('library search', () => {
  it('maps Thai keywords to English tags', () => {
    expect(searchTerms('หัวใจ')).toContain('heart');
    expect(searchTerms('  ')).toEqual([]);
  });

  it('matches icons, stickers and photos by translated terms', () => {
    const terms = searchTerms('ดอกไม้');

    expect(matchIcon({ n: 'flower', c: 'Nature', t: 'plant', d: '' }, terms)).toBe(true);
    expect(matchIcon({ n: 'car', c: 'Vehicles', t: 'auto', d: '' }, terms)).toBe(false);
    expect(matchSticker({ id: '1f337', g: 'สัตว์และธรรมชาติ', n: 'tulip', ch: '' }, searchTerms('ธรรมชาติ'))).toBe(true);
    expect(matchPhoto({ id: 'cma-1', g: 'ดอกไม้', title: 'Peonies', credit: '', date: '', w: 1, h: 1, source: '' }, terms)).toBe(true);
  });

  it('wraps icon nodes in a currentColor SVG', () => {
    const svg = iconMarkup({ d: '<path d="M0 0"/>' }, 1.5);

    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('stroke-width="1.5"');
  });
});
