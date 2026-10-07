import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';
import { BrandKitsModule } from './modules/brand-kits/brand-kits.js';
import { PresenceModule } from './modules/presence/presence.gateway.js';
import { AdminStatsModule } from './modules/admin-stats/admin-stats.module.js';
import { AuditLogsModule } from './modules/audit/audit-logs.js';
import { AuditModule } from './modules/audit/audit.js';
import { DataExportsModule } from './modules/data-exports/data-exports.js';
import { DeletedDesignsModule } from './modules/deleted-designs/deleted-designs.module.js';
import { DesignsModule } from './modules/designs/designs.module.js';
import { FeedbacksModule } from './modules/feedbacks/feedbacks.js';
import { FoldersModule } from './modules/folders/folders.js';
import { AssetFoldersModule } from './modules/asset-folders/asset-folders.js';
import { MembersModule } from './modules/members/members.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PreferencesModule } from './modules/preferences/preferences.js';
import { QuotasModule } from './modules/quotas/quotas.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { TemplatesModule } from './modules/templates/templates.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // งานตามเวลา: ลบงานที่ครบกำหนดเก็บ 30 วัน (deleted-designs/retention.service.ts)
    ScheduleModule.forRoot(),
    PrismaModule,
    // @Global — งานและเทมเพลตสร้างแจ้งเตือนได้โดยไม่ต้อง import
    NotificationsModule,
    // @Global — ทุกโมดูลบันทึก audit log ได้
    AuditModule,
    AuthModule,
    HealthModule,
    DesignsModule,
    TemplatesModule,
    AssetsModule,
    FoldersModule,
    BrandKitsModule,
    PresenceModule,
    AssetFoldersModule,
    PreferencesModule,
    QuotasModule,
    DataExportsModule,
    FeedbacksModule,
    MembersModule,
    AdminStatsModule,
    AuditLogsModule,
    ReportsModule,
    DeletedDesignsModule,
  ],
})
export class AppModule {}
