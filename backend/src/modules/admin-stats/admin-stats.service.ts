import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { QUOTA_BYTES_PER_USER } from '../assets/assets.service.js';
import { NEAR_QUOTA_RATIO, usagePercent } from '../members/dto/member.dto.js';
import { assembleActivity, rangeStart, type ActivityRange, type ActivityRow } from './activity-series.js';
import type { AdminActivityDto, AdminOverviewDto } from './dto/admin-stats.dto.js';

const DAY_MS = 86_400_000;

interface NearQuotaRow {
  coreUserId: string;
  used: bigint;
  quota: bigint;
  total: bigint;
}

/// ตัวเลขรวมของแผงผู้ดูแล (ภาพรวม · กิจกรรม) — ยอดรวมทั้งระบบเท่านั้น ไม่มีข้อมูลรายบุคคลนอกจาก coreUserId ของคนที่ใกล้เต็ม
@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(now: Date = new Date()): Promise<AdminOverviewDto> {
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const [
      memberCount,
      activeMemberCount7d,
      designCount,
      trashedDesignCount,
      deletedDesignCount,
      templateCount,
      userTemplateCount,
      assetCount,
      storage,
      commentCount,
      openReportCount,
      nearQuota,
    ] = await Promise.all([
      this.prisma.subsystemMember.count(),
      this.prisma.subsystemMember.count({ where: { lastSeenAt: { gte: weekAgo } } }),
      this.prisma.design.count({ where: { trashedAt: null, purgedAt: null } }),
      this.prisma.design.count({ where: { trashedAt: { not: null }, purgedAt: null } }),
      // ผู้ใช้ลบถาวรแล้ว อยู่ในแท็บ "งานที่ถูกลบ" ของผู้ดูแลไม่เกิน 30 วัน
      this.prisma.design.count({ where: { purgedAt: { not: null } } }),
      this.prisma.template.count(),
      this.prisma.template.count({ where: { createdByCoreUserId: { not: null } } }),
      this.prisma.asset.count(),
      this.prisma.asset.aggregate({ _sum: { sizeBytes: true } }),
      this.prisma.designComment.count(),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.nearQuota(5),
    ]);

    return {
      subsystem: 'csmju-canvas',
      memberCount,
      activeMemberCount7d,
      designCount,
      trashedDesignCount,
      deletedDesignCount,
      templateCount,
      userTemplateCount,
      assetCount,
      storageUsedBytes: String(storage._sum.sizeBytes ?? 0),
      commentCount,
      openReportCount,
      nearQuotaMemberCount: Number(nearQuota[0]?.total ?? 0),
      nearQuotaMembers: nearQuota.map((row) => ({
        coreUserId: row.coreUserId,
        storageUsedBytes: row.used.toString(),
        storageQuotaBytes: row.quota.toString(),
        usagePercent: usagePercent(Number(row.used), Number(row.quota)),
      })),
      defaultQuotaBytes: String(QUOTA_BYTES_PER_USER),
      generatedAt: now.toISOString(),
    };
  }

  /// สมาชิกที่ใช้พื้นที่ ≥ 90% ของโควตาตัวเอง เรียงใกล้เต็มที่สุดก่อน · `total` = จำนวนทั้งหมด (ไม่ใช่แค่ที่คืนมา)
  private nearQuota(limit: number) {
    return this.prisma.$queryRaw<NearQuotaRow[]>`
      SELECT q."coreUserId", q.used, q.quota, COUNT(*) OVER ()::bigint AS total
      FROM (
        SELECT m.core_user_id AS "coreUserId",
          COALESCE(a.used, 0)::bigint AS used,
          COALESCE(m.storage_quota_bytes, ${QUOTA_BYTES_PER_USER}::bigint)::bigint AS quota
        FROM subsystem_members m
        LEFT JOIN (SELECT core_user_id, SUM(size_bytes)::bigint AS used FROM assets GROUP BY core_user_id) a
          ON a.core_user_id = m.core_user_id
      ) q
      WHERE q.used::float8 >= q.quota::float8 * ${NEAR_QUOTA_RATIO}
      ORDER BY q.used::float8 / q.quota::float8 DESC, q."coreUserId" ASC
      LIMIT ${limit}`;
  }

  /// กิจกรรมรายวันของ `days` วันล่าสุด + ช่วงก่อนหน้าที่ยาวเท่ากันไว้เทียบเทรนด์
  ///
  /// - designsEdited นับดีไซน์ไม่ซ้ำต่อวันจากประวัติเวอร์ชัน (บันทึกระหว่างแก้) และเวลาแก้ล่าสุดของดีไซน์
  /// - activeMembers นับคนไม่ซ้ำต่อวันจากการกระทำจริง (สร้าง/แก้งาน อัปโหลด ความคิดเห็น เผยแพร่เทมเพลต) และการเปิดแอปล่าสุด
  async activity(days: ActivityRange, now: Date = new Date()): Promise<AdminActivityDto> {
    const since = rangeStart(days * 2, now);
    const currentStart = rangeStart(days, now);
    const rows = await this.prisma.$queryRaw<ActivityRow[]>`
      WITH act AS (
        SELECT core_user_id, created_at AS at FROM designs WHERE created_at >= ${since}
        UNION ALL SELECT core_user_id, created_at FROM design_versions WHERE created_at >= ${since}
        UNION ALL SELECT core_user_id, created_at FROM assets WHERE created_at >= ${since}
        UNION ALL SELECT core_user_id, created_at FROM design_comments WHERE created_at >= ${since}
        UNION ALL SELECT created_by_core_user_id, created_at FROM templates
          WHERE created_at >= ${since} AND created_by_core_user_id IS NOT NULL
        UNION ALL SELECT core_user_id, last_seen_at FROM subsystem_members WHERE last_seen_at >= ${since}
      ),
      edits AS (
        SELECT design_id, created_at AS at FROM design_versions WHERE created_at >= ${since}
        UNION ALL SELECT id, updated_at FROM designs
          WHERE updated_at >= ${since} AND updated_at > created_at + interval '1 minute'
      )
      SELECT 'designsCreated' AS metric, to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
        FROM designs WHERE created_at >= ${since} GROUP BY 2
      UNION ALL
      SELECT 'designsEdited', to_char(at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD'), COUNT(DISTINCT design_id)::bigint
        FROM edits GROUP BY 2
      UNION ALL
      SELECT 'uploads', to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD'), COUNT(*)::bigint
        FROM assets WHERE created_at >= ${since} GROUP BY 2
      UNION ALL
      SELECT 'templatesPublished', to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD'), COUNT(*)::bigint
        FROM templates WHERE created_at >= ${since} AND created_by_core_user_id IS NOT NULL GROUP BY 2
      UNION ALL
      SELECT 'comments', to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD'), COUNT(*)::bigint
        FROM design_comments WHERE created_at >= ${since} GROUP BY 2
      UNION ALL
      SELECT 'activeMembers', to_char(at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD'), COUNT(DISTINCT core_user_id)::bigint
        FROM act GROUP BY 2
      UNION ALL
      SELECT 'activeMembersPeriod', CASE WHEN at >= ${currentStart} THEN 'current' ELSE 'previous' END,
        COUNT(DISTINCT core_user_id)::bigint
        FROM act GROUP BY 2`;

    return assembleActivity(days, now, rows);
  }
}
