import { Module } from '@nestjs/common';
import { TemplateFavoritesController, TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';

@Module({
  controllers: [TemplatesController, TemplateFavoritesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
