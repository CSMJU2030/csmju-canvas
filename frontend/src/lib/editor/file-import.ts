/// แยกชนิดไฟล์ที่ลากมาวาง/วางจากคลิปบอร์ด/เลือกจากเครื่อง แล้วบอกว่าจะใส่ลงดีไซน์แบบไหน
///
/// ไฟล์ทุกชนิดผ่านด่านนี้ก่อน: สื่อที่ระบบเก็บได้ส่งขึ้น assets · รูปชนิดที่เบราว์เซอร์เปิดได้แต่ระบบไม่เก็บ
/// (BMP AVIF ICO HEIC บนเบราว์เซอร์ที่เปิดได้) แปลงเป็น PNG ก่อน · ข้อความ/CSV กลายเป็นกล่องข้อความ/ตาราง ·
/// ชนิดอื่นตอบเหตุผลเป็นภาษาไทยว่าทำไมใส่ไม่ได้และควรทำอย่างไรแทน

import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS } from './table';
import { MAX_BYTES, uploadKindOf, type MediaKind } from './media';

export type ImportPlan =
  | { kind: 'upload'; media: MediaKind }
  /// รูปที่เบราว์เซอร์เปิดได้แต่ต้องแปลงเป็น PNG ก่อนส่งขึ้นระบบ
  | { kind: 'convert-image' }
  /// ไฟล์ฟอนต์ → อัปโหลดเป็น "ฟอนต์ของฉัน" (ใช้กับข้อความได้ทันที)
  | { kind: 'font' }
  | { kind: 'text' }
  | { kind: 'table'; delimiter: ',' | '\t' }
  | { kind: 'unsupported'; reason: string };

const EXT = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

const CONVERTIBLE_IMAGE = new Set(['bmp', 'avif', 'ico', 'heic', 'heif', 'jfif', 'pjpeg', 'apng']);
const CONVERTIBLE_MIME = new Set(['image/bmp', 'image/x-ms-bmp', 'image/avif', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/heic', 'image/heif', 'image/apng']);

/// ฟอนต์ที่อัปโหลดเองได้ (ตรวจซ้ำจากไบต์หัวไฟล์ที่หลังบ้าน) · ไม่เกิน 5 MB ตรงกับหลังบ้าน
export const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
export const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
export const MAX_FONT_BYTES = 5 * 1024 * 1024;
const FONT_MIME = /^(font\/(ttf|otf|sfnt|woff2?)|application\/(x-font-(ttf|otf|woff)|font-(woff2?|sfnt)|vnd\.ms-opentype))$/;

export function isFontFile(file: { name: string; type: string }): boolean {
  return FONT_EXTENSIONS.includes(EXT(file.name)) || FONT_MIME.test(file.type.toLowerCase());
}

/// ไฟล์ข้อความยาวเกินนี้ไม่ใส่เป็นกล่องข้อความ (หน้ากระดาษอ่านไม่ได้อยู่ดี)
export const MAX_TEXT_CHARS = 5000;
const MAX_TEXT_BYTES = 512 * 1024;

const HINTS: Record<string, string> = {
  pdf: 'ไฟล์ PDF ยังนำเข้าไม่ได้ — ส่งออกหน้าที่ต้องการเป็นรูป PNG/JPG ก่อน แล้วลากรูปมาวาง',
  doc: 'ไฟล์ Word ยังนำเข้าไม่ได้ — คัดลอกข้อความมาวาง (Ctrl+V) หรือบันทึกเป็นรูปก่อน',
  docx: 'ไฟล์ Word ยังนำเข้าไม่ได้ — คัดลอกข้อความมาวาง (Ctrl+V) หรือบันทึกเป็นรูปก่อน',
  ppt: 'ไฟล์ PowerPoint ยังนำเข้าไม่ได้ — ส่งออกสไลด์เป็นรูป PNG แล้วลากมาวาง',
  pptx: 'ไฟล์ PowerPoint ยังนำเข้าไม่ได้ — ส่งออกสไลด์เป็นรูป PNG แล้วลากมาวาง',
  xls: 'ไฟล์ Excel ยังนำเข้าไม่ได้โดยตรง — บันทึกเป็น CSV หรือคัดลอกช่องตารางมาวาง (Ctrl+V) จะได้ตาราง',
  xlsx: 'ไฟล์ Excel ยังนำเข้าไม่ได้โดยตรง — บันทึกเป็น CSV หรือคัดลอกช่องตารางมาวาง (Ctrl+V) จะได้ตาราง',
  mov: 'วิดีโอ MOV (QuickTime) หลายเบราว์เซอร์เล่นไม่ได้ — แปลงเป็น MP4 ก่อน',
  avi: 'วิดีโอ AVI เบราว์เซอร์เล่นไม่ได้ — แปลงเป็น MP4 ก่อน',
  mkv: 'วิดีโอ MKV เบราว์เซอร์เล่นไม่ได้ทุกตัว — แปลงเป็น MP4 หรือ WebM ก่อน',
  tif: 'รูป TIFF เบราว์เซอร์เปิดไม่ได้ — บันทึกเป็น PNG หรือ JPG ก่อน',
  tiff: 'รูป TIFF เบราว์เซอร์เปิดไม่ได้ — บันทึกเป็น PNG หรือ JPG ก่อน',
  psd: 'ไฟล์ Photoshop ยังนำเข้าไม่ได้ — ส่งออกเป็น PNG ก่อน',
  ai: 'ไฟล์ Illustrator ยังนำเข้าไม่ได้ — ส่งออกเป็น SVG หรือ PNG ก่อน',
  zip: 'ไฟล์ ZIP ต้องแตกไฟล์ก่อน แล้วลากไฟล์ข้างในมาวาง',
  rar: 'ไฟล์บีบอัดต้องแตกไฟล์ก่อน แล้วลากไฟล์ข้างในมาวาง',
  exe: 'ไฟล์โปรแกรมใส่ในดีไซน์ไม่ได้',
  ttc: 'ฟอนต์แบบชุด (TTC) ใช้ไม่ได้ — แยกเป็นไฟล์ TTF หรือ OTF ทีละแบบก่อน',
  fon: 'ฟอนต์แบบเก่าของ Windows (FON) ใช้ไม่ได้ — ใช้ไฟล์ TTF, OTF, WOFF หรือ WOFF2',
};

export function planImport(file: { name: string; type: string; size: number }): ImportPlan {
  const ext = EXT(file.name);
  const mime = file.type.toLowerCase();
  const media = uploadKindOf(file);

  if (media) {
    if (file.size > MAX_BYTES[media]) {
      const limit = Math.round(MAX_BYTES[media] / 1024 / 1024);

      return { kind: 'unsupported', reason: `“${file.name}” ใหญ่เกิน ${limit} MB` };
    }

    return { kind: 'upload', media };
  }

  if (isFontFile(file)) {
    return file.size > MAX_FONT_BYTES ? { kind: 'unsupported', reason: `“${file.name}” ใหญ่เกิน 5 MB (ฟอนต์)` } : { kind: 'font' };
  }

  if (CONVERTIBLE_MIME.has(mime) || CONVERTIBLE_IMAGE.has(ext)) {
    return file.size > MAX_BYTES.image * 3 ? { kind: 'unsupported', reason: `“${file.name}” ใหญ่เกินไป` } : { kind: 'convert-image' };
  }

  if (ext === 'csv' || mime === 'text/csv') return file.size > MAX_TEXT_BYTES ? tooBig(file.name) : { kind: 'table', delimiter: ',' };
  if (ext === 'tsv' || mime === 'text/tab-separated-values') return file.size > MAX_TEXT_BYTES ? tooBig(file.name) : { kind: 'table', delimiter: '\t' };
  if (ext === 'txt' || ext === 'md' || mime === 'text/plain' || mime === 'text/markdown') return file.size > MAX_TEXT_BYTES ? tooBig(file.name) : { kind: 'text' };

  return { kind: 'unsupported', reason: HINTS[ext] ?? `ไฟล์ “${file.name}” ใส่ในดีไซน์ไม่ได้ · รองรับรูป วิดีโอ เสียง ฟอนต์ ข้อความ (.txt) และตาราง (.csv)` };
}

function tooBig(name: string): ImportPlan {
  return { kind: 'unsupported', reason: `“${name}” ยาวเกินกว่าจะใส่ในหน้าเดียว` };
}

/// อ่าน CSV/TSV ตามกติกา RFC 4180 (ช่องในเครื่องหมายคำพูด · "" = คำพูดในช่อง · ขึ้นบรรทัดในช่องได้)
export function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop();

  return rows;
}

/// ตัดตารางให้อยู่ในขนาดที่ตารางของเรารับได้ และเติมช่องให้ทุกแถวยาวเท่ากัน
export function clampGrid(rows: string[][]): { rows: string[][]; truncated: boolean } {
  const cols = Math.min(MAX_TABLE_COLUMNS, Math.max(1, ...rows.map((r) => r.length)));
  const kept = rows.slice(0, MAX_TABLE_ROWS).map((r) => Array.from({ length: cols }, (_, i) => (r[i] ?? '').trim()));
  const truncated = rows.length > MAX_TABLE_ROWS || rows.some((r) => r.length > MAX_TABLE_COLUMNS);

  return { rows: kept, truncated };
}

/// ข้อความที่คัดลอกจาก Excel/Sheets (มีแท็บและหลายบรรทัด) ควรเป็นตาราง
export function looksTabular(text: string): boolean {
  const lines = text.replace(/\r\n?/g, '\n').trim().split('\n');

  return lines.length >= 2 && lines.every((l) => l.includes('\t'));
}

/// ข้อความยาว → ตัดที่ MAX_TEXT_CHARS · คืนว่าถูกตัดหรือไม่
export function clampText(text: string): { text: string; truncated: boolean } {
  const clean = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').trim();

  return clean.length > MAX_TEXT_CHARS ? { text: `${clean.slice(0, MAX_TEXT_CHARS)}…`, truncated: true } : { text: clean, truncated: false };
}

/// ชื่อไฟล์ PNG หลังแปลง (photo.heic → photo.png)
export function pngName(name: string): string {
  return `${name.replace(/\.[^.]+$/, '') || 'image'}.png`;
}
