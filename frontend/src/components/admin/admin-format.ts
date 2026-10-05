import { formatBytes } from '@/lib/format';
import type { ActivityMetric, ActivityTrend } from './admin-types';

/// ข้อความภาษาไทยและการจัดรูปตัวเลขของแผงผู้ดูแล — ฟังก์ชันล้วน ทดสอบได้

export const MB = 1024 * 1024;
export const GB = 1024 * MB;
/// เพดานที่หลังบ้านรับ (MAX_QUOTA_BYTES ใน assets.service.ts)
export const MAX_QUOTA_BYTES = 5 * GB;
/// สัดส่วนที่ถือว่า "ใกล้เต็ม" (NEAR_QUOTA_RATIO ของหลังบ้าน)
export const NEAR_QUOTA_PERCENT = 90;

export const QUOTA_PRESETS: { label: string; bytes: number }[] = [
  { label: '500 MB', bytes: 500 * MB },
  { label: '1 GB', bytes: GB },
  { label: '2 GB', bytes: 2 * GB },
  { label: '5 GB', bytes: 5 * GB },
];

export const ROLE_LABELS: Record<string, string> = {
  student: 'นักศึกษา',
  alumni: 'ศิษย์เก่า',
  staff: 'เจ้าหน้าที่',
  lecturer: 'อาจารย์',
  guest: 'ผู้เยี่ยมชม',
  admin: 'ผู้ดูแลองค์กร',
};

export function roleLabel(role: string | null): string {
  if (!role) return 'ยังไม่ทราบ';

  return ROLE_LABELS[role] ?? role;
}

/// การกระทำที่รู้จัก — การกระทำใหม่ที่ยังไม่มีในตารางแสดงเป็นชื่อเดิม
export const ACTION_LABELS: Record<string, string> = {
  'design.purge': 'ลบดีไซน์ถาวร',
  'design.restore_by_admin': 'ผู้ดูแลกู้คืนดีไซน์',
  'design.trash_by_admin': 'ผู้ดูแลย้ายดีไซน์ไปถังขยะ',
  'report.resolved': 'ปิดเรื่องร้องเรียน (ดำเนินการแล้ว)',
  'report.rejected': 'ปฏิเสธเรื่องร้องเรียน',
  'member.quota_change': 'ปรับพื้นที่เก็บไฟล์',
  'template.unpublish': 'ยกเลิกการเผยแพร่เทมเพลต',
  'template.delete': 'ลบเทมเพลต',
  'comment.delete': 'ลบความคิดเห็น',
  'asset.purge': 'ลบไฟล์ถาวร',
  'image_source.create': 'เพิ่มแหล่งรูปภาพ',
  'image_source.update': 'แก้ไขแหล่งรูปภาพ',
  'image_source.delete': 'ลบแหล่งรูปภาพ',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export const TARGET_LABELS: Record<string, string> = {
  DESIGN: 'ดีไซน์',
  TEMPLATE: 'เทมเพลต',
  ASSET: 'ไฟล์',
  REPORT: 'เรื่องร้องเรียน',
  MEMBER: 'สมาชิก',
  COMMENT: 'ความคิดเห็น',
};

export function targetLabel(kind: string): string {
  return TARGET_LABELS[kind] ?? kind;
}

export const METRIC_LABELS: Record<ActivityMetric, string> = {
  designsCreated: 'ดีไซน์ใหม่',
  designsEdited: 'ดีไซน์ที่มีการแก้ไข',
  uploads: 'ไฟล์ที่อัปโหลด',
  templatesPublished: 'เทมเพลตที่เผยแพร่',
  comments: 'ความคิดเห็น',
  activeMembers: 'ผู้ใช้ที่มีความเคลื่อนไหว',
};

/// ชื่อ key ใน metadata ที่รู้จัก → ภาษาไทย
const METADATA_LABELS: Record<string, string> = {
  fromBytes: 'จาก',
  toBytes: 'เป็น',
  usedBytes: 'ใช้อยู่',
  resetToDefault: 'กลับเป็นค่าเริ่มต้น',
  belowCurrentUsage: 'ต่ำกว่าที่ใช้อยู่',
  preProvisioned: 'ตั้งล่วงหน้า',
  reason: 'เหตุผล',
  title: 'ชื่อ',
  ownerCoreUserId: 'เจ้าของ',
  note: 'หมายเหตุ',
};

/// metadata แบบย่อ: [ป้าย, ค่า] · ไบต์แปลงเป็นขนาดไฟล์ · true/false เป็น ใช่/ไม่ · ตัดค่า null และ false ทิ้ง
export function metadataEntries(metadata: Record<string, unknown> | null): [string, string][] {
  if (!metadata) return [];

  const entries: [string, string][] = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined || value === false || value === '') continue;

    const label = METADATA_LABELS[key] ?? key;
    let text: string;

    if (value === true) text = 'ใช่';
    else if (key.endsWith('Bytes') && /^\d+$/.test(String(value))) text = formatBytes(Number(value));
    else if (typeof value === 'object') text = JSON.stringify(value);
    else text = String(value);

    entries.push([label, text.length > 80 ? `${text.slice(0, 79)}…` : text]);
  }

  return entries;
}

export function bytes(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

export function percentLabel(value: number): string {
  return `${value.toLocaleString('th-TH', { maximumFractionDigits: 1 })}%`;
}

/// แปลงค่าที่พิมพ์ (หน่วย MB หรือ GB) เป็นไบต์ · คืน null ถ้าไม่ใช่ตัวเลขบวก
export function parseQuotaInput(amount: string, unit: 'MB' | 'GB'): number | null {
  const value = Number(amount.trim());

  if (!amount.trim() || !Number.isFinite(value) || value <= 0) return null;

  return Math.round(value * (unit === 'GB' ? GB : MB));
}

/// เพดานแกน Y ที่อ่านง่าย (1, 2, 5 × 10ⁿ) และไม่ต่ำกว่า 1
export function niceMax(value: number): number {
  if (value <= 1) return 1;

  const power = 10 ** Math.floor(Math.log10(value));

  for (const step of [1, 2, 5, 10]) {
    if (value <= step * power) return step * power;
  }

  return 10 * power;
}

/// วันที่สั้นแบบไทยจาก YYYY-MM-DD เช่น "6 ต.ค."
export function shortDate(day: string): string {
  return new Date(`${day}T00:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
}

/// ข้อความเทรนด์ เช่น "เพิ่มขึ้น 25%"
export function trendText(trend: ActivityTrend): string {
  if (trend.direction === 'FLAT') return 'เท่าเดิม';
  if (trend.changePercent === null) return 'เพิ่มจาก 0';

  return `${trend.direction === 'UP' ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(trend.changePercent).toLocaleString('th-TH')}%`;
}

/// วันที่จากช่อง <input type="date"> → ขอบเขตของวันตามเวลาไทย
export function dayBoundary(day: string, edge: 'start' | 'end'): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;

  return edge === 'start' ? `${day}T00:00:00+07:00` : `${day}T23:59:59.999+07:00`;
}
