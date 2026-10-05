/// รูปร่างข้อมูลของแผงผู้ดูแล (ภาพรวม · สมาชิก · กิจกรรม · Audit log) — ตรงกับ schema ใน backend/openapi.json

export interface AdminMember {
  coreUserId: string;
  /// core role ตอนเข้าใช้ล่าสุด (แสดงผลเท่านั้น) · null = ยังไม่เคยเปิดแอปหลังเริ่มบันทึก
  /// ไบต์เป็น string (BigInt)
  storageUsedBytes: string;
  storageQuotaBytes: string;
  quotaOverridden: boolean;
  usagePercent: number;
  designCount: number;
  assetCount: number;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface NearQuotaMember {
  coreUserId: string;
  storageUsedBytes: string;
  storageQuotaBytes: string;
  usagePercent: number;
}

export interface AdminOverview {
  subsystem: string;
  memberCount: number;
  activeMemberCount7d: number;
  designCount: number;
  trashedDesignCount: number;
  trashExpiredDesignCount: number;
  templateCount: number;
  userTemplateCount: number;
  assetCount: number;
  storageUsedBytes: string;
  commentCount: number;
  openReportCount: number;
  nearQuotaMemberCount: number;
  nearQuotaMembers: NearQuotaMember[];
  defaultQuotaBytes: string;
  generatedAt: string;
}

export const ACTIVITY_METRICS = [
  'designsCreated',
  'designsEdited',
  'uploads',
  'templatesPublished',
  'comments',
  'activeMembers',
] as const;

export type ActivityMetric = (typeof ACTIVITY_METRICS)[number];

export type ActivityPoint = { date: string } & Record<ActivityMetric, number>;

export interface ActivityTrend {
  metric: ActivityMetric;
  current: number;
  previous: number;
  changePercent: number | null;
  direction: 'UP' | 'DOWN' | 'FLAT';
}

export interface AdminActivity {
  days: number;
  timeZone: string;
  from: string;
  to: string;
  series: ActivityPoint[];
  trends: ActivityTrend[];
}

export interface AuditLogEntry {
  id: string;
  actorCoreUserId: string;
  actorCoreRole: string;
  action: string;
  targetKind: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
