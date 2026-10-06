import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { ApiEnvelope, ApiEnvelopeList } from '../../common/http/api-envelope.decorator.js';
import { DeletedDto } from '../designs/dto/design.dto.js';
import { AssetsService, MAX_UPLOAD_BYTES } from './assets.service.js';
import { parseByteRange } from './byte-range.js';
import { ASSET_TYPES, AssetDto, ListAssetsQuery, UpdateAssetDto, UploadAssetDto } from './dto/asset.dto.js';

const UUID = new ParseUUIDPipe({ version: '4' });

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @ApiOperation({ summary: 'ไฟล์ที่ฉันอัปโหลด (หรือไฟล์ในถังขยะ) · กรองชนิดด้วย kind (image, video, audio, font) · ภาพที่นำเข้าด้วย imported/source' })
  @ApiEnvelopeList(AssetDto)
  list(@CurrentUser() user: CoreHubUser, @Query() query: ListAssetsQuery) {
    return this.assets.list(user.coreUserId, query);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    // +1 ไบต์เพื่อให้ service เห็นว่าเกินแล้วตอบ 400 ภาษาไทยเอง
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadAssetDto })
  @ApiOperation({ summary: 'อัปโหลดรูป วิดีโอ เสียง หรือฟอนต์ของฉันไว้ใช้ในงาน · แนบแหล่งที่มาได้ (sourceUrl, sourceSite) เมื่อนำเข้าจากเว็บอื่น' })
  @ApiEnvelope(AssetDto, { status: 201 })
  upload(
    @CurrentUser() user: CoreHubUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() fields: UploadAssetDto,
  ) {
    return this.assets.upload(user.coreUserId, file, { sourceUrl: fields.sourceUrl, sourceSite: fields.sourceSite });
  }

  @Get(':id/content')
  @ApiProduces(...ASSET_TYPES)
  @ApiOperation({
    summary: 'ไฟล์รูป/วิดีโอ/เสียง/ฟอนต์ (เจ้าของ หรือผู้ได้ลิงก์ของงานที่ใช้ไฟล์นี้ · ไม่ห่อ envelope เพราะเป็นไบต์ · รองรับหัว Range)',
  })
  async content(
    @CurrentUser() user: CoreHubUser,
    @Param('id', UUID) id: string,
    @Headers('range') range: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ) {
    const { row, bytes } = await this.assets.content(user.coreUserId, id);
    const size = bytes.length;
    const part = parseByteRange(range, size);
    const etag = row.sha256 ? `"${row.sha256}"` : null;

    response.setHeader('Content-Type', row.mimeType);
    // ตรวจสิทธิ์ทุกครั้ง (deployment.md ข้อ 4.3) — no-cache ให้เบราว์เซอร์ถามใหม่ทุกครั้ง แต่ได้ 304 เมื่อไฟล์ไม่เปลี่ยน
    response.setHeader('Cache-Control', 'private, no-cache');
    if (etag) response.setHeader('ETag', etag);
    // ชื่อไฟล์ตอนบันทึก — รูปใน <img>/<video> ไม่สนหัวนี้ แต่เปิดลิงก์ตรง ๆ จะดาวน์โหลดแทนการแสดงในหน้า
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Accept-Ranges', 'bytes');
    // SVG มีสคริปต์ได้ — ถ้าใครเปิดไฟล์ตรง ๆ ก็รันอะไรไม่ได้
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");

    if (etag && !part && ifNoneMatch === etag) {
      response.status(304).end();
      return;
    }

    if (part === 'unsatisfiable') {
      response.status(416).setHeader('Content-Range', `bytes */${size}`);
      response.end();
      return;
    }

    const { start, end } = part ?? { start: 0, end: size - 1 };

    if (part) {
      response.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }

    response.setHeader('Content-Length', String(Math.max(0, end - start + 1)));

    response.end(size === 0 ? undefined : bytes.subarray(start, end + 1));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'เปลี่ยนชื่อไฟล์ · ย้ายรูปลงถังขยะ / กู้คืน' })
  @ApiEnvelope(AssetDto)
  update(
    @CurrentUser() user: CoreHubUser,
    @Param('id', UUID) id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assets.update(user.coreUserId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ลบรูปถาวร (เฉพาะที่อยู่ในถังขยะ)' })
  @ApiEnvelope(DeletedDto)
  remove(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.assets.remove(user.coreUserId, id);
  }
}
