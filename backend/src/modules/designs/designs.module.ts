import { Module } from '@nestjs/common';
import { DesignsController, DesignTypeUsagesController } from './designs.controller.js';
import { DesignsService } from './designs.service.js';

@Module({
  controllers: [DesignsController, DesignTypeUsagesController],
  providers: [DesignsService],
  exports: [DesignsService],
})
export class DesignsModule {}
