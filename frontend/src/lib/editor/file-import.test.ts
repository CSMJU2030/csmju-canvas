import { describe, expect, it } from 'vitest';
import { clampGrid, clampText, looksTabular, parseDelimited, planImport, pngName } from './file-import';

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('planImport', () => {
  it('uploads images, video and audio the system stores', () => {
    expect(planImport(f('a.png', 'image/png'))).toEqual({ kind: 'upload', media: 'image' });
    expect(planImport(f('clip.mp4', 'video/mp4'))).toEqual({ kind: 'upload', media: 'video' });
    expect(planImport(f('song.mp3', 'audio/mpeg'))).toEqual({ kind: 'upload', media: 'audio' });
  });

  it('converts browser-readable images the system does not store', () => {
    expect(planImport(f('scan.bmp', 'image/bmp'))).toEqual({ kind: 'convert-image' });
    expect(planImport(f('photo.HEIC', ''))).toEqual({ kind: 'convert-image' });
  });

  it('turns text and csv into text boxes and tables', () => {
    expect(planImport(f('note.txt', 'text/plain'))).toEqual({ kind: 'text' });
    expect(planImport(f('data.csv', 'text/csv'))).toEqual({ kind: 'table', delimiter: ',' });
    expect(planImport(f('data.tsv', ''))).toEqual({ kind: 'table', delimiter: '\t' });
  });

  it('explains files it cannot place', () => {
    const pdf = planImport(f('report.pdf', 'application/pdf'));

    expect(pdf.kind).toBe('unsupported');
    expect(pdf.kind === 'unsupported' && pdf.reason).toContain('PDF');
    expect(planImport(f('x.unknown', 'application/octet-stream')).kind).toBe('unsupported');
    expect(planImport(f('big.png', 'image/png', 50 * 1024 * 1024)).kind).toBe('unsupported');
  });
});

describe('parseDelimited', () => {
  it('reads quoted cells, escaped quotes and line breaks inside cells', () => {
    expect(parseDelimited('﻿ชื่อ,คะแนน\r\n"สมชาย, ใจดี",90\n"บอก ""สวัสดี""","a\nb"\n', ',')).toEqual([
      ['ชื่อ', 'คะแนน'],
      ['สมชาย, ใจดี', '90'],
      ['บอก "สวัสดี"', 'a\nb'],
    ]);
  });

  it('reads tab separated text', () => {
    expect(parseDelimited('a\tb\nc\td', '\t')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('helpers', () => {
  it('detects spreadsheet text', () => {
    expect(looksTabular('a\tb\nc\td')).toBe(true);
    expect(looksTabular('สวัสดี\nครับ')).toBe(false);
  });

  it('pads ragged rows and caps the size', () => {
    expect(clampGrid([['a'], ['b', 'c']]).rows).toEqual([['a', ''], ['b', 'c']]);
    expect(clampGrid(Array.from({ length: 60 }, () => ['x'])).truncated).toBe(true);
  });

  it('caps long text and renames converted images', () => {
    expect(clampText('x'.repeat(6000)).truncated).toBe(true);
    expect(pngName('photo.heic')).toBe('photo.png');
  });
});
