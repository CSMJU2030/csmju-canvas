import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';
import { DataExportsModule } from './modules/data-exports/data-exports.js';
import { DesignsModule } from './modules/designs/designs.module.js';
import { FoldersModule } from './modules/folders/folders.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PreferencesModule } from './modules/preferences/preferences.js';
import { QuotasModule } from './modules/quotas/quotas.js';
import { TemplatesModule } from './modules/templates/templates.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    // @Global — งานและเทมเพลตสร้างแจ้งเตือนได้โดยไม่ต้อง import
    NotificationsModule,
    AuthModule,
    HealthModule,
    DesignsModule,
    TemplatesModule,
    AssetsModule,
    FoldersModule,
    PreferencesModule,
    QuotasModule,
    DataExportsModule,
  ],
})
export class AppModule {}
