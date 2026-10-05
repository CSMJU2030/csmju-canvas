/// เรื่องร้องเรียนและงานที่ถูกลบ — รูปข้อมูลตรงกับ ReportDto / DeletedDesignDto ใน backend/openapi.json
import type { DesignDocument } from './editor/types';

export type ReportTargetKind = 'DESIGN' | 'TEMPLATE' | 'COMMENT' | 'OTHER';
export type ReportReason = 'COPYRIGHT' | 'INAPPROPRIATE' | 'SPAM' | 'PERSONAL_DATA' | 'OTHER';
export type ReportStatus = 'OPEN' | 'RESOLVED' | 'REJECTED';

export const REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  { value: 'COPYRIGHT', label: 'ละเมิดลิขสิทธิ์', description: 'ใช้ภาพ ฟอนต์ หรือผลงานของผู้อื่นโดยไม่ได้รับอนุญาต' },
  { value: 'INAPPROPRIATE', label: 'ไม่เหมาะสม', description: 'เนื้อหารุนแรง ลามก คุกคาม หรือสร้างความเกลียดชัง' },
  { value: 'SPAM', label: 'สแปม', description: 'โฆษณา ข้อความซ้ำ ๆ หรือหลอกลวง' },
  { value: 'PERSONAL_DATA', label: 'ข้อมูลส่วนบุคคล', description: 'เปิดเผยข้อมูลส่วนตัวของผู้อื่น เช่น เบอร์โทร ที่อยู่ รหัสนักศึกษา' },
  { value: 'OTHER', label: 'อื่น ๆ', description: 'เรื่องอื่นที่ผู้ดูแลควรตรวจสอบ (เขียนรายละเอียด)' },
];

export const reasonLabel = (reason: string) => REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;

export const TARGET_LABELS: Record<ReportTargetKind, string> = {
  DESIGN: 'งานที่แชร์',
  TEMPLATE: 'เทมเพลต',
  COMMENT: 'ความคิดเห็น',
  OTHER: 'เรื่องอื่น',
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: 'เปิดอยู่',
  RESOLVED: 'จัดการแล้ว',
  REJECTED: 'ปัดตก',
};

/// ผลของ "ซ่อนเป้าหมาย" ตามชนิด — ข้อความบนตัวเลือกในหน้าต่างปิดเรื่อง
export const HIDE_ACTION_LABELS: Record<Exclude<ReportTargetKind, 'OTHER'>, string> = {
  DESIGN: 'ปิดลิงก์แชร์ของงานนี้',
  TEMPLATE: 'ซ่อนเทมเพลตนี้จากทุกคน',
  COMMENT: 'ลบความคิดเห็นนี้ (การตอบกลับถูกลบตาม)',
};

export interface ReportTarget {
  exists: boolean;
  hidden: boolean;
  title: string | null;
  thumbnail: string | null;
  designType: string | null;
  width: number | null;
  height: number | null;
  body: string | null;
  ownerCoreUserId: string | null;
}

export interface Report {
  id: string;
  targetKind: ReportTargetKind;
  targetId: string | null;
  targetExcerpt: string | null;
  link: string | null;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  reporterCoreUserId: string;
  resolvedByCoreUserId: string | null;
  resolutionNote: string | null;
  actionTaken: 'HIDE_TARGET' | null;
  resolvedAt: string | null;
  createdAt: string;
  target: ReportTarget | null;
}

export interface DeletedDesign {
  id: string;
  title: string;
  designType: string;
  width: number;
  height: number;
  thumbnail: string | null;
  pageCount: number;
  ownerCoreUserId: string;
  trashedAt: string | null;
  deletedAt: string;
  purgeAt: string;
  daysLeft: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeletedDesignDetail extends DeletedDesign {
  document: DesignDocument;
}

/// ข้อความยืนยันการลบถาวรของผู้ใช้ — ต้องบอกว่าระบบเก็บไว้ให้ผู้ดูแลอีก 30 วัน (การตัดสินใจของ PL)
export const PERMANENT_DELETE_NOTICE = 'ลบถาวรแล้วคุณจะกู้คืนเองไม่ได้ · ระบบเก็บไว้ให้ผู้ดูแลตรวจสอบอีก 30 วันแล้วลบจริง';

/// รหัสผู้ใช้แบบย่อสำหรับแสดงผล (ระบบไม่เก็บชื่อ)
export function shortId(coreUserId: string): string {
  return coreUserId.length > 12 ? `${coreUserId.slice(0, 8)}…` : coreUserId;
}
