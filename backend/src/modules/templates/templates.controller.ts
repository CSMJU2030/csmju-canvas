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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CoreHubUser } from '../../common/auth/core-user.js';
import { Layer2Roles } from '../../common/auth/layer2-roles.decorator.js';
import {
  ApiEnvelope,
  ApiEnvelopeError,
  ApiEnvelopeList,
} from '../../common/http/api-envelope.decorator.js';
import { DeletedDto } from '../designs/dto/design.dto.js';
import {
  CreateFavoriteDto,
  CreateTemplateDto,
  FavoriteDto,
  ListTemplatesQuery,
  TemplateDto,
  TemplateSummaryDto,
  UpdateTemplateDto,
} from './dto/template.dto.js';
import { TemplatesService } from './templates.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'เทมเพลตทั้งหมด (ยอดนิยม · ล่าสุด · กรองประเภท/หมวด/เจ้าของ)' })
  @ApiEnvelopeList(TemplateSummaryDto)
  list(@CurrentUser() user: CoreHubUser, @Query() query: ListTemplatesQuery) {
    return this.templates.list(user, query);
  }

  @Post()
  @HttpCode(201)
  @Layer2Roles('EDITOR', 'ADMIN')
  @ApiOperation({ summary: 'เผยแพร่งานเป็นเทมเพลต (อาจารย์ บุคลากร และผู้ดูแลเท่านั้น)' })
  @ApiEnvelope(TemplateDto, { status: 201 })
  @ApiEnvelopeError(403, 'นักศึกษาและผู้เยี่ยมชมเผยแพร่เทมเพลตไม่ได้')
  create(@CurrentUser() user: CoreHubUser, @Body() dto: CreateTemplateDto) {
    return this.templates.create(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'เทมเพลตหนึ่งชิ้นพร้อม JSON state' })
  @ApiEnvelope(TemplateDto)
  get(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.templates.get(user, id);
  }

  @Patch(':id')
  @Layer2Roles('EDITOR', 'ADMIN')
  @ApiOperation({ summary: 'แก้ชื่อ คำอธิบาย หรือหมวดของเทมเพลต' })
  @ApiEnvelope(TemplateDto)
  update(
    @CurrentUser() user: CoreHubUser,
    @Param('id', UUID) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.update(user, id, dto);
  }

  @Delete(':id')
  @Layer2Roles('EDITOR', 'ADMIN')
  @ApiOperation({ summary: 'เลิกเผยแพร่เทมเพลต' })
  @ApiEnvelope(DeletedDto)
  remove(@CurrentUser() user: CoreHubUser, @Param('id', UUID) id: string) {
    return this.templates.remove(user, id);
  }
}

/// ติดดาว/เลิกติดดาวเทมเพลต (คอนเทนต์ติดดาว) — เป็นของแต่ละคน ไม่กระทบคนอื่น
@ApiTags('templates')
@Controller('template-favorites')
export class TemplateFavoritesController {
  constructor(private readonly templates: TemplatesService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'ติดดาวเทมเพลต' })
  @ApiEnvelope(FavoriteDto, { status: 201 })
  create(@CurrentUser() user: CoreHubUser, @Body() dto: CreateFavoriteDto) {
    return this.templates.favorite(user, dto.templateId);
  }

  @Delete(':templateId')
  @ApiOperation({ summary: 'เลิกติดดาวเทมเพลต' })
  @ApiEnvelope(DeletedDto)
  remove(@CurrentUser() user: CoreHubUser, @Param('templateId', UUID) templateId: string) {
    return this.templates.unfavorite(user, templateId);
  }
}
