import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Asset } from '../../generated/prisma/client.js';
import { Paginated } from '../../common/http/envelope.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ListAssetsQuery } from './dto/asset.dto.js';
import { FONT_EXTENSIONS, MAX_FONT_BYTES, sniffFont } from './font-type.js';
import { IMAGE_EXTENSIONS, sniffImage } from './image-type.js';
import { MEDIA_EXTENSIONS, sniffMedia } from './media-type.js';
import { resolveSource, type SourceSite } from './source-site.js';

/// ไฟล์ละไม่เกิน 10 MB ทุกชนิด (ฟอนต์ 5 MB) — standards deployment.md ข้อ 4.3: ไฟล์เก็บในฐานข้อมูลของระบบ
/// ที่ใช้ร่วมกันหลายระบบบน server จึงจำกัดเท่ากันทุกชนิด
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
export const MAX_MEDIA_BYTES = MAX_ASSET_BYTES;
/// ขนาดใหญ่สุดที่ตัวรับไฟล์ยอมอ่าน — multer ตัดตั้งแต่ตอนรับ ไม่ต้องรอรับครบ
export const MAX_UPLOAD_BYTES = MAX_ASSET_BYTES;
/// พื้นที่ต่อคน — นับรวมรูปในถังขยะด้วย จนกว่าจะลบถาวร
export const QUOTA_BYTES_PER_USER = 500 * 1024 * 1024;
/// เพดานโควตาที่ผู้ดูแลตั้งให้คนหนึ่งได้ (5 GB) — กันพิมพ์ศูนย์เกินจนคนเดียวจองดิสก์ทั้งเครื่อง
export const MAX_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

/// โควตาที่ใช้จริง: ค่าที่ผู้ดูแลตั้ง (subsystem_members.storage_quota_bytes) หรือค่าเริ่มต้นเมื่อเป็น null
export function effectiveQuota(override: bigint | null): number {
  return override === null ? QUOTA_BYTES_PER_USER : Number(override);
}
export const ASSET_TRASH_RETENTION_DAYS = 30;

/// เก็บไฟล์ในฐานข้อมูลของระบบ (ตาราง asset_contents) แล้วเสิร์ฟผ่าน API ที่ตรวจสิทธิ์ทุกครั้ง — ไฟล์ไม่เคยเปิดเป็นสาธารณะ
/// (container บน server อ่านอย่างเดียว เขียนดิสก์ไม่ได้ · standards deployment.md ข้อ 3.4 และ 4.3)
@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(coreUserId: string, query: ListAssetsQuery) {
    if (query.trashed) await this.purgeExpiredTrash(coreUserId);

    const where = {
      coreUserId,
      trashedAt: query.trashed ? { not: null } : null,
      ...(query.q ? { fileName: { contains: query.q, mode: 'insensitive' as const } } : {}),
      ...(query.mimeType ? { mimeType: query.mimeType } : query.kind ? { mimeType: { startsWith: `${query.kind}/` } } : {}),
      ...(query.folderId ? { folderId: query.folderId } : {}),
      ...(query.source ? { sourceSite: query.source } : query.imported !== undefined ? { sourceSite: query.imported ? { not: null } : null } : {}),
    };
    const orderBy =
      query.sort === 'name'
        ? { fileName: 'asc' as const }
        : query.sort === 'size'
          ? { sizeBytes: 'desc' as const }
          : { createdAt: 'desc' as const };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.asset.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.asset.count({ where }),
    ]);

    return new Paginated(rows.map(toDto), query.meta(total));
  }

  async upload(
    coreUserId: string,
    file: Express.Multer.File | undefined,
    origin: { sourceUrl?: string | null; sourceSite?: string | null } = {},
  ) {
    if (!file) throw new BadRequestException('กรุณาแนบไฟล์ในช่อง file');

    const image = sniffImage(file.buffer);
    const font = image ? null : sniffFont(file.buffer);
    const media = image || font ? null : sniffMedia(file.buffer);
    const mimeType = image ?? font ?? media;

    // ชนิดหรือขนาดไม่ตรงตอบ 400 VALIDATION_ERROR (มี details) ตาม deployment.md ข้อ 4.3
    if (!mimeType) {
      throw invalidFile('รองรับเฉพาะรูป PNG, JPEG, WebP, GIF, SVG · วิดีโอ MP4, WebM · เสียง MP3, M4A, OGG, WAV · ฟอนต์ TTF, OTF, WOFF, WOFF2');
    }

    if (font && file.size > MAX_FONT_BYTES) {
      throw invalidFile('ไฟล์ฟอนต์ใหญ่เกิน 5 MB');
    }

    if (file.size > MAX_ASSET_BYTES) {
      throw invalidFile('ไฟล์ใหญ่เกิน 10 MB');
    }

    const [used, quota] = await Promise.all([this.usedBytes(coreUserId), this.quotaBytes(coreUserId)]);

    if (used + file.size > quota) {
      throw new ConflictException('พื้นที่เก็บไฟล์เต็มแล้ว ลบไฟล์ที่ไม่ใช้ออกจากถังขยะก่อน หรือขอให้ผู้ดูแลระบบเพิ่มพื้นที่');
    }

    // แหล่งที่มาเก็บเป็นข้อความเท่านั้น — ไม่ดึง URL ฝั่งเซิร์ฟเวอร์เด็ดขาด · ฟอนต์ไม่มีแหล่งที่มา
    const source = font ? { sourceUrl: null, sourceSite: null } : resolveSource(origin.sourceUrl, origin.sourceSite);
    const id = randomUUID();
    // ชื่อไฟล์ที่ไม่มีนามสกุลได้นามสกุลตามชนิดที่ตรวจจากไบต์
    const extension = image ? IMAGE_EXTENSIONS[image] : font ? FONT_EXTENSIONS[font] : MEDIA_EXTENSIONS[media!];
    const fileName = withExtension(cleanFileName(file.originalname), extension);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // แถวข้อมูลกับไบต์ของไฟล์ต้องเกิดพร้อมกัน — ไม่มีแถวที่ชี้ไฟล์ที่ไม่มีอยู่
    const [row] = await this.prisma.$transaction([
      this.prisma.asset.create({
        data: {
          id,
          coreUserId,
          fileName,
          mimeType,
          sizeBytes: file.size,
          storagePath: null,
          sha256,
          sourceUrl: source.sourceUrl,
          sourceSite: source.sourceSite,
        },
      }),
      // ส่ง Buffer ตรง ๆ — แปลงเป็น Uint8Array ใหม่ทำให้ adapter เข้ารหัสช้ามาก (10 MB ใช้ ~30 วินาที)
      this.prisma.assetContent.create({ data: { assetId: id, content: file.buffer as Uint8Array<ArrayBuffer> } }),
    ]);

    return toDto(row);
  }

  /// เจ้าของเปิดไฟล์ได้เสมอ · คนอื่นเปิดได้เมื่อไฟล์นั้นอยู่ในงานของเจ้าของที่เปิดแชร์ด้วยลิงก์
  /// (ไม่งั้นคนที่ได้ลิงก์จะเห็นงานแต่รูปหายหมด) · ฟอนต์ที่อัปโหลดเองใช้กติกาเดียวกัน: งานอ้างฟอนต์ด้วย
  /// `fontFamily: "asset:<uuid>"` จึงพบ id ของฟอนต์ในเอกสารของงานเหมือนรูป · ตรวจสิทธิ์ทุกครั้ง แล้วคืนไบต์ให้ controller
  /// ส่งทั้งไฟล์หรือเป็นช่วงไบต์ (วิดีโอ/เสียง)
  async content(coreUserId: string, id: string) {
    const row = await this.prisma.asset.findUnique({ where: { id } });

    if (!row) throw new NotFoundException('ไม่พบรูปนี้ อาจถูกลบไปแล้ว');

    if (row.coreUserId !== coreUserId && (row.trashedAt !== null || !(await this.sharedInDesign(row)))) {
      throw new NotFoundException('ไม่พบรูปนี้ อาจถูกลบไปแล้ว');
    }

    const file = await this.prisma.assetContent.findUnique({ where: { assetId: id }, select: { content: true } });

    if (!file) throw new NotFoundException('ไม่พบไฟล์นี้ในที่เก็บ');

    return { row, bytes: Buffer.from(file.content) };
  }

  async update(coreUserId: string, id: string, patch: { trashed?: boolean; fileName?: string; folderId?: string | null }) {
    const row = await this.find(coreUserId, id);

    // ย้ายได้เฉพาะเข้าโฟลเดอร์ของตัวเอง
    if (patch.folderId) {
      const folder = await this.prisma.assetFolder.findFirst({ where: { id: patch.folderId, coreUserId }, select: { id: true } });

      if (!folder) throw new NotFoundException('ไม่พบโฟลเดอร์นี้');
    }

    const updated = await this.prisma.asset.update({
      where: { id: row.id },
      data: {
        ...(patch.trashed !== undefined ? { trashedAt: patch.trashed ? (row.trashedAt ?? new Date()) : null } : {}),
        ...(patch.fileName !== undefined ? { fileName: cleanFileName(Buffer.from(patch.fileName, 'utf8').toString('latin1')) } : {}),
        ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
      },
    });

    return toDto(updated);
  }

  private async sharedInDesign(row: Asset): Promise<boolean> {
    const hits = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM designs
      WHERE core_user_id = ${row.coreUserId}
        AND link_access <> 'NONE'
        AND trashed_at IS NULL
        AND document::text LIKE ${'%' + row.id + '%'}`;

    return Number(hits[0]?.count ?? 0) > 0;
  }

  async remove(coreUserId: string, id: string) {
    const row = await this.find(coreUserId, id);

    if (!row.trashedAt) {
      throw new BadRequestException('ย้ายรูปไปถังขยะก่อน แล้วจึงลบถาวรได้');
    }

    await this.deleteRow(row);

    return { id, deleted: true };
  }

  async usedBytes(coreUserId: string): Promise<number> {
    const sum = await this.prisma.asset.aggregate({
      where: { coreUserId },
      _sum: { sizeBytes: true },
    });

    return sum._sum.sizeBytes ?? 0;
  }

  /// โควตาของคนนี้ — ค่าที่ผู้ดูแลตั้งให้ (แผงผู้ดูแล → สมาชิกและพื้นที่) หรือค่าเริ่มต้น
  async quotaBytes(coreUserId: string): Promise<number> {
    const member = await this.prisma.subsystemMember.findUnique({
      where: { coreUserId },
      select: { storageQuotaBytes: true },
    });

    return effectiveQuota(member?.storageQuotaBytes ?? null);
  }

  private async find(coreUserId: string, id: string) {
    const row = await this.prisma.asset.findFirst({ where: { id, coreUserId } });

    if (!row) throw new NotFoundException('ไม่พบรูปนี้ อาจถูกลบไปแล้ว');

    return row;
  }

  private async purgeExpiredTrash(coreUserId: string) {
    const cutoff = new Date(Date.now() - ASSET_TRASH_RETENTION_DAYS * 86_400_000);
    const expired = await this.prisma.asset.findMany({
      where: { coreUserId, trashedAt: { lt: cutoff } },
    });

    for (const row of expired) await this.deleteRow(row);
  }

  /// ไบต์ของไฟล์ถูกลบตาม (asset_contents ON DELETE CASCADE)
  private async deleteRow(row: Asset) {
    await this.prisma.asset.delete({ where: { id: row.id } });
    this.logger.debug(JSON.stringify({ event: 'asset.deleted', id: row.id }));
  }
}

/// 400 VALIDATION_ERROR — exception filter ถือว่า message แบบ array คือการตรวจข้อมูลไม่ผ่าน (มี details)
function invalidFile(message: string): BadRequestException {
  return new BadRequestException([message]);
}

function withExtension(name: string, extension: string): string {
  return /\.[A-Za-z0-9]{1,5}$/.test(name) ? name : `${name}.${extension}`.slice(0, 200);
}

/// ตัด path และอักขระควบคุมออกจากชื่อไฟล์ที่ client ส่งมา
function cleanFileName(name: string): string {
  // multer อ่านชื่อไฟล์เป็น latin1 — แปลงกลับเป็น UTF-8 ให้ชื่อภาษาไทยไม่เพี้ยน
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  const base = decoded.split(/[\\/]/).pop() ?? 'image';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();

  return (cleaned || 'image').slice(0, 200);
}

export function toDto(row: Asset) {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    contentUrl: `/api/v1/assets/${row.id}/content`,
    folderId: row.folderId,
    trashedAt: row.trashedAt?.toISOString() ?? null,
    sourceUrl: row.sourceUrl,
    sourceSite: (row.sourceSite as SourceSite | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
