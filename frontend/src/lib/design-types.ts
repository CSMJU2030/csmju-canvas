import type { LucideIcon } from 'lucide-react';
import {
  Clapperboard, Code, FileText, Image as ImageIcon, Mail, Monitor, Presentation, Printer, Sheet,
  Share2, StickyNote,
} from 'lucide-react';

/// ประเภทงานและขนาดผืนผ้าใบ (พิกเซล · กระดาษ A ใช้ 96 dpi)
///
/// `available: false` = ประเภทที่บรีฟวางไว้ในช่วงถัดไป (วิดีโอ ชีต โค้ด เว็บไซต์ อีเมล)
/// แสดงในป๊อปอัปพร้อมบอกตรง ๆ ว่ายังไม่เปิด และกดสร้างไม่ได้ — ไม่มีปุ่มหลอก

export interface DesignType {
  key: string;
  label: string;
  width: number;
  height: number;
  group: DesignGroupKey;
}

export type DesignGroupKey =
  | 'presentation'
  | 'social'
  | 'photo'
  | 'video'
  | 'print'
  | 'document'
  | 'whiteboard'
  | 'sheet'
  | 'code'
  | 'website'
  | 'email';

export interface DesignGroup {
  key: DesignGroupKey;
  label: string;
  icon: LucideIcon;
  /// คลาสสีพื้นของไอคอน (token ของ chart palette)
  tone: string;
  available: boolean;
}

export const DESIGN_GROUPS: DesignGroup[] = [
  { key: 'presentation', label: 'พรีเซนเทชั่น', icon: Presentation, tone: 'bg-type-orange', available: true },
  { key: 'social', label: 'โซเชียลมีเดีย', icon: Share2, tone: 'bg-type-red', available: true },
  { key: 'photo', label: 'แต่งรูป', icon: ImageIcon, tone: 'bg-type-blue', available: true },
  { key: 'print', label: 'งานพิมพ์', icon: Printer, tone: 'bg-type-purple', available: true },
  { key: 'document', label: 'เอกสาร', icon: FileText, tone: 'bg-type-teal', available: true },
  { key: 'whiteboard', label: 'ไวท์บอร์ด', icon: StickyNote, tone: 'bg-type-green', available: true },
  { key: 'video', label: 'วิดีโอ', icon: Clapperboard, tone: 'bg-type-pink', available: false },
  { key: 'sheet', label: 'ชีต', icon: Sheet, tone: 'bg-type-blue', available: false },
  { key: 'code', label: 'โค้ดดิ้ง', icon: Code, tone: 'bg-type-magenta', available: false },
  { key: 'website', label: 'เว็บไซต์', icon: Monitor, tone: 'bg-type-indigo', available: false },
  { key: 'email', label: 'อีเมล', icon: Mail, tone: 'bg-type-indigo', available: false },
];

export const DESIGN_TYPES: DesignType[] = [
  { key: 'presentation', label: 'พรีเซนเทชั่น (16:9)', width: 1920, height: 1080, group: 'presentation' },
  { key: 'presentation-4x3', label: 'พรีเซนเทชั่น (4:3)', width: 1024, height: 768, group: 'presentation' },
  { key: 'instagram-post', label: 'โพสต์ Instagram (4:5)', width: 1080, height: 1350, group: 'social' },
  { key: 'social-square', label: 'โพสต์สี่เหลี่ยมจัตุรัส', width: 1080, height: 1080, group: 'social' },
  { key: 'facebook-post', label: 'โพสต์ Facebook (แนวนอน)', width: 1200, height: 630, group: 'social' },
  { key: 'story', label: 'สตอรี่ (9:16)', width: 1080, height: 1920, group: 'social' },
  { key: 'youtube-thumbnail', label: 'ภาพปกวิดีโอ YouTube', width: 1280, height: 720, group: 'social' },
  { key: 'photo-edit', label: 'แต่งรูป (ขนาดตามรูป)', width: 1080, height: 1080, group: 'photo' },
  { key: 'poster', label: 'โปสเตอร์ (A3 แนวตั้ง)', width: 1123, height: 1587, group: 'print' },
  { key: 'flyer', label: 'ใบปลิว (A4 แนวตั้ง)', width: 794, height: 1123, group: 'print' },
  { key: 'certificate', label: 'เกียรติบัตร (A4 แนวนอน)', width: 1123, height: 794, group: 'print' },
  { key: 'business-card', label: 'นามบัตร (แนวนอน)', width: 1050, height: 600, group: 'print' },
  { key: 'invitation', label: 'บัตรเชิญ (แนวตั้ง)', width: 1050, height: 1500, group: 'print' },
  { key: 'sticker', label: 'สติกเกอร์ (วงกลม)', width: 1000, height: 1000, group: 'print' },
  { key: 'document-a4', label: 'เอกสาร (A4 แนวตั้ง)', width: 794, height: 1123, group: 'document' },
  { key: 'report-cover', label: 'ปกรายงาน (A4)', width: 794, height: 1123, group: 'document' },
  { key: 'resume', label: 'เรซูเม่ (A4)', width: 794, height: 1123, group: 'document' },
  { key: 'infographic', label: 'อินโฟกราฟิก (ดิจิทัล)', width: 800, height: 2000, group: 'document' },
  { key: 'whiteboard', label: 'ไวท์บอร์ด', width: 3200, height: 2000, group: 'whiteboard' },
];

export const CUSTOM_TYPE = 'custom';

export function designTypeLabel(key: string): string {
  if (key === CUSTOM_TYPE) return 'กำหนดขนาดเอง';

  return DESIGN_TYPES.find((t) => t.key === key)?.label ?? key;
}

export function designTypeGroup(key: string): DesignGroup | undefined {
  const type = DESIGN_TYPES.find((t) => t.key === key);

  return type ? DESIGN_GROUPS.find((g) => g.key === type.group) : undefined;
}

/// หมวดของเทมเพลต (เก็บเป็น key ในฐานข้อมูล)
export const TEMPLATE_CATEGORIES = [
  { key: 'education', label: 'การศึกษา' },
  { key: 'event', label: 'กิจกรรมและงานอีเวนต์' },
  { key: 'career', label: 'งานและอาชีพ' },
  { key: 'announcement', label: 'ประกาศและประชาสัมพันธ์' },
  { key: 'social', label: 'โซเชียลมีเดีย' },
] as const;

/// ไทล์ "เลือกดูหมวดหมู่เทมเพลต" ในหน้าแรก — สีพาสเทลและภาพประกอบตามประเภทงาน
export const BROWSE_TILES: { label: string; designType: string; tone: string }[] = [
  { label: 'พรีเซนเทชั่น', designType: 'presentation', tone: 'bg-pastel-peach' },
  { label: 'โพสต์ Instagram', designType: 'instagram-post', tone: 'bg-pastel-pink' },
  { label: 'เรซูเม่', designType: 'resume', tone: 'bg-pastel-lilac' },
  { label: 'บัตรเชิญ', designType: 'invitation', tone: 'bg-pastel-violet' },
  { label: 'เกียรติบัตร', designType: 'certificate', tone: 'bg-pastel-butter' },
  { label: 'โปสเตอร์', designType: 'poster', tone: 'bg-pastel-lilac' },
  { label: 'เอกสาร', designType: 'document-a4', tone: 'bg-pastel-aqua' },
  { label: 'ปกรายงาน', designType: 'report-cover', tone: 'bg-pastel-mint' },
  { label: 'ใบปลิว', designType: 'flyer', tone: 'bg-pastel-pink' },
  { label: 'อินโฟกราฟิก', designType: 'infographic', tone: 'bg-pastel-violet' },
  { label: 'ไวท์บอร์ด', designType: 'whiteboard', tone: 'bg-pastel-mint' },
  { label: 'นามบัตร', designType: 'business-card', tone: 'bg-pastel-sky' },
  { label: 'สตอรี่', designType: 'story', tone: 'bg-pastel-peach' },
  { label: 'ภาพปก YouTube', designType: 'youtube-thumbnail', tone: 'bg-pastel-butter' },
];

export function designType(key: string): DesignType | undefined {
  return DESIGN_TYPES.find((t) => t.key === key);
}

export function categoryLabel(key: string): string {
  return TEMPLATE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
