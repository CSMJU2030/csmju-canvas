import { Module } from '@nestjs/common';
import { DesignCommentsController, CommentsController, CommentsService } from './comments.js';
import { DesignsController, DesignTypeUsagesController } from './designs.controller.js';
import { DesignsService } from './designs.service.js';
import { DesignVersionsController } from './versions.js';

@Module({
  controllers: [DesignsController, DesignTypeUsagesController, DesignVersionsController, DesignCommentsController, CommentsController],
  providers: [DesignsService, CommentsService],
  exports: [DesignsService],
})
export class DesignsModule {}
