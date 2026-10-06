/// สไตล์ทั้งงาน (แบบ "สไตล์" ของ Canva): ชุดสี 5 สี + ฟอนต์หัวข้อ/เนื้อหา ที่ใช้เปลี่ยนทั้งงานได้ในครั้งเดียว
///
/// การเปลี่ยนสีดูจากบทบาทของสีแต่ละจุด ไม่ได้แทนทีละสีแบบสุ่ม:
///   สีพื้นหลังของหน้า → สีที่ 1 · สีตัวอักษรที่ใช้มากสุด → สีที่ 2 · สีพื้น/เส้น/ไอคอนอื่น ๆ → สีที่ 3–5 ตามความถี่
/// ชิ้นที่ล็อกไม่เปลี่ยน · ตาราง/แผนภูมิเปลี่ยนตามบทบาทเดียวกัน

import { mapTableColors } from './table';
import type { CanvasElement, DesignDocument, Page, TextElement } from './types';

export interface DesignStyle {
  id: string;
  name: string;
  /// [พื้นหลัง, ตัวอักษร, เน้น 1, เน้น 2, เน้น 3]
  colors: [string, string, string, string, string];
  heading: string;
  body: string;
}

export const DESIGN_STYLES: DesignStyle[] = [
  { id: 'mju-green', name: 'เขียวแม่โจ้', colors: ['rgb(246 250 245)', 'rgb(20 45 30)', 'rgb(22 101 52)', 'rgb(234 179 8)', 'rgb(134 190 112)'], heading: 'Kanit', body: 'Sarabun' },
  { id: 'cs-blue', name: 'น้ำเงินวิทย์คอม', colors: ['rgb(255 255 255)', 'rgb(15 23 42)', 'rgb(0 76 153)', 'rgb(56 182 255)', 'rgb(255 189 89)'], heading: 'Prompt', body: 'IBM Plex Sans Thai' },
  { id: 'night', name: 'กลางคืน', colors: ['rgb(15 23 42)', 'rgb(241 245 249)', 'rgb(99 102 241)', 'rgb(236 72 153)', 'rgb(45 212 191)'], heading: 'Chakra Petch', body: 'Noto Sans Thai' },
  { id: 'pastel', name: 'พาสเทล', colors: ['rgb(255 247 237)', 'rgb(68 64 60)', 'rgb(251 146 160)', 'rgb(147 197 253)', 'rgb(190 242 100)'], heading: 'Mitr', body: 'Mali' },
  { id: 'formal', name: 'ทางการ', colors: ['rgb(255 255 255)', 'rgb(30 41 59)', 'rgb(127 29 29)', 'rgb(180 140 60)', 'rgb(100 116 139)'], heading: 'Pridi', body: 'Sarabun' },
  { id: 'certificate', name: 'เกียรติบัตร', colors: ['rgb(255 251 235)', 'rgb(66 32 6)', 'rgb(161 98 7)', 'rgb(30 64 175)', 'rgb(212 175 55)'], heading: 'Charmonman', body: 'Taviraj' },
  { id: 'tech', name: 'เทคโนโลยี', colors: ['rgb(3 7 18)', 'rgb(226 232 240)', 'rgb(34 211 238)', 'rgb(168 85 247)', 'rgb(74 222 128)'], heading: 'Orbitron', body: 'Bai Jamjuree' },
  { id: 'sunset', name: 'พระอาทิตย์ตก', colors: ['rgb(255 237 213)', 'rgb(67 20 7)', 'rgb(234 88 12)', 'rgb(219 39 119)', 'rgb(250 204 21)'], heading: 'Chonburi', body: 'Prompt' },
  { id: 'ocean', name: 'ทะเล', colors: ['rgb(240 249 255)', 'rgb(12 74 110)', 'rgb(2 132 199)', 'rgb(20 184 166)', 'rgb(253 224 71)'], heading: 'Anuphan', body: 'Anuphan' },
  { id: 'forest', name: 'ป่า', colors: ['rgb(236 253 245)', 'rgb(6 78 59)', 'rgb(5 150 105)', 'rgb(161 98 7)', 'rgb(132 204 22)'], heading: 'Mitr', body: 'Noto Sans Thai' },
  { id: 'mono', name: 'ขาวดำ', colors: ['rgb(255 255 255)', 'rgb(10 10 10)', 'rgb(64 64 64)', 'rgb(163 163 163)', 'rgb(229 229 229)'], heading: 'Bebas Neue', body: 'Inter' },
  { id: 'retro', name: 'เรโทร', colors: ['rgb(254 243 199)', 'rgb(68 40 20)', 'rgb(220 38 38)', 'rgb(13 148 136)', 'rgb(245 158 11)'], heading: 'Righteous', body: 'Kodchasan' },
  { id: 'kids', name: 'สดใส', colors: ['rgb(255 255 255)', 'rgb(30 27 75)', 'rgb(239 68 68)', 'rgb(59 130 246)', 'rgb(250 204 21)'], heading: 'Itim', body: 'Mali' },
  { id: 'minimal', name: 'มินิมอล', colors: ['rgb(250 250 249)', 'rgb(41 37 36)', 'rgb(120 113 108)', 'rgb(214 211 209)', 'rgb(234 88 12)'], heading: 'DM Sans', body: 'Noto Sans Thai' },
  { id: 'royal', name: 'หรูหรา', colors: ['rgb(23 23 23)', 'rgb(250 250 250)', 'rgb(202 160 82)', 'rgb(107 33 168)', 'rgb(115 115 115)'], heading: 'Cinzel', body: 'Noto Serif Thai' },
  { id: 'handmade', name: 'งานฝีมือ', colors: ['rgb(255 250 240)', 'rgb(68 64 60)', 'rgb(190 18 60)', 'rgb(21 128 61)', 'rgb(217 119 6)'], heading: 'Sriracha', body: 'Itim' },
];

type Role = 'background' | 'text' | 'accent';

/// ความถี่ของสีแต่ละบทบาท (นับเฉพาะชิ้นที่ไม่ล็อก) — สีเดียวกันอาจอยู่หลายบทบาท
export function colorRoles(doc: DesignDocument, size: Size): Record<Role, Map<string, number>> {
  const roles: Record<Role, Map<string, number>> = { background: new Map(), text: new Map(), accent: new Map() };
  const add = (role: Role, color: string | null | undefined, weight = 1) => {
    if (!color || color === 'transparent') return;
    roles[role].set(color, (roles[role].get(color) ?? 0) + weight);
  };

  for (const page of doc.pages) {
    add('background', page.background, 10);

    for (const el of page.elements) {
      if (el.locked || el.hidden) continue;
      walkColors(el, add, coversPage(el, page, size));
    }
  }

  return roles;
}

type Size = { width: number; height: number };

function coversPage(el: CanvasElement, page: Page, base: Size) {
  const w = page.width ?? base.width;
  const h = page.height ?? base.height;

  return el.width * el.height >= w * h * 0.6;
}

function walkColors(el: CanvasElement, add: (role: Role, color: string | null | undefined, weight?: number) => void, isBackdrop: boolean) {
  switch (el.type) {
    case 'text':
      add('text', el.color, Math.max(1, el.text.length / 20));
      break;
    case 'shape':
      // รูปทรงที่คลุมเกือบทั้งหน้าคือพื้นหลัง
      add(isBackdrop ? 'background' : 'accent', el.fill, isBackdrop ? 10 : 1);
      add('accent', el.stroke);
      break;
    case 'svg':
    case 'path':
      add('accent', el.color);
      break;
    case 'chart':
      el.colors.forEach((c) => add('accent', c));
      break;
    case 'table': {
      mapTableColors(el, (c) => {
        add('accent', c);
        return c;
      });
      break;
    }
  }
}

/// จับคู่สีเดิม → สีในชุด ตามบทบาท
export function paletteMapping(doc: DesignDocument, colors: string[], size: Size): Record<Role, Map<string, string>> {
  const roles = colorRoles(doc, size);
  const byUse = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const accents = colors.slice(2).length > 0 ? colors.slice(2) : colors;
  const out: Record<Role, Map<string, string>> = { background: new Map(), text: new Map(), accent: new Map() };

  byUse(roles.background).forEach((c, i) => out.background.set(c, i === 0 ? colors[0] : accents[(i - 1) % accents.length]));
  byUse(roles.text).forEach((c, i) => out.text.set(c, i === 0 ? colors[1] : accents[(i - 1) % accents.length]));
  byUse(roles.accent).forEach((c, i) => out.accent.set(c, accents[i % accents.length]));

  return out;
}

/// เปลี่ยนสีทั้งงานตามการจับคู่ (แทนทีเดียวทุกจุด ไม่แทนซ้อนกันเป็นทอด ๆ)
export function recolorDocument(doc: DesignDocument, mapping: Record<Role, Map<string, string>>, size: Size): DesignDocument {
  const swap = (role: Role) => (color: string | null | undefined) => (color ? (mapping[role].get(color) ?? color) : color);

  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      background: swap('background')(page.background) ?? null,
      elements: page.elements.map((el): CanvasElement => {
        if (el.locked) return el;

        switch (el.type) {
          case 'text':
            return { ...el, color: swap('text')(el.color)! };
          case 'shape': {
            const role: Role = coversPage(el, page, size) ? 'background' : 'accent';

            return { ...el, fill: swap(role)(el.fill) ?? null, stroke: swap('accent')(el.stroke) ?? null };
          }
          case 'svg':
          case 'path':
            return { ...el, color: swap('accent')(el.color)! };
          case 'chart':
            return { ...el, colors: el.colors.map((c) => swap('accent')(c)!) };
          case 'table':
            return mapTableColors(el, swap('accent'));
          default:
            return el;
        }
      }),
    })),
  };
}

/// ใส่ฟอนต์หัวข้อกับข้อความที่ใหญ่ (≥ 60% ของข้อความใหญ่สุดในหน้า หรือตัวหนาที่ใหญ่กว่าค่ากลาง) · ที่เหลือใช้ฟอนต์เนื้อหา
export function applyStyleFonts(doc: DesignDocument, heading: string, body: string): DesignDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => {
      const texts = page.elements.filter((el): el is TextElement => el.type === 'text' && !el.locked);

      if (texts.length === 0) return page;

      const sizes = texts.map((t) => t.fontSize).sort((a, b) => a - b);
      const max = sizes[sizes.length - 1];
      const median = sizes[Math.floor(sizes.length / 2)];

      return {
        ...page,
        elements: page.elements.map((el) => {
          if (el.type !== 'text' || el.locked) return el;

          const isHeading = el.fontSize >= max * 0.6 || (el.fontWeight === 700 && el.fontSize > median);

          return { ...el, fontFamily: isHeading ? heading : body };
        }),
      };
    }),
  };
}

/// สลับสีเน้นของชุดไปเรื่อย ๆ (ปุ่ม "สุ่มสี") — พื้นหลังกับตัวอักษรคงเดิมเพื่อให้ยังอ่านออก
export function rotateAccents(colors: string[], step: number): string[] {
  const accents = colors.slice(2);

  if (accents.length < 2) return colors;

  const k = ((step % accents.length) + accents.length) % accents.length;

  return [colors[0], colors[1], ...accents.slice(k), ...accents.slice(0, k)];
}
