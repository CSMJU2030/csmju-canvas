import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Asset } from '../../generated/prisma/client.js';
import { Paginated } from '../../common/http/envelope.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ListAssetsQuery } from './dto/asset.dto.js';
import { IMAGE_EXTENSIONS, sniffImage } from './image-type.js';
import { MEDIA_EXTENSIONS, sniffMedia } from './media-type.js';

/// รูปไม่เกิน 10 MB · วิดีโอและเสียงไม่เกิน 50 MB (คลิปสั้นสำหรับสไลด์/โพสต์)
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
/// ขนาดใหญ่สุดที่ตัวรับไฟล์ยอมอ่าน (แยกตามชนิดอีกทีหลังตรวจไบต์หัวไฟล์)
export const MAX_UPLOAD_BYTES = Math.max(MAX_ASSET_BYTES, MAX_MEDIA_BYTES);
/// พื้นที่ต่อคน — นับรวมรูปในถังขยะด้วย จนกว่าจะลบถาวร
export const QUOTA_BYTES_PER_USER = 500 * 1024 * 1024;
export const ASSET_TRASH_RETENTION_DAYS = 30;

/// เก็บรูปบนดิสก์ของ backend แล้วเสิร์ฟผ่าน API ที่ต้องมี session เท่านั้น
/// (ใช้แทน S3/MinIO ซึ่งไม่อยู่ใน whitelist) — ไฟล์ไม่เคยเปิดเป็นสาธารณะ
@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  private readonly root = resolve(process.env.LOCAL_STORAGE_DIR ?? './storage-dev');

  constructor(private readonly prisma: PrismaService) {}

  async list(coreUserId: string, query: ListAssetsQuery) {
    if (query.trashed) await this.purgeExpiredTrash(coreUserId);

    const where = {
      coreUserId,
      trashedAt: query.trashed ? { not: null } : null,
      ...(query.q ? { fileName: { contains: query.q, mode: 'insensitive' as const } } : {}),
      ...(query.mimeType ? { mimeType: query.mimeType } : query.kind ? { mimeType: { startsWith: `${query.kind}/` } } : {}),
      ...(query.folderId ? { folderId: query.folderId } : {}),
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

  async upload(coreUserId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('กรุณาแนบไฟล์ในช่อง file');

    const image = sniffImage(file.buffer);
    const media = image ? null : sniffMedia(file.buffer);
    const mimeType = image ?? media;

    if (!mimeType) {
      throw new BadRequestException('รองรับเฉพาะรูป PNG, JPEG, WebP, GIF, SVG · วิดีโอ MP4, WebM · เสียง MP3, M4A, OGG, WAV');
    }

    if (image && file.size > MAX_ASSET_BYTES) {
      throw new BadRequestException('ไฟล์รูปใหญ่เกิน 10 MB');
    }

    if (media && file.size > MAX_MEDIA_BYTES) {
      throw new BadRequestException('ไฟล์วิดีโอหรือเสียงใหญ่เกิน 50 MB');
    }

    const used = await this.usedBytes(coreUserId);

    if (used + file.size > QUOTA_BYTES_PER_USER) {
      throw new ConflictException('พื้นที่เก็บไฟล์เต็มแล้ว ลบไฟล์ที่ไม่ใช้ออกจากถังขยะก่อน');
    }

    const id = randomUUID();
    const storagePath = `${id}.${image ? IMAGE_EXTENSIONS[image] : MEDIA_EXTENSIONS[media!]}`;

    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, storagePath), file.buffer);

    const row = await this.prisma.asset.create({
      data: {
        id,
        coreUserId,
        fileName: cleanFileName(file.originalname),
        mimeType,
        sizeBytes: file.size,
        storagePath,
      },
    });

    return toDto(row);
  }

  /// เจ้าของเปิดไฟล์ได้เสมอ · คนอื่นเปิดได้เมื่อไฟล์นั้นอยู่ในงานของเจ้าของที่เปิดแชร์ด้วยลิงก์
  /// (ไม่งั้นคนที่ได้ลิงก์จะเห็นงานแต่รูปหายหมด) · คืนที่อยู่ไฟล์ให้ controller ส่งเป็นช่วงไบต์ได้ (วิดีโอ/เสียง)
  async content(coreUserId: string, id: string) {
    const row = await this.prisma.asset.findUnique({ where: { id } });

    if (!row) throw new NotFoundException('ไม่พบรูปนี้ อาจถูกลบไปแล้ว');

    if (row.coreUserId !== coreUserId && (row.trashedAt !== null || !(await this.sharedInDesign(row)))) {
      throw new NotFoundException('ไม่พบรูปนี้ อาจถูกลบไปแล้ว');
    }

    const path = join(this.root, row.storagePath);

    try {
      const info = await stat(path);

      return { row, path, size: info.size };
    } catch {
      throw new NotFoundException('ไม่พบไฟล์นี้ในที่เก็บ');
    }
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

  private async deleteRow(row: Asset) {
    await this.prisma.asset.delete({ where: { id: row.id } });
    await rm(join(this.root, row.storagePath), { force: true }).catch((error: unknown) => {
      this.logger.warn(JSON.stringify({ event: 'asset.file_remove_failed', id: row.id, error: String(error) }));
    });
  }
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
    createdAt: row.createdAt.toISOString(),
  };
}
