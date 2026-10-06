import { describe, expect, it } from 'vitest';
import {
  FONT_FAMILIES, POPULAR_FONT_IDS, assetFontId, assetIdOfFont, cssFamily, fontLabel, isPopularFont, popularFirst, shortFontLabel, userFontName, useUserFonts,
} from './fonts';

const UUID = '3f2a8c4e-1b2d-4e5f-9a6b-7c8d9e0f1a2b';

describe('font library', () => {
  it('has unique ids, files and a script for every new family', () => {
    expect(new Set(FONT_FAMILIES.map((f) => f.id)).size).toBe(FONT_FAMILIES.length);
    expect(FONT_FAMILIES.length).toBeGreaterThanOrEqual(100);
    expect(FONT_FAMILIES.some((f) => f.style === 'mono')).toBe(true);
    expect(POPULAR_FONT_IDS.every((id) => FONT_FAMILIES.some((f) => f.id === id))).toBe(true);
  });

  it('orders popular fonts first and keeps the rest in their original order', () => {
    const list = [{ id: 'Lora' }, { id: 'Space Mono' }, { id: 'Kanit' }, { id: 'Courgette' }];

    expect(popularFirst(list).map((f) => f.id)).toEqual(['Kanit', 'Lora', 'Space Mono', 'Courgette']);
    expect(isPopularFont('Sarabun')).toBe(true);
    expect(isPopularFont('Courgette')).toBe(false);
  });
});

describe('uploaded fonts ("asset:<uuid>")', () => {
  it('parses only valid v4 uuids', () => {
    expect(assetIdOfFont(assetFontId(UUID))).toBe(UUID);
    expect(assetIdOfFont(`asset:${UUID.toUpperCase()}`)).toBe(UUID);
    expect(assetIdOfFont('asset:not-a-uuid')).toBeNull();
    expect(assetIdOfFont('Kanit')).toBeNull();
    expect(assetIdOfFont(undefined)).toBeNull();
  });

  it('gets its own CSS family with the Thai fallback, like library fonts', () => {
    expect(cssFamily(assetFontId(UUID))).toBe(`"CSC asset-${UUID}", "CSC Noto Sans Thai", sans-serif`);
    expect(cssFamily('Kanit')).toBe('"CSC Kanit", "CSC Noto Sans Thai", sans-serif');
  });

  it('shows the uploaded file name when known, otherwise a neutral label', () => {
    expect(fontLabel(assetFontId(UUID), {})).toBe('ฟอนต์ที่อัปโหลด');
    useUserFonts.getState().setNames([{ id: UUID, fileName: 'ลายมือครู.otf' }]);
    expect(fontLabel(assetFontId(UUID))).toBe('ลายมือครู');
    expect(shortFontLabel('Permanent Marker')).toBe('Permanent Marker');
    expect(userFontName('.woff2')).toBe('ฟอนต์ของฉัน');
  });
});
