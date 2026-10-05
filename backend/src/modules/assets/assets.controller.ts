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
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
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
  @ApiOperation({ summary: 'ไฟล์ที่ฉันอัปโหลด (หรือไฟล์ในถังขยะ) · กรองชนิดด้วย kind · ภาพที่นำเข้าด้วย imported/source' })
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
  @ApiOperation({ summary: 'อัปโหลดรูป วิดีโอ หรือเสียงไว้ใช้ในงาน · แนบแหล่งที่มาได้ (sourceUrl, sourceSite) เมื่อนำเข้าจากเว็บอื่น' })
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
    summary: 'ไฟล์รูป/วิดีโอ/เสียง (เจ้าของ หรือผู้ได้ลิงก์ของงานที่ใช้ไฟล์นี้ · ไม่ห่อ envelope เพราะเป็นไบต์ · รองรับหัว Range)',
  })
  async content(
    @CurrentUser() user: CoreHubUser,
    @Param('id', UUID) id: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    const { row, path, size } = await this.assets.content(user.coreUserId, id);
    const part = parseByteRange(range, size);

    response.setHeader('Content-Type', row.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=86400');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Accept-Ranges', 'bytes');
    // SVG มีสคริปต์ได้ — ถ้าใครเปิดไฟล์ตรง ๆ ก็รันอะไรไม่ได้
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");

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

    if (size === 0) {
      response.end();
      return;
    }

    await pipeline(createReadStream(path, { start, end }), response).catch(() => {
      // ผู้ชมเลื่อนวิดีโอหรือปิดหน้าไประหว่างส่ง — ไม่ใช่ข้อผิดพลาดของระบบ
      if (!response.headersSent) response.status(404);
      response.end();
    });
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
