import { Module } from '@nestjs/common';
import { AdminActivityController, AdminOverviewController } from './admin-stats.controller.js';
import { AdminStatsService } from './admin-stats.service.js';

@Module({
  controllers: [AdminOverviewController, AdminActivityController],
  providers: [AdminStatsService],
})
export class AdminStatsModule {}
