import {
  Body,
  Controller,
  Delete,
  Get,
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
import { AssetsService, MAX_ASSET_BYTES } from './assets.service.js';
import { AssetDto, ListAssetsQuery, UpdateAssetDto, UploadAssetDto } from './dto/asset.dto.js';

const UUID = new ParseUUIDPipe({ version: '4' });

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @ApiOperation({ summary: 'รูปที่ฉันอัปโหลด (หรือรูปในถังขยะ)' })
  @ApiEnvelopeList(AssetDto)
  list(@CurrentUser() user: CoreHubUser, @Query() query: ListAssetsQuery) {
    return this.assets.list(user.coreUserId, query);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    // +1 ไบต์เพื่อให้ service เห็นว่าเกินแล้วตอบ 400 ภาษาไทยเอง
    FileInterceptor('file', { limits: { fileSize: MAX_ASSET_BYTES + 1, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadAssetDto })
  @ApiOperation({ summary: 'อัปโหลดรูปไว้ใช้ในงาน' })
  @ApiEnvelope(AssetDto, { status: 201 })
  upload(@CurrentUser() user: CoreHubUser, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.assets.upload(user.coreUserId, file);
  }

  @Get(':id/content')
  @ApiProduces('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml')
  @ApiOperation({ summary: 'ไฟล์รูป (เฉพาะเจ้าของ · ไม่ห่อ envelope เพราะเป็นไบต์)' })
  async content(
    @CurrentUser() user: CoreHubUser,
    @Param('id', UUID) id: string,
    @Res() response: Response,
  ) {
    const { row, bytes } = await this.assets.content(user.coreUserId, id);

    response.setHeader('Content-Type', row.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=86400');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // SVG มีสคริปต์ได้ — ถ้าใครเปิดไฟล์ตรง ๆ ก็รันอะไรไม่ได้
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    response.send(bytes);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ย้ายรูปลงถังขยะ / กู้คืน' })
  @ApiEnvelope(AssetDto)
  update(
    @CurrentUser() user: CoreHubUser,
    @Param('id', UUID) id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assets.setTrashed(user.coreUserId, id, dto.trashed);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ลบรูปถาวร (เฉพาะที่อยู่ในถังขยะ)' })
  @ApiEnvelope(DeletedDto)
  remove(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.assets.remove(user.coreUserId, id);
  }
}
