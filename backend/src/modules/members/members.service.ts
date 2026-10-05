import { Injectable } from '@nestjs/common';
import type { CoreHubUser } from '../../common/auth/core-user.js';
import { Paginated } from '../../common/http/envelope.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { SubsystemMember } from '../../generated/prisma/client.js';
import { AssetsService, effectiveQuota, QUOTA_BYTES_PER_USER } from '../assets/assets.service.js';
import { AuditService } from '../audit/audit.js';
import {
  ListMembersQuery,
  MemberDto,
  MyMembershipDto,
  UpdateMemberQuotaDto,
  usagePercent,
} from './dto/member.dto.js';

/// ตัดอักขระพิเศษของ LIKE ออก ให้ช่องค้นหาเป็นการค้นข้อความตรง ๆ
export function likePattern(q: string | undefined): string | null {
  const term = q?.trim();

  return term ? `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly audit: AuditService,
  ) {}

  /// "ฉันเปิดแอปแล้ว" — หน้าบ้านเรียกครั้งเดียวหลังรู้ตัวตน (แบบ nexus)
  ///
  /// แยกจาก GET /api/v1/me ของชั้น auth ซึ่งห้ามแก้ (ai/AGENTS.md ข้อ 2)
  async touch(user: CoreHubUser): Promise<MyMembershipDto> {
    const now = new Date();
    const member = await this.prisma.subsystemMember.upsert({
      where: { coreUserId: user.coreUserId },
      update: { lastSeenAt: now, lastCoreRole: user.coreRole },
      create: { coreUserId: user.coreUserId, lastSeenAt: now, lastCoreRole: user.coreRole },
    });
    const used = await this.assets.usedBytes(user.coreUserId);
    const quota = effectiveQuota(member.storageQuotaBytes);

    return {
      coreUserId: member.coreUserId,
      coreRole: user.coreRole,
      storageUsedBytes: String(used),
      storageQuotaBytes: String(quota),
      usagePercent: usagePercent(used, quota),
      lastSeenAt: now.toISOString(),
    };
  }

  async list(query: ListMembersQuery): Promise<Paginated<MemberDto>> {
    const pattern = likePattern(query.q);
    const [ids, totals] = await Promise.all([
      query.sort === 'usage' ? this.idsByUsage(pattern, query.take, query.skip) : this.idsByRecent(pattern, query.take, query.skip),
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*)::bigint AS total FROM subsystem_members
        WHERE (${pattern}::text IS NULL OR core_user_id ILIKE ${pattern})`,
    ]);

    return new Paginated(await this.hydrate(ids), query.meta(Number(totals[0]?.total ?? 0)));
  }

  /// ปรับโควตาของคนหนึ่ง (PL: "แอดมินสามารถปรับพื้นที่ให้ผู้ใช้ได้เมื่อเต็ม")
  ///
  /// ใช้ upsert เพราะต้องตั้งล่วงหน้าให้คนที่ยังไม่เคยเปิดแอปได้ (เช่นเตรียมให้อาจารย์ก่อนเปิดเทอม)
  /// ตั้งต่ำกว่าที่ใช้อยู่ได้ — เจ้าตัวจะอัปโหลดเพิ่มไม่ได้จนกว่าจะลบไฟล์ — จึงบันทึกไว้ใน audit log ให้เห็นชัด
  async updateQuota(actor: CoreHubUser, coreUserId: string, dto: UpdateMemberQuotaDto): Promise<MemberDto> {
    const [before, used] = await Promise.all([
      this.prisma.subsystemMember.findUnique({ where: { coreUserId } }),
      this.assets.usedBytes(coreUserId),
    ]);
    const next = dto.storageQuotaBytes === null ? null : BigInt(dto.storageQuotaBytes);
    const nextEffective = effectiveQuota(next);

    await this.prisma.subsystemMember.upsert({
      where: { coreUserId },
      update: { storageQuotaBytes: next },
      create: { coreUserId, storageQuotaBytes: next },
    });

    await this.audit.record(actor, {
      action: 'member.quota_change',
      targetKind: 'MEMBER',
      targetId: coreUserId,
      metadata: {
        fromBytes: String(effectiveQuota(before?.storageQuotaBytes ?? null)),
        toBytes: String(nextEffective),
        resetToDefault: next === null,
        usedBytes: String(used),
        belowCurrentUsage: nextEffective < used,
        // true = ตั้งให้ก่อนเจ้าตัวเปิดแอปครั้งแรก
        preProvisioned: before === null,
        reason: dto.reason?.trim() || null,
      },
    });

    const [member] = await this.hydrate([coreUserId]);

    return member;
  }

  private async idsByRecent(pattern: string | null, take: number, skip: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ coreUserId: string }[]>`
      SELECT core_user_id AS "coreUserId" FROM subsystem_members
      WHERE (${pattern}::text IS NULL OR core_user_id ILIKE ${pattern})
      ORDER BY last_seen_at DESC NULLS LAST, created_at DESC, core_user_id ASC
      LIMIT ${take} OFFSET ${skip}`;

    return rows.map((row) => row.coreUserId);
  }

  /// "ใกล้เต็มก่อน" — เรียงตามสัดส่วนที่ใช้ต่อโควตาของแต่ละคน (โควตาต่ำสุด 1 MB จึงไม่หารด้วยศูนย์)
  private async idsByUsage(pattern: string | null, take: number, skip: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ coreUserId: string }[]>`
      SELECT m.core_user_id AS "coreUserId"
      FROM subsystem_members m
      LEFT JOIN (SELECT core_user_id, SUM(size_bytes)::bigint AS used FROM assets GROUP BY core_user_id) a
        ON a.core_user_id = m.core_user_id
      WHERE (${pattern}::text IS NULL OR m.core_user_id ILIKE ${pattern})
      ORDER BY COALESCE(a.used, 0)::float8 / COALESCE(m.storage_quota_bytes, ${QUOTA_BYTES_PER_USER}::bigint)::float8 DESC,
        COALESCE(a.used, 0) DESC, m.core_user_id ASC
      LIMIT ${take} OFFSET ${skip}`;

    return rows.map((row) => row.coreUserId);
  }

  /// เติมพื้นที่ที่ใช้ จำนวนไฟล์ และจำนวนดีไซน์ให้สมาชิกตามลำดับ id ที่ได้มา
  private async hydrate(ids: string[]): Promise<MemberDto[]> {
    if (!ids.length) return [];

    const [members, assetSums, designCounts] = await Promise.all([
      this.prisma.subsystemMember.findMany({ where: { coreUserId: { in: ids } } }),
      this.prisma.asset.groupBy({
        by: ['coreUserId'],
        where: { coreUserId: { in: ids } },
        _sum: { sizeBytes: true },
        _count: { _all: true },
      }),
      this.prisma.design.groupBy({
        by: ['coreUserId'],
        where: { coreUserId: { in: ids }, trashedAt: null },
        _count: { _all: true },
      }),
    ]);
    const byId = new Map(members.map((m) => [m.coreUserId, m]));
    const assetsById = new Map(assetSums.map((a) => [a.coreUserId, a]));
    const designsById = new Map(designCounts.map((d) => [d.coreUserId, d._count._all]));

    return ids.flatMap((id) => {
      const member = byId.get(id);

      if (!member) return [];

      const asset = assetsById.get(id);

      return [toMemberDto(member, asset?._sum.sizeBytes ?? 0, asset?._count._all ?? 0, designsById.get(id) ?? 0)];
    });
  }
}

export function toMemberDto(member: SubsystemMember, usedBytes: number, assetCount: number, designCount: number): MemberDto {
  const quota = effectiveQuota(member.storageQuotaBytes);

  return {
    coreUserId: member.coreUserId,
    lastCoreRole: member.lastCoreRole,
    storageUsedBytes: String(usedBytes),
    storageQuotaBytes: String(quota),
    quotaOverridden: member.storageQuotaBytes !== null,
    usagePercent: usagePercent(usedBytes, quota),
    designCount,
    assetCount,
    lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
  };
}
